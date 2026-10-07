-- ============================================================================
-- LINKSTAR — 0024: Google Business Profile (conexión OAuth + reseñas)
-- ============================================================================
-- La fase 4: leer las reseñas de la ficha de Google del cliente. Hasta acá
-- `location_review_snapshots` no tenía quién la escribiera, así que todo lo que
-- depende de `review_deltas` (las "reseñas estimadas") estaba vacío.
--
-- Esto NO usa API key: la Business Profile API sólo se puede leer con OAuth en
-- nombre de alguien que administra la ficha. El cliente autoriza una vez desde
-- el panel (services/api/routes/google.js), nosotros guardamos el refresh token
-- y el job diario (services/api/scripts/sync-reviews.js) lo usa para pedir un
-- access token nuevo en cada corrida.
--
-- ---------------------------------------------------------------------------
-- Qué hay acá
-- ---------------------------------------------------------------------------
--   public.google_connections   una por organización: el ESTADO de la conexión
--                               (activa / hay que reautorizar, cuándo sincronizó,
--                               último error). Sin secretos: el panel la lee.
--   private.google_oauth_tokens el refresh token CIFRADO. En `private`, que
--                               PostgREST no expone, y además con RLS sin
--                               políticas. Sólo se toca por las RPC de abajo.
--   private.google_oauth_states los `state` del flujo OAuth en curso (anti-CSRF,
--                               de un solo uso, 10 minutos).
--   public.google_locations     las fichas que esa cuenta de Google administra,
--                               y a qué `locations` de Linkstar corresponde cada
--                               una. Es el puente: Google habla de
--                               "locations/123", el panel de sucursales.
--   public.google_reviews       las reseñas una por una.
--
-- ---------------------------------------------------------------------------
-- Por qué el token se cifra en la aplicación y no en la base
-- ---------------------------------------------------------------------------
-- La clave vive en services/api (GOOGLE_TOKEN_ENC_KEY), no acá. Así un volcado
-- de la base —un backup, un `select` con la service_role filtrada— no alcanza
-- para leer la ficha de Google de ningún cliente: hace falta además la clave del
-- servidor. Con pgsodium/Vault la clave estaría en la misma base que el dato.
-- La base guarda texto opaco y el `key_id` con el que se cifró, para poder rotar.
--
-- ---------------------------------------------------------------------------
-- Invariante 6 sigue valiendo
-- ---------------------------------------------------------------------------
-- El conteo total que devuelve Google por ubicación es la verdad, y es lo que va
-- a `location_review_snapshots`. Las reseñas individuales sirven para mostrarlas
-- y, más adelante, para sentimiento y palabras clave — NO para atribuirlas a un
-- empleado o a un expositor. Eso sigue siendo un prorrateo "estimado".
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. "¿Con qué organización está operando este usuario?" — parametrizado
-- ---------------------------------------------------------------------------
-- `private.active_org_id()` (0020) responde eso para auth.uid(). El API corre
-- con service_role y no tiene auth.uid(), pero necesita la MISMA respuesta: si
-- el botón "Conectar Google" vinculara la ficha a una organización distinta de
-- la que el panel está mostrando, el cliente conectaría su Google a una cuenta
-- que no está mirando. Por eso la regla se extrae acá y active_org_id() pasa a
-- llamarla, en vez de copiarla.
create or replace function private.active_org_id_for(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.organization_id
  from public.memberships m
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.user_id = p_user
  order by
    (o.id = (select pr.last_organization_id from public.profiles pr where pr.id = p_user)) desc,
    m.created_at asc
  limit 1;
$$;

revoke all on function private.active_org_id_for(uuid) from public, anon, authenticated;
grant execute on function private.active_org_id_for(uuid) to service_role;

create or replace function private.active_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select private.active_org_id_for(auth.uid()); $$;


-- Organización activa del usuario, exigiendo que sea owner/admin. Conectar o
-- desconectar la ficha de Google es decisión de quien administra la cuenta,
-- igual que la facturación: un manager opera su sucursal.
--
-- `p_require_access`: conectar exige acceso vigente (0014); desconectar NO —
-- alguien con el plan vencido tiene que poder cortarnos el acceso a su Google.
create or replace function private.google_admin_org(p_user uuid, p_require_access boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org  uuid := private.active_org_id_for(p_user);
  v_role public.org_role;
begin
  if v_org is null then
    raise exception 'sin_organizacion';
  end if;

  select m.role into v_role
  from public.memberships m
  where m.organization_id = v_org and m.user_id = p_user;

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'rol_insuficiente';
  end if;

  if p_require_access and not public.org_has_access(v_org) then
    raise exception 'sin_acceso';
  end if;

  return v_org;
end;
$$;

revoke all on function private.google_admin_org(uuid, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'google_connection_status') then
    -- 'needs_reauth': Google rechazó el refresh token (invalid_grant). Pasa si
    -- el cliente revocó el acceso desde su cuenta de Google, si cambió la
    -- contraseña, o —mientras la app esté en modo Testing— a los 7 días, que es
    -- lo que duran ahí los refresh tokens. No hay 'revoked': desconectar borra
    -- la fila.
    create type public.google_connection_status as enum ('active', 'needs_reauth');
  end if;
end $$;

create table if not exists public.google_connections (
  organization_id  uuid primary key references public.organizations(id) on delete cascade,
  status           public.google_connection_status not null default 'active',
  scopes           text[] not null default '{}',
  connected_by     uuid references auth.users(id) on delete set null,
  connected_at     timestamptz not null default now(),

  last_synced_at   timestamptz,
  -- Sólo el último error, en texto corto y sin el detalle crudo de Google: el
  -- panel lo puede mostrar ("no pudimos leer tu ficha: …"). El detalle va al
  -- log del job.
  last_error       text,
  last_error_at    timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists google_connections_set_updated_at on public.google_connections;
create trigger google_connections_set_updated_at
  before update on public.google_connections
  for each row execute function private.set_updated_at();


-- El secreto, aparte. Una fila por conexión; se borra con ella.
create table if not exists private.google_oauth_tokens (
  organization_id    uuid primary key
                       references public.google_connections(organization_id) on delete cascade,
  -- AES-256-GCM, cifrado en services/api/lib/tokenCrypto.js con el
  -- organization_id como dato asociado: copiar el texto de una organización a
  -- otra no sirve, el descifrado falla.
  refresh_token_enc  text not null,
  key_id             text not null,
  updated_at         timestamptz not null default now()
);


-- `state` del flujo OAuth. Se guarda el sha256, no el valor: el valor viaja en
-- la URL de Google y en la cookie del navegador, y con eso alcanza.
create table if not exists private.google_oauth_states (
  state_hash     text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- PKCE. Es secreto sólo durante los 10 minutos del flujo; la fila se purga.
  code_verifier  text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '10 minutes'),
  used_at        timestamptz
);


-- Las fichas que administra la cuenta de Google conectada. `organization_id`
-- cuelga de la CONEXIÓN, no de la organización: desconectar Google borra en
-- cascada lo que leímos de Google. Los snapshots de location_review_snapshots
-- se quedan — son agregados nuestros, y borrarlos rompería la serie histórica.
create table if not exists public.google_locations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null
                     references public.google_connections(organization_id) on delete cascade,

  google_account   text not null,   -- 'accounts/123' — por la que se la leyó
  google_location  text not null,   -- 'locations/456' — el id estable de la ficha
  title            text,
  address          text,
  place_id         text,
  maps_uri         text,
  new_review_uri   text,

  -- A qué sucursal de Linkstar corresponde. NULL = todavía no se sabe. Se
  -- completa solo cuando el place_id coincide con locations.google_place_id
  -- (google_autolink_locations), y a mano con link_google_location().
  location_id      uuid references public.locations(id) on delete set null,

  total_reviews    integer,
  average_rating   numeric(2,1) check (average_rating between 1 and 5),
  reviews_synced_at timestamptz,
  -- Para detectar fichas que la cuenta dejó de administrar: si last_seen_at
  -- queda atrás de google_connections.last_synced_at, no vino en la última
  -- corrida.
  last_seen_at     timestamptz not null default now(),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (organization_id, google_location)
);

-- Una sucursal se mide contra UNA ficha. Dos fichas apuntando a la misma
-- sucursal duplicarían su snapshot del día.
create unique index if not exists google_locations_location_uq
  on public.google_locations (location_id) where location_id is not null;

create index if not exists google_locations_place_idx
  on public.google_locations (organization_id, place_id) where place_id is not null;

drop trigger if exists google_locations_set_updated_at on public.google_locations;
create trigger google_locations_set_updated_at
  before update on public.google_locations
  for each row execute function private.set_updated_at();

-- La sucursal vinculada tiene que ser de la misma organización. Función propia
-- y no private.check_same_org(): esa es la de 0019, compartida por dos tablas y
-- con un `if` anidado que es fácil de romper. No hace falta sumarle una tercera.
create or replace function private.google_location_same_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.location_id is not null and not exists (
    select 1 from public.locations l
    where l.id = new.location_id
      and l.organization_id = new.organization_id
      and l.deleted_at is null
  ) then
    raise exception 'La sucursal no pertenece a esta organización';
  end if;
  return new;
end;
$$;

drop trigger if exists google_locations_check_same_org on public.google_locations;
create trigger google_locations_check_same_org
  before insert or update of location_id, organization_id on public.google_locations
  for each row execute function private.google_location_same_org();


create table if not exists public.google_reviews (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null
                        references public.google_connections(organization_id) on delete cascade,
  google_location_id  uuid not null references public.google_locations(id) on delete cascade,

  review_id           text not null,   -- reviewId de la API v4
  reviewer_name       text,
  is_anonymous        boolean not null default false,
  star_rating         smallint check (star_rating between 1 and 5),
  comment             text,
  created_time        timestamptz not null,
  updated_time        timestamptz not null,
  reply_comment       text,
  reply_updated_time  timestamptz,

  fetched_at          timestamptz not null default now(),

  -- Por ficha y no global: dos organizaciones pueden conectar la misma ficha
  -- (una agencia y el dueño), y cada una tiene su copia.
  unique (google_location_id, review_id)
);

-- La consulta caliente del sync: "¿cuál es la reseña más reciente que ya
-- tengo de esta ficha?" — de ahí corta la paginación.
create index if not exists google_reviews_loc_updated_idx
  on public.google_reviews (google_location_id, updated_time desc);

create index if not exists google_reviews_org_created_idx
  on public.google_reviews (organization_id, created_time desc);


-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
-- Las dos tablas de `private` ya son inalcanzables por PostgREST. El RLS sin
-- políticas es la segunda capa: si mañana alguien expone el schema por error,
-- siguen sin devolver nada a anon/authenticated.
alter table private.google_oauth_tokens enable row level security;
alter table private.google_oauth_tokens force row level security;
alter table private.google_oauth_states enable row level security;
alter table private.google_oauth_states force row level security;
revoke all on private.google_oauth_tokens from public, anon, authenticated;
revoke all on private.google_oauth_states from public, anon, authenticated;

alter table public.google_connections enable row level security;
alter table public.google_connections force row level security;
alter table public.google_locations   enable row level security;
alter table public.google_locations   force row level security;
alter table public.google_reviews     enable row level security;
alter table public.google_reviews     force row level security;

-- Supabase da todo sobre las tablas nuevas de `public` a anon y authenticated
-- por default privileges. anon no tiene nada que hacer acá, y authenticated
-- sólo lee: todas las escrituras son del API (service_role) o de las RPC.
revoke all on public.google_connections from anon;
revoke all on public.google_locations   from anon;
revoke all on public.google_reviews     from anon;
revoke insert, update, delete, truncate on public.google_connections from authenticated;
revoke insert, update, delete, truncate on public.google_locations   from authenticated;
revoke insert, update, delete, truncate on public.google_reviews     from authenticated;
grant select on public.google_connections, public.google_locations, public.google_reviews to authenticated;

-- Estado de la conexión: lo ve cualquier miembro con acceso. Que un viewer sepa
-- que la ficha está conectada no expone nada; que no lo sepa lo haría pedirle a
-- alguien que la conecte de nuevo.
drop policy if exists google_connections_select on public.google_connections;
create policy google_connections_select on public.google_connections
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_with_access()))) );

