-- ============================================================================
-- LINKSTAR — 0001: Extensiones, esquema privado, tipos y helpers
-- ============================================================================
-- Convenciones del proyecto:
--   * Toda tabla de negocio lleva organization_id (el tenant).
--   * Nada sensible vive en el esquema `public` si no debe exponerse vía API.
--   * Borrado lógico (deleted_at) en entidades referenciadas por eventos
--     históricos: si borrás un empleado, sus escaneos pasados deben sobrevivir.
-- ============================================================================

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid, digest, gen_random_bytes
create extension if not exists citext    with schema extensions;  -- emails/slugs case-insensitive
create extension if not exists pg_trgm   with schema extensions;  -- búsqueda por nombre

-- ---------------------------------------------------------------------------
-- Esquema privado: PostgREST NO lo expone. Acá van helpers de seguridad,
-- tablas internas (webhooks, jobs) y todo lo que el cliente jamás debe tocar.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

-- Roles dentro de una organización.
--   owner   : dueño de la cuenta. Único que puede borrar la org o cambiar el plan.
--   admin   : gestiona ubicaciones, dispositivos, empleados y miembros.
--   manager : opera su(s) ubicación(es) asignada(s). No ve las demás.
--   viewer  : sólo lectura.
create type public.org_role as enum ('owner', 'admin', 'manager', 'viewer');

-- Qué hace el dispositivo cuando lo tocan.
create type public.device_kind as enum ('google_review', 'instagram', 'custom');

-- Formato físico del producto que vendés.
create type public.device_form as enum ('nfc_stand', 'nfc_sticker', 'nfc_card', 'qr_stand', 'qr_sticker');

-- Ciclo de vida del dispositivo.
--   unassigned : fabricado y vendido, todavía no vinculado a una cuenta.
--   active     : vinculado y redirigiendo.
--   paused     : el cliente lo desactivó (sigue redirigiendo al fallback).
--   lost       : reportado como perdido/robado — redirige al fallback.
--   retired    : dado de baja definitivamente.
create type public.device_status as enum ('unassigned', 'active', 'paused', 'lost', 'retired');

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired'
);

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create type public.order_status as enum (
  'pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded'
);

-- ---------------------------------------------------------------------------
-- Helper: updated_at automático
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: generar el public_id que va grabado en el NFC.
--
-- Alfabeto Crockford-ish: sin 0/1/i/l/o para que nadie se equivoque leyendo
-- el código impreso en la base del expositor. 8 caracteres sobre 31 símbolos
-- — 8.5e11 combinaciones: imposible de adivinar por fuerza bruta a través de
-- la red, que es lo que importa (si alguien adivina un public_id ajeno sólo
-- consigue sumarle un escaneo falso, no leer datos).
-- ---------------------------------------------------------------------------
create or replace function private.generate_public_id(p_len int default 8)
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  v_bytes    bytea;
  v_out      text := '';
  i          int;
begin
  v_bytes := extensions.gen_random_bytes(p_len);
  for i in 0 .. p_len - 1 loop
    v_out := v_out || substr(
      v_alphabet,
      1 + (get_byte(v_bytes, i) % length(v_alphabet)),
      1
    );
  end loop;
  return v_out;
end;
$$;

-- Código de vinculación impreso en la caja/base del producto.
-- Formato legible por humanos: XXXX-XXXX
create or replace function private.generate_claim_code()
returns text
language sql
volatile
as $$
  select upper(private.generate_public_id(4) || '-' || private.generate_public_id(4));
$$;

-- ---------------------------------------------------------------------------
-- Helper: hash con pepper para IPs.
--
-- IMPORTANTE (Ley 25.326 de Protección de Datos Personales): una IP es un dato
-- personal. No la guardamos nunca en claro. El pepper vive en una tabla del
-- esquema privado, NO en el código del frontend.
-- ---------------------------------------------------------------------------
create table if not exists private.app_secrets (
  key        text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);

insert into private.app_secrets (key, value)
values ('ip_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function private.hash_ip(p_ip text)
returns text
language sql
stable
security definer
set search_path = private, extensions, pg_temp
as $$
  select case
    when p_ip is null or p_ip = '' then null
    else encode(
      extensions.digest(p_ip || (select value from private.app_secrets where key = 'ip_pepper'), 'sha256'),
      'hex'
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- Grants base para las Data APIs de Supabase (PostgREST).
--
-- Crear una tabla NO le da acceso automáticamente a anon/authenticated/
-- service_role. Eso pasa gratis sólo cuando el dueño de la tabla es
-- `supabase_admin` (lo que hace el Table Editor del dashboard). Estas
-- migraciones corren como `postgres`, así que hay que otorgar el grant base
-- nosotros mismos — si no, cualquier `select` de un usuario autenticado
-- falla con "permission denied for table X" antes de llegar a evaluar
-- ninguna política de RLS.
--
-- Esto sólo abre la puerta: el filtro real por fila lo sigue haciendo RLS
-- (enable + force row level security en 0006), que es lo único que un
-- cliente con la anon key nunca puede saltarse. Por eso 0006 puede darse el
-- lujo de hacer `revoke insert, update, delete on X from anon, authenticated`
-- en tablas puntuales: asume que el grant amplio de acá ya existe.
--
-- Se declara ANTES de crear ninguna tabla (0002 en adelante) porque
-- `alter default privileges` sólo aplica a objetos creados DESPUÉS.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
