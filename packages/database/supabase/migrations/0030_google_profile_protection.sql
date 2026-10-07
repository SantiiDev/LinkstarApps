-- ============================================================================
-- LINKSTAR — 0030: editar la ficha de Google, y la protección de ficha
-- ============================================================================
-- Fase 4.7 (primera mitad). La pantalla Perfil lee la ficha EN VIVO de Google
-- por el API y la edita en nombre del negocio, así que casi todo vive en
-- services/api. Acá queda lo que tiene que decidir la base:
--
--   google_location_write_target()   quién puede escribir en qué ficha. Es la
--                                    misma regla que responder reseñas (0026):
--                                    owner/admin todo, un manager sus sucursales,
--                                    un viewer nada; sólo fichas vinculadas a una
--                                    sucursal viva. La usan también las
--                                    publicaciones (0031).
--
--   google_profile_changes           la PROTECCIÓN DE FICHA (Business). Google
--                                    edita fichas por su cuenta —con sugerencias
--                                    de usuarios o datos de terceros— y a veces
--                                    cambia el teléfono, el horario o marca el
--                                    local como cerrado. El job diario pregunta
--                                    por ficha qué cambió Google (getGoogleUpdated),
--                                    y cada cambio nuevo queda acá y se avisa por
--                                    mail. El panel ofrece «Revertir» y «Está
--                                    bien». Nunca se revierte solo: si el cambio
--                                    lo hizo el dueño desde Google, revertirlo
--                                    automáticamente le pisaría su propia edición.
--
-- ── Cuándo se vuelve a avisar ─────────────────────────────────────────────
-- Un cambio que Google mantiene aparece en TODAS las corridas. Lo que evita el
-- mail diario es `fingerprint` (los campos + los valores de Google): un cambio
-- pendiente o aceptado con la misma huella no se registra de nuevo. Uno
-- revertido sí: si Google vuelve a meter lo mismo después de revertirlo, es
-- noticia otra vez. Si Google deja de mostrar un cambio pendiente (el dueño lo
-- arregló en Google, o Google lo retiró), pasa a 'cleared'.
--
-- ── El valor nuevo del enum ────────────────────────────────────────────────
-- 'profile_changed' se agrega a notification_kind y NO se usa en esta
-- migración: un valor de enum recién agregado no se puede usar dentro de la
-- misma transacción.
-- ============================================================================


alter type public.notification_kind add value if not exists 'profile_changed';


-- ---------------------------------------------------------------------------
-- 1. QUIÉN PUEDE ESCRIBIR EN UNA FICHA
-- ---------------------------------------------------------------------------
create or replace function public.google_location_write_target(
  p_user             uuid,
  p_google_location  uuid,
  p_require_business boolean default false
)
returns table (
  organization_id uuid,
  google_account  text,
  google_location text,
  location_id     uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid;
  v_account  text;
  v_location text;
  v_branch   uuid;
  v_role     public.org_role;
begin
  select gl.organization_id, gl.google_account, gl.google_location, gl.location_id
    into v_org, v_account, v_location, v_branch
    from public.google_locations gl
    join public.locations l on l.id = gl.location_id and l.deleted_at is null
   where gl.id = p_google_location;

  if v_org is null then
    raise exception 'ficha_inexistente';
  end if;

  select m.role into v_role
    from public.memberships m
   where m.organization_id = v_org and m.user_id = p_user;

  if v_role is null
     or v_role = 'viewer'
     or (v_role = 'manager' and not exists (
           select 1
             from public.memberships m
             join public.membership_locations ml on ml.membership_id = m.id
            where m.organization_id = v_org
              and m.user_id = p_user
              and ml.location_id = v_branch
         )) then
    raise exception 'rol_insuficiente';
  end if;

  if not public.org_has_access(v_org) then
    raise exception 'sin_acceso';
  end if;

  if p_require_business and not private.org_has_business(v_org) then
    raise exception 'solo_business';
  end if;

  return query select v_org, v_account, v_location, v_branch;
end;
$$;

revoke all on function public.google_location_write_target(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.google_location_write_target(uuid, uuid, boolean) to service_role;


-- ---------------------------------------------------------------------------
-- 2. CAMBIOS DETECTADOS
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'google_profile_change_status') then
    create type public.google_profile_change_status as enum ('pending', 'reverted', 'accepted', 'cleared');
  end if;
end $$;

create table if not exists public.google_profile_changes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  google_location_id uuid not null references public.google_locations(id) on delete cascade,
  detected_at        timestamptz not null default now(),
  -- diffMask de Google: los campos que cambió ('phoneNumbers', 'regularHours'…).
  fields             text[] not null check (cardinality(fields) > 0),
  google_values      jsonb not null,   -- lo que Google muestra ahora
  owner_values       jsonb not null,   -- lo que había cargado el negocio
  fingerprint        text not null,
  status             public.google_profile_change_status not null default 'pending',
  resolved_by        uuid references auth.users(id) on delete set null,
  resolved_at        timestamptz
);

create unique index if not exists google_profile_changes_open_uq
  on public.google_profile_changes (google_location_id, fingerprint)
  where status in ('pending', 'accepted');

create index if not exists google_profile_changes_org_idx
  on public.google_profile_changes (organization_id, detected_at desc);

