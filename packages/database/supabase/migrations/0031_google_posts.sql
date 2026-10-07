-- ============================================================================
-- LINKSTAR — 0031: publicaciones en la ficha de Google, y quién puede leerla
-- ============================================================================
-- Fase 4.7 (segunda mitad). Las publicaciones (novedades, ofertas, eventos) se
-- crean en Google desde el panel, en el acto: programarlas queda para después
-- (ver el roadmap). Lo que decide la base:
--
--   google_location_read_target()  quién puede VER una ficha en vivo (pantalla
--                                  Perfil, lista de publicaciones). Como
--                                  escribir (0030), pero un viewer también, y
--                                  sin exigir Business.
--
--   google_posts                   lo que publicamos nosotros. Google es la
--                                  fuente de verdad de las publicaciones (la
--                                  lista se lee en vivo); esta tabla existe para
--                                  contar el cupo del plan gratis y dejar rastro
--                                  de quién publicó qué.
--
--   google_post_reserve()          el CUPO: el plan gratis tiene 1 publicación
--                                  por mes calendario (hora de Argentina), como
--                                  Tapstar; Business, sin límite. La reserva se
--                                  hace ANTES de llamar a Google y bloqueando la
--                                  organización, así dos pestañas no publican
--                                  dos veces con el mismo cupo. Si Google
--                                  rechaza, el API suelta la reserva y el cupo
--                                  no se consume. Borrar una publicación NO
--                                  devuelve el cupo: si no, publicar y borrar
--                                  sería ilimitado.
--
--   bucket google-post-media       las fotos. PÚBLICO a propósito: Google baja la
--                                  foto desde la URL que le pasamos. Cada
--                                  organización escribe sólo en su carpeta.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. QUIÉN PUEDE VER UNA FICHA
-- ---------------------------------------------------------------------------
create or replace function public.google_location_read_target(p_user uuid, p_google_location uuid)
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

  return query select v_org, v_account, v_location, v_branch;
end;
$$;

revoke all on function public.google_location_read_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.google_location_read_target(uuid, uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 2. PUBLICACIONES
-- ---------------------------------------------------------------------------
create table if not exists public.google_posts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  google_location_id uuid not null references public.google_locations(id) on delete cascade,
  -- 'accounts/1/locations/2/localPosts/3'. Null mientras la reserva espera a Google.
  google_post_name   text,
  topic_type         text not null check (topic_type in ('STANDARD', 'EVENT', 'OFFER')),
  summary            text,
  media_url          text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index if not exists google_posts_org_created_idx
  on public.google_posts (organization_id, created_at desc);

alter table public.google_posts enable row level security;
alter table public.google_posts force row level security;
revoke all on public.google_posts from anon;
revoke insert, update, delete, truncate on public.google_posts from authenticated;
grant select on public.google_posts to authenticated;

drop policy if exists google_posts_select on public.google_posts;
create policy google_posts_select on public.google_posts
  for select to authenticated
  using (
    organization_id = any ((select unnest(
      private.orgs_with_access(array['owner','admin','viewer']::public.org_role[])
    )))
    or google_location_id in (
      select gl.id from public.google_locations gl
      where gl.location_id = any ((select unnest(private.visible_location_ids())))
    )
  );


-- ---------------------------------------------------------------------------
-- 3. CUPO
-- ---------------------------------------------------------------------------
-- Publicaciones de este mes calendario en Argentina (las que no fallaron).
create or replace function private.google_posts_this_month(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.google_posts p
   where p.organization_id = p_org
     and date_trunc('month', p.created_at at time zone 'America/Argentina/Buenos_Aires')
       = date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires');
$$;

-- Para el banner del panel. `limite` null = sin límite (Business).
create or replace function public.google_post_quota(p_org uuid)
returns table (usadas integer, limite integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (p_org = any (private.orgs_with_access())) then
    raise exception 'No sos miembro de esa organización' using errcode = '42501';
  end if;
  return query
    select private.google_posts_this_month(p_org),
           case when private.org_has_business(p_org) then null else 1 end;
end;
$$;

revoke all on function private.google_posts_this_month(uuid) from public, anon, authenticated;
revoke all on function public.google_post_quota(uuid) from public, anon;
grant execute on function public.google_post_quota(uuid) to authenticated;

-- Reserva el cupo y registra la publicación antes de mandarla a Google.
create or replace function public.google_post_reserve(
  p_user            uuid,
  p_google_location uuid,
  p_topic_type      text,
  p_summary         text,
  p_media_url       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target record;
  v_id     uuid;
begin
  select * into v_target from public.google_location_write_target(p_user, p_google_location, false);

  -- Bloquea la organización: dos pedidos simultáneos cuentan en fila.
  perform 1 from public.organizations o where o.id = v_target.organization_id for update;

  if not private.org_has_business(v_target.organization_id)
     and private.google_posts_this_month(v_target.organization_id) >= 1 then
    raise exception 'cupo_agotado';
  end if;

  insert into public.google_posts (organization_id, google_location_id, topic_type, summary, media_url, created_by)
  values (v_target.organization_id, p_google_location, p_topic_type, p_summary, p_media_url, p_user)
  returning id into v_id;

  return v_id;
end;
$$;

-- Google aceptó: se guarda su nombre y queda registro.
create or replace function public.google_post_confirm(p_post uuid, p_google_post_name text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.google_posts set google_post_name = p_google_post_name where id = p_post;
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  select p.organization_id, p.created_by, 'google.post_published', 'google_post', p.id,
         jsonb_build_object('topic_type', p.topic_type)
    from public.google_posts p where p.id = p_post;
$$;

-- Google rechazó: la reserva se suelta y el cupo no se consume.
create or replace function public.google_post_release(p_post uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.google_posts where id = p_post and google_post_name is null;
$$;

-- Se borró en Google: queda la fila (cuenta para el cupo) marcada como borrada.
create or replace function public.google_post_mark_deleted(p_google_post_name text, p_user uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.google_posts set deleted_at = now()
   where google_post_name = p_google_post_name and deleted_at is null;
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  select p.organization_id, p_user, 'google.post_deleted', 'google_post', p.id, '{}'::jsonb
    from public.google_posts p where p.google_post_name = p_google_post_name;
$$;

revoke all on function public.google_post_reserve(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.google_post_confirm(uuid, text) from public, anon, authenticated;
revoke all on function public.google_post_release(uuid) from public, anon, authenticated;
revoke all on function public.google_post_mark_deleted(text, uuid) from public, anon, authenticated;
grant execute on function public.google_post_reserve(uuid, uuid, text, text, text) to service_role;
grant execute on function public.google_post_confirm(uuid, text) to service_role;
grant execute on function public.google_post_release(uuid) to service_role;
grant execute on function public.google_post_mark_deleted(text, uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 4. FOTOS
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('google-post-media', 'google-post-media', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta del path es la organización: '<org_id>/<archivo>'.
-- Escriben owner/admin/manager con acceso; la regla fina por sucursal del
-- manager la vuelve a aplicar google_post_reserve() al publicar.
drop policy if exists google_post_media_insert on storage.objects;
create policy google_post_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'google-post-media'
    and (storage.foldername(name))[1] = any (
      select unnest(private.orgs_manage_with_access())::text
    )
  );

drop policy if exists google_post_media_delete on storage.objects;
create policy google_post_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'google-post-media'
    and (storage.foldername(name))[1] = any (
      select unnest(private.orgs_manage_with_access())::text
    )
  );

comment on table public.google_posts is
  'Publicaciones que el panel creó en Google. La lista real se lee en vivo de Google; esto cuenta el cupo del plan gratis (1 por mes) y deja rastro.';
