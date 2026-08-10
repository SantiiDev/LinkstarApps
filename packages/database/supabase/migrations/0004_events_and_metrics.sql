-- ============================================================================
-- LINKSTAR — 0004: Eventos, agregados y métricas
-- ============================================================================
-- Esta es la tabla que va a crecer sin parar y la que define si tu factura de
-- Supabase se mantiene en USD 25 o se dispara. Dos reglas:
--
--   1. El dashboard NUNCA consulta scan_events directamente para rangos
--      largos. Consulta scan_daily_rollups.
--   2. Los datos de atribución (ubicación, empleado, tipo) se guardan como
--      SNAPSHOT en el evento, no por JOIN. Si mañana el cliente reasigna el
--      expositor del mozo Juan al mozo Pedro, los escaneos de la semana pasada
--      tienen que seguir siendo de Juan. Con un JOIN, se reescribiría la
--      historia entera. Este es el error más caro de deshacer después.
-- ============================================================================

create table public.scan_events (
  id                bigint generated always as identity,
  occurred_at       timestamptz not null default now(),

  -- Desnormalizado a propósito: RLS filtra por esta columna sin JOINs.
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  device_id         uuid not null references public.devices(id) on delete cascade,

  -- === SNAPSHOT al momento del escaneo (ver regla 2) ===
  location_id       uuid,
  employee_id       uuid,
  kind              public.device_kind not null,

  -- === Deduplicación ===
  -- session_hash = sha256(public_id + ip + user_agent + fecha)
  -- Alguien que toca el expositor 4 veces genera 4 filas, pero una sola con
  -- is_unique = true. Vendés "escaneos únicos", no "toques".
  session_hash      text,
  is_unique         boolean not null default true,
  is_bot            boolean not null default false,

  -- === Contexto (sin datos personales en claro) ===
  ip_hash           text,          -- hash con pepper, jamás la IP
  user_agent        text,
  os_family         text,          -- ios | android | other
  device_family     text,          -- mobile | tablet | desktop
  country           char(2),
  region            text,
  city              text,
  referrer          text,

  redirected_to     text,          -- a dónde lo mandamos realmente
  latency_ms        integer,

  -- PK compuesta con occurred_at: así el día que necesites particionar por mes,
  -- la migración no toca la clave primaria (Postgres exige que la clave de
  -- partición forme parte de toda restricción única).
  primary key (id, occurred_at)
);

-- --- Índices ---
-- El orden importa: (tenant, tiempo desc) sirve para el 90% de las queries.
create index scan_events_org_time_idx
  on public.scan_events (organization_id, occurred_at desc);

create index scan_events_device_time_idx
  on public.scan_events (device_id, occurred_at desc);

create index scan_events_location_time_idx
  on public.scan_events (location_id, occurred_at desc)
  where location_id is not null;

create index scan_events_employee_time_idx
  on public.scan_events (employee_id, occurred_at desc)
  where employee_id is not null;

-- Índice para el chequeo de deduplicación dentro de la ventana de sesión.
create index scan_events_session_idx
  on public.scan_events (device_id, session_hash, occurred_at desc)
  where session_hash is not null;

comment on table public.scan_events is
  'Log crudo de escaneos. Append-only. Nadie escribe acá desde el cliente: sólo la función resolve_scan (SECURITY DEFINER).';

-- ---------------------------------------------------------------------------
-- scan_daily_rollups — la tabla que alimenta el dashboard.
--
-- Grano: (organización, día, ubicación, dispositivo, empleado, tipo).
-- Se reconstruye entera por día con DELETE + INSERT (idempotente): si el job
-- corre dos veces o hay que recalcular un día viejo, el resultado es el mismo.
-- Nada de UPSERTs con COALESCE sobre columnas nulas.
-- ---------------------------------------------------------------------------
create table public.scan_daily_rollups (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  day              date not null,
  location_id      uuid,
  device_id        uuid,
  employee_id      uuid,
  kind             public.device_kind not null,

  scans            integer not null default 0,   -- toques totales
  unique_scans     integer not null default 0,   -- sesiones distintas
  bot_scans        integer not null default 0,

  computed_at      timestamptz not null default now()
);

create index rollups_org_day_idx      on public.scan_daily_rollups (organization_id, day desc);
create index rollups_device_day_idx   on public.scan_daily_rollups (device_id, day desc)   where device_id is not null;
create index rollups_employee_day_idx on public.scan_daily_rollups (employee_id, day desc) where employee_id is not null;
create index rollups_location_day_idx on public.scan_daily_rollups (location_id, day desc) where location_id is not null;

-- ---------------------------------------------------------------------------
-- location_review_snapshots — de dónde salen las "RESEÑAS ESTIMADAS".
--
-- Hay que ser honesto con esto: Google NO avisa cuándo alguien deja una reseña
-- ni permite atribuirla a un escaneo concreto. No existe callback. La única
-- forma no inventada de medirlo es tomar una foto diaria del contador total de
-- reseñas de cada ubicación (Google Business Profile API o Places API) y
-- calcular la diferencia respecto al día anterior.
--
-- Eso te da reseñas nuevas por día y por sucursal — pero NO por empleado ni por
-- dispositivo. La atribución a nivel empleado es necesariamente un prorrateo
-- según los escaneos únicos del día. Convienelo etiquetar como "estimado" en la
-- UI (como ya hacés) y explicarlo en la documentación del producto: si un
-- cliente descubre solo que el número es una estimación, perdés la confianza.
-- ---------------------------------------------------------------------------
create table public.location_review_snapshots (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  location_id      uuid not null references public.locations(id) on delete cascade,
  source           text not null default 'google' check (source in ('google', 'instagram')),

  captured_on      date not null default current_date,
  captured_at      timestamptz not null default now(),

  total_reviews    integer,
  average_rating   numeric(2,1) check (average_rating between 1 and 5),
  followers        integer,          -- para source = 'instagram'

  raw              jsonb,            -- respuesta cruda de la API, para depurar
  unique (location_id, source, captured_on)
);

create index review_snapshots_loc_idx
  on public.location_review_snapshots (location_id, source, captured_on desc);

-- Deltas diarios: reseñas nuevas por ubicación y día.
create table public.review_deltas (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  location_id      uuid not null references public.locations(id) on delete cascade,
  source           text not null default 'google',
  day              date not null,
  new_reviews      integer not null default 0,
  rating_change    numeric(3,2),
  computed_at      timestamptz not null default now(),
  unique (location_id, source, day)
);

create index review_deltas_org_day_idx on public.review_deltas (organization_id, day desc);

-- ---------------------------------------------------------------------------
-- audit_log — quién hizo qué. Barato de agregar ahora, imposible de
-- reconstruir después cuando un cliente pregunte por qué desapareció un local.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id               bigint generated always as identity primary key,
  organization_id  uuid references public.organizations(id) on delete cascade,
  actor_id         uuid references auth.users(id) on delete set null,
  action           text not null,          -- 'device.claimed', 'employee.deleted', ...
  entity_type      text,
  entity_id        uuid,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index audit_log_org_time_idx on public.audit_log (organization_id, created_at desc);
