-- ============================================================================
-- LINKSTAR — 0002: Núcleo multi-tenant
-- ============================================================================
-- Modelo de tenancy elegido: SHARED DATABASE / SHARED SCHEMA con discriminador
-- (organization_id) + Row Level Security.
--
-- ¿Por qué no un esquema por cliente? Porque a 200 clientes tendrías 200
-- esquemas que migrar en cada deploy, y Supabase Free/Pro no está pensado para
-- eso. El discriminador + RLS escala hasta bien entrados los miles de tenants,
-- y si algún día aparece un cliente enterprise que exige aislamiento físico,
-- se le da su propio proyecto Supabase sin tocar este esquema.
--
-- La regla de oro: NINGUNA query del frontend filtra por organization_id.
-- Filtra Postgres. Si el filtro vive en el cliente, no existe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- organizations — el tenant. Es "el negocio del cliente", no "el local".
-- Un cliente con 5 sucursales es UNA organización con 5 locations.
-- ---------------------------------------------------------------------------
create table public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 2 and 120),
  slug           citext not null unique
                   check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),

  -- Datos fiscales (facturación AFIP/ARCA de la suscripción)
  tax_id         text,                    -- CUIT / CUIL
  legal_name     text,                    -- razón social
  billing_email  citext,

  -- Preferencias
  timezone       text not null default 'America/Argentina/Buenos_Aires',
  locale         text not null default 'es-AR',
  logo_url       text,

  -- A dónde mandamos a alguien que escanea un dispositivo roto/pausado.
  -- Nunca dejamos al cliente final frente a un error.
  fallback_url   text,

  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index organizations_active_idx on public.organizations (created_at desc)
  where deleted_at is null;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

comment on table public.organizations is
  'Tenant raíz. Todo dato de negocio cuelga de acá vía organization_id.';

-- ---------------------------------------------------------------------------
-- profiles — extensión 1:1 de auth.users.
-- auth.users es de Supabase y no conviene tocarla; los datos de perfil van acá.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  full_name             text,
  avatar_url            text,
  phone                 text,
  -- Última org que el usuario estaba mirando (para restaurar el contexto al entrar)
  last_organization_id  uuid references public.organizations(id) on delete set null,
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Crear el perfil automáticamente al registrarse.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- memberships — la tabla que define TODO el modelo de permisos.
-- Un usuario puede pertenecer a varias organizaciones (útil para agencias que
-- gestionan varios negocios, y para vos como soporte).
-- ---------------------------------------------------------------------------
create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             public.org_role not null default 'viewer',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);
create index memberships_org_idx  on public.memberships (organization_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

-- Toda organización debe conservar al menos un owner.
create or replace function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owners int;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into v_owners
    from public.memberships
    where organization_id = old.organization_id
      and role = 'owner'
      and id <> old.id;

    if v_owners = 0 then
      raise exception 'La organización debe conservar al menos un owner'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function private.protect_last_owner();

-- ---------------------------------------------------------------------------
-- invitations — sumar gente al equipo sin exponer datos.
-- Guardamos SÓLO el hash del token. El token en claro viaja una vez por mail
-- y no queda en ninguna base. Si te filtran la DB, los links no sirven.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  email            citext not null,
  role             public.org_role not null default 'viewer',
  token_hash       text not null unique,
  status           public.invitation_status not null default 'pending',
  invited_by       uuid references auth.users(id) on delete set null,
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  accepted_by      uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- Una sola invitación pendiente por email y organización.
create unique index invitations_pending_uq
  on public.invitations (organization_id, email)
  where status = 'pending';

create index invitations_email_idx on public.invitations (email) where status = 'pending';
