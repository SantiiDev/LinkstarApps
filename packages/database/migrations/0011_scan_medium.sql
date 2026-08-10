-- ============================================================================
-- LINKSTAR — 0011: Medio de escaneo (QR vs NFC)
-- ============================================================================
-- resolve_scan() no distinguía si el toque vino del QR impreso o del chip NFC
-- del mismo dispositivo (mismo public_id, distinto medio físico). Se agrega
-- scan_events.medium para responder esa pregunta sin tocar el grano de
-- scan_daily_rollups ni el job private.rebuild_daily_rollups (su INSERT lista
-- columnas explícitas, así que una columna nueva y nullable no lo afecta).
-- ============================================================================

create type public.scan_medium as enum ('qr', 'nfc');

alter table public.scan_events
  add column medium public.scan_medium;

comment on column public.scan_events.medium is
  'Medio físico del toque: qr (impreso) o nfc (chip). Null si no vino en la URL (?s=q / ?s=n) o el valor no era uno de los dos esperados.';

-- ---------------------------------------------------------------------------
-- resolve_scan: se agrega p_medium al final con default null. Cambia la firma
-- (9 parámetros en vez de 8) — CREATE OR REPLACE sólo reemplaza una función si
-- la lista de tipos de parámetros es idéntica a la existente, así que hay que
-- dropear la versión vieja explícitamente antes de crear la nueva. La llamada
-- actual por nombre (p_public_id, p_ip, p_user_agent, p_referrer) sigue
-- funcionando igual: p_medium es opcional y va al final.
-- ---------------------------------------------------------------------------
drop function if exists public.resolve_scan(text, text, text, text, text, text, text, integer);

create or replace function public.resolve_scan(
  p_public_id   text,
  p_ip          text default null,
  p_user_agent  text default null,
  p_referrer    text default null,
  p_country     text default null,
  p_region      text default null,
  p_city        text default null,
  p_latency_ms  integer default null,
  p_medium      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_device      public.devices;
  v_location    public.locations;
  v_org         public.organizations;
  v_dest        text;
  v_session     text;
  v_unique      boolean := true;
  v_bot         boolean := false;
  v_os          text;
  v_family      text;
  v_ua          text := left(coalesce(p_user_agent, ''), 512);
  -- Normalizado acá adentro: no confiar en lo que manda el caller (regla 3 de
  -- esta función). Cualquier valor que no sea 'qr'/'nfc' (mayúsc./minúsc.) cae
  -- a null en vez de romper el insert.
  v_medium      public.scan_medium := case lower(coalesce(p_medium, ''))
                                         when 'qr'  then 'qr'::public.scan_medium
                                         when 'nfc' then 'nfc'::public.scan_medium
                                         else null
                                       end;
begin
  select * into v_device
  from public.devices
  where public_id = lower(btrim(p_public_id))
    and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_location from public.locations where id = v_device.location_id;
  select * into v_org      from public.organizations where id = v_device.organization_id;

  -- --- 1. Resolver destino (cascada, nunca vacío) ---
  v_dest := coalesce(
    nullif(v_device.destination_url, ''),
    case v_device.kind
      when 'google_review' then coalesce(
        nullif(v_location.google_review_url, ''),
        case when v_location.google_place_id is not null
             then 'https://search.google.com/local/writereview?placeid=' || v_location.google_place_id
        end,
        nullif(v_location.google_maps_url, '')
      )
      when 'instagram' then coalesce(
        nullif(v_location.instagram_url, ''),
        case when v_location.instagram_handle is not null
             then 'https://instagram.com/' || v_location.instagram_handle
        end
      )
      else null
    end,
    nullif(v_org.fallback_url, ''),
    'https://linkstar.com.ar'
  );

  -- Dispositivo pausado, perdido o sin vincular — redirijo igual, al fallback.
  if v_device.organization_id is null or v_device.status in ('paused','lost','retired') then
    return jsonb_build_object(
      'ok', true,
      'destination', coalesce(nullif(v_org.fallback_url, ''), 'https://linkstar.com.ar'),
      'tracked', false,
      'reason', 'device_' || coalesce(v_device.status::text, 'unclaimed')
    );
  end if;

  -- --- 2. Clasificación básica del cliente ---
  v_bot := v_ua ~* '(bot|crawler|spider|preview|facebookexternalhit|whatsapp|slurp|curl|wget|headless)';
  v_os := case
            when v_ua ~* 'iphone|ipad|ios'   then 'ios'
            when v_ua ~* 'android'           then 'android'
            else 'other'
          end;
  v_family := case
                when v_ua ~* 'ipad|tablet'                 then 'tablet'
                when v_ua ~* 'mobile|iphone|android'       then 'mobile'
                else 'desktop'
              end;

  -- --- 3. Deduplicación por sesión ---
  -- Misma persona + mismo expositor + mismo día = una sola sesión.
  v_session := encode(
    extensions.digest(
      v_device.public_id || '|' || coalesce(private.hash_ip(p_ip), '') || '|' ||
      v_ua || '|' || current_date::text,
      'sha256'
    ), 'hex'
  );

  select not exists (
    select 1 from public.scan_events
    where device_id = v_device.id
      and session_hash = v_session
      and occurred_at > now() - interval '12 hours'
  ) into v_unique;

  -- --- 4. Registrar ---
  insert into public.scan_events (
    organization_id, device_id, location_id, employee_id, kind,
    session_hash, is_unique, is_bot,
    ip_hash, user_agent, os_family, device_family,
    country, region, city, referrer, redirected_to, latency_ms, medium
  )
  values (
    v_device.organization_id, v_device.id, v_device.location_id, v_device.employee_id, v_device.kind,
    v_session, v_unique, v_bot,
    private.hash_ip(p_ip), v_ua, v_os, v_family,
    nullif(upper(left(coalesce(p_country, ''), 2)), ''), p_region, p_city,
    left(coalesce(p_referrer, ''), 512), v_dest, p_latency_ms, v_medium
  );

  -- --- 5. Contadores denormalizados (lectura barata en el listado) ---
  if not v_bot then
    update public.devices
    set last_scan_at = now(),
        total_scans  = total_scans + 1
    where id = v_device.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'destination', v_dest,
    'tracked', true,
    'unique', v_unique,
    'kind', v_device.kind
  );

exception
  when others then
    -- Prioridad 1: nunca dejar al usuario sin destino. Si falla el registro,
    -- redirigimos igual y dejamos rastro para investigar.
    insert into public.audit_log (action, entity_type, metadata)
    values ('scan.error', 'device',
            jsonb_build_object('public_id', p_public_id, 'error', sqlerrm));
    return jsonb_build_object('ok', true, 'destination', coalesce(v_dest, 'https://linkstar.com.ar'), 'tracked', false);
end;
$$;

revoke all on function public.resolve_scan(text, text, text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.resolve_scan(text, text, text, text, text, text, text, integer, text) to service_role;
