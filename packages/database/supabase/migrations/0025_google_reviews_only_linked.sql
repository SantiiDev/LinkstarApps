-- ============================================================================
-- LINKSTAR — 0025: reseñas sólo de las fichas que el cliente vinculó
-- ============================================================================
-- La 0024 leía las reseñas de TODAS las fichas que veía el usuario de Google
-- que conectó, estuvieran vinculadas a una sucursal o no. Apareció el caso real
-- en la primera prueba contra Google: la cuenta conectada administra también la
-- ficha de un cliente ("Vineria Martu"), y sus reseñas —con nombre de autor y
-- texto— iban a quedar guardadas dentro de una organización que no es la suya.
-- El RLS no las filtraba a nadie de afuera, pero guardarlas ya es demasiado:
-- son datos de un tercero que nadie pidió.
--
-- La regla desde acá: una ficha sin sucursal vinculada aporta nombre,
-- dirección y place_id —lo justo para ofrecerla al vincular— y nada más. Las
-- reseñas se leen sólo de las fichas vinculadas, y se borran cuando la ficha
-- deja de estarlo. El cliente decide qué ficha es suya al vincularla.
--
-- "Vinculada" quiere decir vinculada a una sucursal VIVA. Los borrados de
-- sucursales son lógicos (deleted_at), así que la FK on delete set null de la
-- 0024 no se dispara nunca: una ficha cuya sucursal se borró seguía apuntando a
-- ella y recibiendo snapshots. Eso también se corrige acá.
--
-- Corrección de una migración aplicada → migración nueva, nunca editar la 0024
-- (ver CLAUDE.md, el caso 0013 → 0017).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Poda: desvincula lo que apunta a sucursales borradas y borra las reseñas de
-- las fichas sin sucursal. Idempotente: correrla dos veces no cambia nada.
-- La llaman el sync (antes de leer) y link_google_location() (después de
-- cambiar un vínculo), así un desvínculo manual no espera a la próxima corrida.
-- ---------------------------------------------------------------------------
create or replace function private.google_prune_unlinked_reviews(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  -- 1. Una sucursal borrada no es un vínculo. Se suelta, para que el
  --    autovínculo por place_id pueda volver a usar la ficha con una sucursal
  --    nueva (el índice único de location_id no lo bloquea: queda en NULL).
  update public.google_locations gl
     set location_id = null
   where gl.organization_id = p_org
     and gl.location_id is not null
     and exists (
       select 1 from public.locations l
       where l.id = gl.location_id and l.deleted_at is not null
     );

  -- 2. Las reseñas de las fichas sin sucursal se van.
  delete from public.google_reviews r
   using public.google_locations gl
   where r.google_location_id = gl.id
     and gl.organization_id = p_org
     and gl.location_id is null;
  get diagnostics v_rows = row_count;

  -- 3. Y con ellas los totales que se habían leído de esa ficha.
  update public.google_locations gl
     set total_reviews = null,
         average_rating = null,
         reviews_synced_at = null
   where gl.organization_id = p_org
     and gl.location_id is null
     and (gl.total_reviews is not null or gl.average_rating is not null or gl.reviews_synced_at is not null);

  return v_rows;
end;
$$;

revoke all on function private.google_prune_unlinked_reviews(uuid) from public, anon, authenticated;

-- Wrapper para el sync (service_role, por PostgREST), mismo criterio que el
-- resto de las RPC de la 0024.
create or replace function public.google_prune_unlinked_reviews(p_org uuid)
returns integer
language sql
security definer
set search_path = public, private, pg_temp
as $$ select private.google_prune_unlinked_reviews(p_org); $$;

revoke all on function public.google_prune_unlinked_reviews(uuid) from public, anon, authenticated;
grant execute on function public.google_prune_unlinked_reviews(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- link_google_location(): igual que en la 0024, más la poda al final. Al
-- desvincular (p_location_id NULL), o al pasarle la sucursal a otra ficha, las
-- reseñas de la ficha que quedó suelta se borran en el acto.
-- ---------------------------------------------------------------------------
create or replace function public.link_google_location(
  p_google_location_id uuid,
  p_location_id        uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gl public.google_locations%rowtype;
begin
  select * into v_gl from public.google_locations where id = p_google_location_id;

  if v_gl.id is null
     or not (v_gl.organization_id = any (private.orgs_rw_with_access())) then
    raise exception 'Ficha inexistente' using errcode = '42501';
  end if;

  -- Liberar la sucursal si otra ficha la tenía: el índice único no deja dos.
  if p_location_id is not null then
    update public.google_locations
       set location_id = null
     where location_id = p_location_id
       and id <> p_google_location_id
       and organization_id = v_gl.organization_id;
  end if;

  -- El trigger google_locations_check_same_org rechaza una sucursal ajena o
  -- borrada.
  update public.google_locations
     set location_id = p_location_id
   where id = p_google_location_id;

  if p_location_id is not null and v_gl.place_id is not null then
    update public.locations
       set google_place_id = v_gl.place_id
     where id = p_location_id
       and google_place_id is null;
  end if;

  perform private.google_prune_unlinked_reviews(v_gl.organization_id);

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_gl.organization_id, auth.uid(), 'google.location_linked', 'google_location',
          p_google_location_id, jsonb_build_object('location_id', p_location_id));
end;
$$;


-- ---------------------------------------------------------------------------
-- record_google_review_snapshot(): sólo para fichas vinculadas a una sucursal
-- viva. La versión de la 0024 aceptaba una sucursal borrada.
-- ---------------------------------------------------------------------------
create or replace function public.record_google_review_snapshot(
  p_google_location_id uuid,
  p_total_reviews      integer,
  p_average_rating     numeric,
  p_raw                jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid;
  v_location uuid;
begin
  select gl.organization_id, gl.location_id
    into v_org, v_location
    from public.google_locations gl
    join public.locations l on l.id = gl.location_id and l.deleted_at is null
   where gl.id = p_google_location_id;

  if v_location is null then
    return false;
  end if;

  insert into public.location_review_snapshots
    (organization_id, location_id, source, captured_on, captured_at,
     total_reviews, average_rating, raw)
  values
    (v_org, v_location, 'google', current_date, now(),
     p_total_reviews, p_average_rating, p_raw)
  on conflict (location_id, source, captured_on) do update
    set total_reviews  = excluded.total_reviews,
        average_rating = excluded.average_rating,
        captured_at    = excluded.captured_at,
        raw            = excluded.raw;

  return true;
end;
$$;


-- ---------------------------------------------------------------------------
-- Limpieza de lo que ya se haya guardado con la regla vieja.
-- ---------------------------------------------------------------------------
select private.google_prune_unlinked_reviews(c.organization_id)
from public.google_connections c;


comment on function public.google_prune_unlinked_reviews(uuid) is
  'Desvincula fichas de sucursales borradas y borra las reseñas de fichas sin sucursal. De una ficha no vinculada sólo se guardan nombre, dirección y place_id (0025).';