alter table public.google_profile_changes enable row level security;
alter table public.google_profile_changes force row level security;
revoke all on public.google_profile_changes from anon;
revoke insert, update, delete, truncate on public.google_profile_changes from authenticated;
grant select on public.google_profile_changes to authenticated;

-- Mismo alcance que las reseñas (0024), más Business.
drop policy if exists google_profile_changes_select on public.google_profile_changes;
create policy google_profile_changes_select on public.google_profile_changes
  for select to authenticated
  using (
    private.org_has_business(organization_id)
    and (
      organization_id = any ((select unnest(
        private.orgs_with_access(array['owner','admin','viewer']::public.org_role[])
      )))
      or google_location_id in (
        select gl.id from public.google_locations gl
        where gl.location_id = any ((select unnest(private.visible_location_ids())))
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 3. RPC DEL JOB Y DEL API — sólo service_role
-- ---------------------------------------------------------------------------

-- Registra un cambio si es nuevo. Devuelve el id si hay que avisar, null si ya
-- se conocía (pendiente o aceptado con la misma huella).
create or replace function public.google_record_profile_change(
  p_google_location uuid,
  p_fields          text[],
  p_google_values   jsonb,
  p_owner_values    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org         uuid;
  v_fingerprint text;
  v_id          uuid;
begin
  select gl.organization_id into v_org
    from public.google_locations gl
   where gl.id = p_google_location and gl.location_id is not null;
  if v_org is null then
    return null;
  end if;

  v_fingerprint := md5(array_to_string(array(select unnest(p_fields) order by 1), ',')
                       || '|' || coalesce(p_google_values::text, ''));

  insert into public.google_profile_changes
    (organization_id, google_location_id, fields, google_values, owner_values, fingerprint)
  values
    (v_org, p_google_location, p_fields, p_google_values, p_owner_values, v_fingerprint)
  on conflict (google_location_id, fingerprint) where status in ('pending', 'accepted')
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- Google ya no muestra cambios en esta ficha: lo que estaba pendiente se cierra.
create or replace function public.google_clear_profile_changes(p_google_location uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with updated as (
    update public.google_profile_changes
       set status = 'cleared', resolved_at = now()
     where google_location_id = p_google_location and status = 'pending'
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- «Revertir» / «Está bien». Valida con la misma regla que escribir en la ficha
-- (exige Business) y deja registro. Devuelve lo que el API necesita para
-- revertir en Google.
create or replace function public.google_resolve_profile_change(
  p_change uuid,
  p_user   uuid,
  p_status public.google_profile_change_status
)
returns table (
  google_location_id uuid,
  google_location    text,
  fields             text[],
  owner_values       jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_change public.google_profile_changes;
  v_target record;
begin
  if p_status not in ('reverted', 'accepted') then
    raise exception 'estado_invalido';
  end if;

  select * into v_change
    from public.google_profile_changes c
   where c.id = p_change and c.status = 'pending'
   for update;
  if not found then
    raise exception 'cambio_inexistente';
  end if;

  select * into v_target
    from public.google_location_write_target(p_user, v_change.google_location_id, true);

  update public.google_profile_changes
     set status = p_status, resolved_by = p_user, resolved_at = now()
   where id = p_change;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_change.organization_id, p_user,
          case when p_status = 'reverted' then 'google.profile_change_reverted' else 'google.profile_change_accepted' end,
          'google_profile_change', p_change,
          jsonb_build_object('fields', v_change.fields));

  return query select v_change.google_location_id, v_target.google_location, v_change.fields, v_change.owner_values;
end;
$$;

-- A quién avisar: misma regla que pending_notifications() (0023) — la casilla
-- elegida en Automatizaciones, o la de quien creó la organización.
create or replace function public.org_alert_recipient(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(np.recipient_email::text, u.email::text)
    from public.organizations o
    left join public.notification_preferences np on np.organization_id = o.id
    left join auth.users u on u.id = o.created_by
   where o.id = p_org;
$$;

-- Organizaciones Business, para que el job no le pregunte a Google por fichas
-- de cuentas gratis.
create or replace function public.org_has_business(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select private.org_has_business(p_org); $$;

revoke all on function public.google_record_profile_change(uuid, text[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.google_clear_profile_changes(uuid) from public, anon, authenticated;
revoke all on function public.google_resolve_profile_change(uuid, uuid, public.google_profile_change_status) from public, anon, authenticated;
revoke all on function public.org_alert_recipient(uuid) from public, anon, authenticated;
revoke all on function public.org_has_business(uuid) from public, anon, authenticated;
grant execute on function public.google_record_profile_change(uuid, text[], jsonb, jsonb) to service_role;
grant execute on function public.google_clear_profile_changes(uuid) to service_role;
grant execute on function public.google_resolve_profile_change(uuid, uuid, public.google_profile_change_status) to service_role;
grant execute on function public.org_alert_recipient(uuid) to service_role;
grant execute on function public.org_has_business(uuid) to service_role;

comment on table public.google_profile_changes is
  'Protección de ficha (Business): cambios que Google hizo por su cuenta en una ficha vinculada. Los detecta el job diario; el panel los revierte o los acepta. Nunca se revierte solo.';