-- Fichas y reseñas: mismo alcance que el resto de los datos por sucursal.
-- owner/admin/viewer ven todo lo de su organización — incluidas las fichas que
-- todavía no se vincularon a ninguna sucursal —; un manager sólo lo de las
-- sucursales que tiene asignadas (visible_location_ids, 0006/0014).
drop policy if exists google_locations_select on public.google_locations;
create policy google_locations_select on public.google_locations
  for select to authenticated
  using (
    organization_id = any ((select unnest(
      private.orgs_with_access(array['owner','admin','viewer']::public.org_role[])
    )))
    or location_id = any ((select unnest(private.visible_location_ids())))
  );

drop policy if exists google_reviews_select on public.google_reviews;
create policy google_reviews_select on public.google_reviews
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
-- 4. RPC del flujo OAuth — sólo service_role
-- ---------------------------------------------------------------------------
-- Errores: se lanzan con un código corto en el mensaje ('sin_organizacion',
-- 'rol_insuficiente', 'sin_acceso') que routes/google.js traduce a un status
-- HTTP y a un texto para el usuario. No hay detalle interno que filtrar.

-- Inicio: valida quién pide, registra el state y devuelve la organización.
create or replace function public.google_oauth_begin(
  p_user_id       uuid,
  p_state_hash    text,
  p_code_verifier text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_org uuid := private.google_admin_org(p_user_id, true);
begin
  -- Limpieza de paso: los state abandonados (alguien abrió Google y cerró la
  -- pestaña) no tienen otro momento para irse.
  delete from private.google_oauth_states where expires_at < now() - interval '1 day';

  insert into private.google_oauth_states (state_hash, organization_id, user_id, code_verifier)
  values (p_state_hash, v_org, p_user_id, p_code_verifier);

  return v_org;
end;
$$;

-- Consumo: un state sirve UNA vez y dentro de los 10 minutos. El update con
-- `used_at is null` es atómico: dos callbacks con el mismo state —un reintento,
-- o alguien que lo reenvía— no pueden pasar los dos.
create or replace function public.google_oauth_consume(p_state_hash text)
returns table (organization_id uuid, user_id uuid, code_verifier text)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  update private.google_oauth_states s
     set used_at = now()
   where s.state_hash = p_state_hash
     and s.used_at is null
     and s.expires_at > now()
  returning s.organization_id, s.user_id, s.code_verifier;
$$;

-- Guardar la conexión. Vuelve a comprobar el rol: entre que se abrió Google y
-- se volvió pueden pasar minutos, y a alguien le pudieron sacar el admin.
-- Reconectar pisa el token anterior y vuelve el estado a 'active'.
create or replace function public.google_save_connection(
  p_org               uuid,
  p_user_id           uuid,
  p_refresh_token_enc text,
  p_key_id            text,
  p_scopes            text[]
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'rol_insuficiente';
  end if;

  insert into public.google_connections
    (organization_id, status, scopes, connected_by, connected_at, last_error, last_error_at)
  values
    (p_org, 'active', coalesce(p_scopes, '{}'), p_user_id, now(), null, null)
  on conflict (organization_id) do update
    set status        = 'active',
        scopes        = excluded.scopes,
        connected_by  = excluded.connected_by,
        connected_at  = excluded.connected_at,
        last_error    = null,
        last_error_at = null;

  insert into private.google_oauth_tokens (organization_id, refresh_token_enc, key_id, updated_at)
  values (p_org, p_refresh_token_enc, p_key_id, now())
  on conflict (organization_id) do update
    set refresh_token_enc = excluded.refresh_token_enc,
        key_id            = excluded.key_id,
        updated_at        = now();

  insert into public.audit_log (organization_id, actor_id, action, entity_type, metadata)
  values (p_org, p_user_id, 'google.connected', 'google_connection',
          jsonb_build_object('scopes', coalesce(p_scopes, '{}')));
end;
$$;

-- Para desconectar: la organización (owner/admin, SIN exigir acceso vigente) y
-- su token, si hay. El API revoca el token en Google y después borra.
create or replace function public.google_connection_for_admin(p_user_id uuid)
returns table (organization_id uuid, refresh_token_enc text, key_id text)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_org uuid := private.google_admin_org(p_user_id, false);
begin
  return query
    select v_org, t.refresh_token_enc, t.key_id
    from (select 1) one
    left join private.google_oauth_tokens t on t.organization_id = v_org;
end;
$$;

-- Borra la conexión: en cascada se van el token, las fichas y las reseñas.
create or replace function public.google_delete_connection(p_org uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_deleted int;
begin
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'rol_insuficiente';
  end if;

  delete from public.google_connections where organization_id = p_org;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.audit_log (organization_id, actor_id, action, entity_type)
    values (p_org, p_user_id, 'google.disconnected', 'google_connection');
  end if;

  return v_deleted > 0;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. RPC del job sync-reviews — sólo service_role
-- ---------------------------------------------------------------------------

-- Qué sincronizar: conexiones activas de organizaciones con acceso vigente. Una
-- en 'needs_reauth' se saltea —su token ya no sirve, reintentarlo todos los días
-- sólo llena el log— hasta que alguien la reconecte desde el panel.
create or replace function public.google_sync_targets()
returns table (organization_id uuid, refresh_token_enc text, key_id text)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select c.organization_id, t.refresh_token_enc, t.key_id
  from public.google_connections c
  join private.google_oauth_tokens t on t.organization_id = c.organization_id
  join public.organizations o on o.id = c.organization_id and o.deleted_at is null
  where c.status = 'active'
    and public.org_has_access(c.organization_id);
$$;

create or replace function public.google_record_sync_result(
  p_org          uuid,
  p_ok           boolean,
  p_error        text default null,
  p_needs_reauth boolean default false
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.google_connections
     set last_synced_at = case when p_ok then now() else last_synced_at end,
         last_error     = case when p_ok then null else left(p_error, 500) end,
         last_error_at  = case when p_ok then null else now() end,
         status         = case when p_needs_reauth then 'needs_reauth'::public.google_connection_status
                               else status end
   where organization_id = p_org;
$$;

-- Vinculación automática ficha → sucursal, sólo por place_id. Es la única
-- coincidencia que no es una adivinanza: un nombre o una dirección parecidos
-- pueden ser dos locales distintos de la misma cadena. Lo que no coincida queda
-- en NULL para vincularlo a mano. Nunca pisa un vínculo existente.
create or replace function public.google_autolink_locations(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.google_locations gl
     set location_id = l.id
    from public.locations l
   where gl.organization_id = p_org
     and gl.location_id is null
     and gl.place_id is not null
     and l.organization_id = p_org
     and l.deleted_at is null
     and l.google_place_id = gl.place_id
     and not exists (
       select 1 from public.google_locations other
       where other.location_id = l.id
     );

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- El snapshot diario. Recibe la FICHA y deriva sucursal y organización de ella:
-- no confía en que quien llama los mande bien. Si la ficha no está vinculada a
-- ninguna sucursal no escribe nada — un snapshot sin sucursal no tiene dónde ir
-- (location_review_snapshots.location_id es not null) y devuelve false.
--
-- `captured_on` es current_date de la base, el mismo reloj que usa
-- private.compute_review_deltas() (0007). Correrlo dos veces el mismo día pisa
-- el valor de ese día: idempotente, como los rollups.
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
  v_gl public.google_locations%rowtype;
begin
  select * into v_gl from public.google_locations where id = p_google_location_id;
  if v_gl.location_id is null then
    return false;
  end if;

  insert into public.location_review_snapshots
    (organization_id, location_id, source, captured_on, captured_at,
     total_reviews, average_rating, raw)
  values
    (v_gl.organization_id, v_gl.location_id, 'google', current_date, now(),
     p_total_reviews, p_average_rating, p_raw)
  on conflict (location_id, source, captured_on) do update
    set total_reviews  = excluded.total_reviews,
        average_rating = excluded.average_rating,
        captured_at    = excluded.captured_at,
        raw            = excluded.raw;

  return true;
end;
$$;

-- Wrapper público de private.compute_review_deltas(), mismo criterio que
-- rebuild_today_rollup() (0012). El sync lo llama al terminar con el día de hoy,
-- así las reseñas nuevas aparecen el mismo día en vez de esperar al cron de
-- 0007 —que además todavía no está programado—. Idempotente (on conflict).
create or replace function public.compute_review_deltas(p_day date default current_date)
returns integer
language sql
security definer
set search_path = public, private, pg_temp
as $$ select private.compute_review_deltas(p_day); $$;


revoke all on function public.google_oauth_begin(uuid, text, text)                   from public, anon, authenticated;
revoke all on function public.google_oauth_consume(text)                             from public, anon, authenticated;
revoke all on function public.google_save_connection(uuid, uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function public.google_connection_for_admin(uuid)                      from public, anon, authenticated;
revoke all on function public.google_delete_connection(uuid, uuid)                   from public, anon, authenticated;
revoke all on function public.google_sync_targets()                                  from public, anon, authenticated;
revoke all on function public.google_record_sync_result(uuid, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.google_autolink_locations(uuid)                        from public, anon, authenticated;
revoke all on function public.record_google_review_snapshot(uuid, integer, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.compute_review_deltas(date)                            from public, anon, authenticated;

grant execute on function public.google_oauth_begin(uuid, text, text)                   to service_role;
grant execute on function public.google_oauth_consume(text)                             to service_role;
grant execute on function public.google_save_connection(uuid, uuid, text, text, text[]) to service_role;
grant execute on function public.google_connection_for_admin(uuid)                      to service_role;
grant execute on function public.google_delete_connection(uuid, uuid)                   to service_role;
grant execute on function public.google_sync_targets()                                  to service_role;
grant execute on function public.google_record_sync_result(uuid, boolean, text, boolean) to service_role;
grant execute on function public.google_autolink_locations(uuid)                        to service_role;
grant execute on function public.record_google_review_snapshot(uuid, integer, numeric, jsonb) to service_role;
grant execute on function public.compute_review_deltas(date)                            to service_role;


-- ---------------------------------------------------------------------------
-- 6. Vincular a mano una ficha con una sucursal — desde el panel
-- ---------------------------------------------------------------------------
-- Para las fichas que google_autolink_locations() no pudo resolver (la
-- sucursal no tenía place_id cargado). `p_location_id` NULL desvincula.
--
-- Si la sucursal no tenía place_id, se le copia el de la ficha: es el dato más
-- confiable que vamos a tener, y es el que usa resolve_scan() (0007) para armar
-- el link de reseña. Si ya tenía uno, no se toca — lo cargó alguien a propósito.
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

  -- El trigger google_locations_check_same_org rechaza una sucursal ajena.
  update public.google_locations
     set location_id = p_location_id
   where id = p_google_location_id;

  if p_location_id is not null and v_gl.place_id is not null then
    update public.locations
       set google_place_id = v_gl.place_id
     where id = p_location_id
       and google_place_id is null;
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_gl.organization_id, auth.uid(), 'google.location_linked', 'google_location',
          p_google_location_id, jsonb_build_object('location_id', p_location_id));
end;
$$;

revoke all on function public.link_google_location(uuid, uuid) from public, anon;
grant execute on function public.link_google_location(uuid, uuid) to authenticated;


comment on table public.google_connections is
  'Estado de la conexión con Google Business Profile, una por organización. El refresh token NO está acá: vive cifrado en private.google_oauth_tokens.';
comment on table public.google_locations is
  'Fichas de Google que administra la cuenta conectada y a qué sucursal corresponde cada una. Sin vínculo no hay snapshot.';
comment on table public.google_reviews is
  'Reseñas individuales leídas de la API v4. La verdad del conteo diario sigue siendo location_review_snapshots (invariante 6).';
