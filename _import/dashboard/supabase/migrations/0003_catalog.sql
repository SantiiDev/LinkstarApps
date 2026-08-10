-- ============================================================================
-- LINKSTAR — 0003: Catálogo (Ubicaciones, Empleados, Dispositivos)
-- Estas son las tres pestañas de tu dashboard.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- locations — sucursales / locales del cliente.
-- Es la unidad a la que se le miden las reseñas de Google, porque un
-- Google Place ID pertenece a una dirección física, no a una marca.
-- ---------------------------------------------------------------------------
create table public.locations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  name                text not null check (length(btrim(name)) between 1 and 120),
  address             text,
  city                text,
  province            text,
  postal_code         text,
  country             char(2) not null default 'AR',
  latitude            numeric(9,6) check (latitude between -90 and 90),
  longitude           numeric(9,6) check (longitude between -180 and 180),
  timezone            text not null default 'America/Argentina/Buenos_Aires',
  phone               text,

  -- --- Integración Google ---
  -- google_place_id es la llave de todo: con ella armás el link directo de
  -- reseña y consultás el conteo de reseñas para estimar conversiones.
  google_place_id     text,
  -- Link directo al formulario de reseña. Si es null, se genera desde el
  -- place_id: https://search.google.com/local/writereview?placeid=<PLACE_ID>
  google_review_url   text,
  google_maps_url     text,

  -- --- Integración Instagram ---
  instagram_handle    text check (instagram_handle !~ '^@'),  -- guardar sin la arroba
  instagram_url       text,

  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create unique index locations_org_name_uq
  on public.locations (organization_id, lower(name))
  where deleted_at is null;

create index locations_org_idx on public.locations (organization_id) where deleted_at is null;
create index locations_place_idx on public.locations (google_place_id) where google_place_id is not null;

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- membership_locations — alcance por sucursal.
-- Un `manager` sólo ve las ubicaciones que tenga acá. Un `admin`/`owner` ve
-- todas. Convención: si un manager no tiene ninguna fila, no ve ninguna.
-- ---------------------------------------------------------------------------
create table public.membership_locations (
  membership_id  uuid not null references public.memberships(id) on delete cascade,
  location_id    uuid not null references public.locations(id)   on delete cascade,
  primary key (membership_id, location_id)
);

create index membership_locations_loc_idx on public.membership_locations (location_id);

-- ---------------------------------------------------------------------------
-- employees — el mozo, la recepcionista, el vendedor.
--
-- DECISIÓN IMPORTANTE: un empleado NO es un usuario del sistema. No loguea, no
-- tiene contraseña, no cuenta para el límite de miembros del plan. Es una
-- etiqueta con la que se atribuyen escaneos. El campo user_id queda previsto
-- por si más adelante querés darles acceso a su propio ranking.
-- ---------------------------------------------------------------------------
create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  location_id      uuid references public.locations(id) on delete set null,
  user_id          uuid references auth.users(id) on delete set null,  -- opcional, a futuro

  full_name        text not null check (length(btrim(full_name)) between 2 and 120),
  employee_code    text,          -- legajo interno del cliente
  role_title       text,          -- "Mozo", "Recepcionista", "Cajero"
  email            citext,
  phone            text,
  avatar_url       text,

  is_active        boolean not null default true,
  started_at       date,
  ended_at         date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  constraint employees_dates_ck check (ended_at is null or started_at is null or ended_at >= started_at)
);

create unique index employees_org_code_uq
  on public.employees (organization_id, lower(employee_code))
  where employee_code is not null and deleted_at is null;

create index employees_org_idx      on public.employees (organization_id) where deleted_at is null;
create index employees_location_idx on public.employees (location_id)     where deleted_at is null;
create index employees_name_trgm    on public.employees using gin (full_name extensions.gin_trgm_ops);

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function private.set_updated_at();

-- Un empleado no puede pertenecer a una ubicación de otra organización.
create or replace function private.check_same_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  if new.location_id is not null then
    select organization_id into v_org from public.locations where id = new.location_id;
    if v_org is distinct from new.organization_id then
      raise exception 'La ubicación pertenece a otra organización'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  if tg_table_name = 'devices' and new.employee_id is not null then
    select organization_id into v_org from public.employees where id = new.employee_id;
    if v_org is distinct from new.organization_id then
      raise exception 'El empleado pertenece a otra organización'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger employees_check_same_org
  before insert or update on public.employees
  for each row execute function private.check_same_org();

-- ---------------------------------------------------------------------------
-- devices — el expositor NFC / QR físico. El corazón del producto.
--
-- Ciclo de vida completo:
--   1. Se fabrica un lote  — filas con status 'unassigned', organization_id NULL,
--                            public_id y claim_code generados e impresos.
--   2. Se vende            — se asocia a un order_id.
--   3. El cliente lo reclama en la app con el claim_code
--                          — organization_id se completa, status 'active'.
--
-- Por eso organization_id es NULLABLE acá y NOT NULL en el resto: un
-- dispositivo existe (y ya puede escanearse) antes de tener dueño.
-- ---------------------------------------------------------------------------
create table public.devices (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references public.organizations(id) on delete set null,
  location_id       uuid references public.locations(id)     on delete set null,
  employee_id       uuid references public.employees(id)     on delete set null,

  -- Lo que va escrito en el chip NFC: https://l.linkstar.com.ar/d/{public_id}
  public_id         text not null unique default private.generate_public_id(8),
  -- Lo que va impreso en la base para vincularlo a una cuenta.
  claim_code        text unique default private.generate_claim_code(),

  label             text not null default 'Dispositivo',   -- "Google NFC #1"
  kind              public.device_kind   not null default 'google_review',
  form_factor       public.device_form   not null default 'nfc_stand',
  status            public.device_status not null default 'unassigned',

  -- Trazabilidad de producción / postventa
  serial_number     text unique,
  batch_code        text,
  nfc_uid           text unique,          -- UID físico del chip NTAG, anti-clonación
  order_id          uuid,                 -- FK agregada en 0005 (orders)

  -- Destino. Si es null se resuelve desde la ubicación según `kind`.
  destination_url   text,

  claimed_at        timestamptz,
  activated_at      timestamptz,
  last_scan_at      timestamptz,
  total_scans       bigint not null default 0,   -- contador denormalizado (barato de leer)

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index devices_org_idx        on public.devices (organization_id) where deleted_at is null;
create index devices_location_idx   on public.devices (location_id)     where deleted_at is null;
create index devices_employee_idx   on public.devices (employee_id)     where deleted_at is null;
create index devices_status_idx     on public.devices (organization_id, status) where deleted_at is null;
create index devices_batch_idx      on public.devices (batch_code)      where batch_code is not null;

-- Un dispositivo vinculado tiene que tener dueño coherente.
create index devices_unclaimed_idx  on public.devices (claim_code) where organization_id is null;

create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function private.set_updated_at();

create trigger devices_check_same_org
  before insert or update on public.devices
  for each row when (new.organization_id is not null)
  execute function private.check_same_org();

comment on column public.devices.public_id is
  'Identificador corto y no adivinable grabado en el NFC. Nunca uses el uuid en la URL: es largo y filtra información de la DB.';
comment on column public.devices.total_scans is
  'Contador denormalizado mantenido por trigger. Evita COUNT(*) sobre scan_events en la vista de listado.';
