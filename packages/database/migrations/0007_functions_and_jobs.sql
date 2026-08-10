-- ============================================================================
-- LINKSTAR — 0007: Funciones de negocio y trabajos programados
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Al crear una organización: membresía de owner + suscripción de prueba.
-- Se hace por trigger y no desde el frontend porque son tres escrituras que
-- tienen que pasar o fallar juntas. Si el cliente crea la org y se le corta
-- internet antes del segundo INSERT, queda una organización huérfana sin dueño
-- y sin forma de recuperarla.
-- ---------------------------------------------------------------------------
create or replace function private.bootstrap_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.memberships (organization_id, user_id, role)
  values (new.id, coalesce(new.created_by, auth.uid()), 'owner')
  on conflict do nothing;

  insert into public.subscriptions (
    organization_id, plan_code, status, trial_ends_at,
    current_period_start, current_period_end
  )
  values (
    new.id, 'trial', 'trialing', now() + interval '14 days',
    now(), now() + interval '14 days'
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

create trigger organizations_bootstrap
  after insert on public.organizations
  for each row execute function private.bootstrap_organization();

-- ---------------------------------------------------------------------------
-- LÍMITES DE PLAN
--
-- Se validan en la base, no en React. Un límite que sólo existe en el frontend
-- no es un límite: es una sugerencia.
-- ---------------------------------------------------------------------------
create or replace function private.plan_limit(p_org uuid, p_limit text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p_limit
    when 'locations' then p.max_locations
    when 'devices'   then p.max_devices
    when 'employees' then p.max_employees
    when 'members'   then p.max_members
  end
  from public.subscriptions s
  join public.plans p on p.code = s.plan_code
  where s.organization_id = p_org;
$$;

create or replace function private.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit   integer;
  v_current integer;
  v_kind    text := tg_argv[0];
begin
  if new.organization_id is null then
    return new;
  end if;

  v_limit := private.plan_limit(new.organization_id, v_kind);
  if v_limit is null then
    return new;                                  -- plan ilimitado
  end if;

  execute format(
    'select count(*) from public.%I where organization_id = $1 and deleted_at is null',
    case v_kind
      when 'locations' then 'locations'
      when 'devices'   then 'devices'
      when 'employees' then 'employees'
    end
  ) into v_current using new.organization_id;

  if v_current >= v_limit then
    raise exception
      'Alcanzaste el límite de tu plan (% de %). Actualizá el plan para agregar más.',
      v_current, v_limit
      using errcode = 'check_violation', hint = 'plan_limit_reached';
  end if;

  return new;
end;
$$;

create trigger locations_plan_limit
  before insert on public.locations
  for each row execute function private.enforce_plan_limit('locations');

create trigger employees_plan_limit
  before insert on public.employees
  for each row execute function private.enforce_plan_limit('employees');

-- ---------------------------------------------------------------------------
-- VINCULAR UN DISPOSITIVO A UNA CUENTA
--
-- El cliente recibe el expositor, entra a la app, escribe el código impreso en
-- la base y queda vinculado. Es SECURITY DEFINER porque devices no tiene
-- política de INSERT/claim para el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.claim_device(
  p_claim_code  text,
  p_org_id      uuid,
  p_location_id uuid default null,
  p_label       text default null
)
returns public.devices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.devices;
  v_limit  integer;
  v_count  integer;
begin
  -- 1. ¿El usuario puede administrar esta organización?
  if not exists (
    select 1 from public.memberships
    where user_id = auth.uid() and organization_id = p_org_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'No tenés permisos sobre esta organización' using errcode = '42501';
  end if;

  -- 2. Bloqueo la fila: dos personas escaneando el mismo código a la vez no
  --    pueden vincularlo dos veces.
  select * into v_device
  from public.devices
  where upper(claim_code) = upper(btrim(p_claim_code))
  for update;

  if not found then
    raise exception 'Código de vinculación inválido' using errcode = 'P0002', hint = 'invalid_claim_code';
  end if;

  if v_device.organization_id is not null then
    raise exception 'Este dispositivo ya está vinculado a otra cuenta'
      using errcode = '23505', hint = 'already_claimed';
  end if;

  -- 3. Límite de plan
  v_limit := private.plan_limit(p_org_id, 'devices');
  if v_limit is not null then
    select count(*) into v_count
    from public.devices
    where organization_id = p_org_id and deleted_at is null;

    if v_count >= v_limit then
      raise exception 'Alcanzaste el límite de dispositivos de tu plan (%)', v_limit
        using errcode = 'check_violation', hint = 'plan_limit_reached';
    end if;
  end if;

  -- 4. Vincular
  update public.devices
  set organization_id = p_org_id,
      location_id     = p_location_id,
      label           = coalesce(p_label, label),
      status          = 'active',
      claimed_at      = now(),
      activated_at    = coalesce(activated_at, now()),
      claim_code      = null            -- se consume: no se puede reusar
  where id = v_device.id
  returning * into v_device;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org_id, auth.uid(), 'device.claimed', 'device', v_device.id);

  return v_device;
end;
$$;

revoke all on function public.claim_device(text, uuid, uuid, text) from public, anon;
grant execute on function public.claim_device(text, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ACEPTAR UNA INVITACIÓN
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inv public.invitations;
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
begin
  select * into v_inv
  from public.invitations
  where token_hash = v_hash and status = 'pending' and expires_at > now()
  for update;

  if not found then
    raise exception 'Invitación inválida o vencida' using errcode = 'P0002';
  end if;

  if lower(v_inv.email) <> lower(((select auth.jwt()) ->> 'email')) then
    raise exception 'Esta invitación es para otro correo' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;

-- ============================================================================
-- ***  LA FUNCIÓN MÁS IMPORTANTE DEL SISTEMA  ***
-- resolve_scan — resuelve un toque de NFC/QR y registra el evento.
--
-- Requisitos de esta función, en orden de prioridad:
--   1. SIEMPRE devolver un destino. Si algo falla, el cliente final del
--      comercio se queda mirando una pantalla en blanco en el mostrador. Es
--      preferible un escaneo mal registrado que una redirección rota.
--   2. Ser rápida (<50 ms). Todo lo pesado va al job nocturno.
--   3. No confiar en nada de lo que le mandan.
--
-- SEGURIDAD: NO se otorga a `anon`. La anon key de Supabase es pública, así que
-- si anon pudiera ejecutarla, cualquiera podría inflar (o falsear) las métricas
-- de cualquier cliente conociendo un public_id. Sólo la ejecuta el Edge
-- Function / Worker que hace la redirección, con service_role.
-- ============================================================================
create or replace function public.resolve_scan(
  p_public_id   text,
  p_ip          text default null,
  p_user_agent  text default null,
  p_referrer    text default null,
  p_country     text default null,
  p_region      text default null,
  p_city        text default null,
  p_latency_ms  integer default null
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
    country, region, city, referrer, redirected_to, latency_ms
  )
  values (
    v_device.organization_id, v_device.id, v_device.location_id, v_device.employee_id, v_device.kind,
    v_session, v_unique, v_bot,
    private.hash_ip(p_ip), v_ua, v_os, v_family,
    nullif(upper(left(coalesce(p_country, ''), 2)), ''), p_region, p_city,
    left(coalesce(p_referrer, ''), 512), v_dest, p_latency_ms
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

revoke all on function public.resolve_scan(text, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.resolve_scan(text, text, text, text, text, text, text, integer) to service_role;

-- ============================================================================
-- JOBS NOCTURNOS
-- ============================================================================

-- --- Reconstruir los agregados de un día ---
-- DELETE + INSERT en vez de UPSERT: idempotente. Podés recalcular cualquier día
-- las veces que quieras y el resultado es idéntico.
create or replace function private.rebuild_daily_rollups(p_day date default (current_date - 1))
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  delete from public.scan_daily_rollups where day = p_day;

  insert into public.scan_daily_rollups (
    organization_id, day, location_id, device_id, employee_id, kind,
    scans, unique_scans, bot_scans
  )
  select
    e.organization_id,
    p_day,
    e.location_id,
    e.device_id,
    e.employee_id,
    e.kind,
    count(*)                                              as scans,
    count(*) filter (where e.is_unique and not e.is_bot)   as unique_scans,
    count(*) filter (where e.is_bot)                       as bot_scans
  from public.scan_events e
  where e.occurred_at >= p_day::timestamptz
    and e.occurred_at <  (p_day + 1)::timestamptz
  group by e.organization_id, e.location_id, e.device_id, e.employee_id, e.kind;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- --- Calcular reseñas nuevas a partir de los snapshots ---
create or replace function private.compute_review_deltas(p_day date default (current_date - 1))
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  insert into public.review_deltas (organization_id, location_id, source, day, new_reviews, rating_change)
  select
    s.organization_id,
    s.location_id,
    s.source,
    s.captured_on,
    greatest(s.total_reviews - prev.total_reviews, 0),
    s.average_rating - prev.average_rating
  from public.location_review_snapshots s
  join lateral (
    select total_reviews, average_rating
    from public.location_review_snapshots p
    where p.location_id = s.location_id
      and p.source = s.source
      and p.captured_on < s.captured_on
    order by p.captured_on desc
    limit 1
  ) prev on true
  where s.captured_on = p_day
  on conflict (location_id, source, day) do update
    set new_reviews   = excluded.new_reviews,
        rating_change = excluded.rating_change,
        computed_at   = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- --- Marcar suscripciones vencidas ---
create or replace function private.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.subscriptions
  set status = 'expired'
  where status in ('trialing', 'past_due')
    and coalesce(grace_until, current_period_end, trial_ends_at) < now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- --- Purga de eventos crudos ---
-- Los agregados quedan para siempre (ocupan nada). Los eventos crudos, no:
-- son el 99% del volumen y nadie mira el detalle de un escaneo de hace 2 años.
create or replace function private.purge_old_scan_events(p_keep_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  delete from public.scan_events
  where occurred_at < now() - make_interval(days => p_keep_days);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Programación con pg_cron (habilitar la extensión desde el panel de Supabase:
-- Database — Extensions — pg_cron). Horarios en UTC: Argentina es UTC-3.
-- ---------------------------------------------------------------------------
-- select cron.schedule('linkstar-rollups',   '20 6 * * *', $$ select private.rebuild_daily_rollups(); $$);
-- select cron.schedule('linkstar-reviews',   '30 6 * * *', $$ select private.compute_review_deltas(); $$);
-- select cron.schedule('linkstar-subs',      '0  * * * *', $$ select private.expire_subscriptions(); $$);
-- select cron.schedule('linkstar-purge',     '0  7 * * 0', $$ select private.purge_old_scan_events(); $$);
