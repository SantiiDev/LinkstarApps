-- ============================================================================
-- LINKSTAR — 0023: preferencias de aviso y registro de envíos
-- ============================================================================
-- La mitad de la fase 7 que NO depende de Google. Las dos alertas que salen
-- puras de escaneos:
--
--   device_idle     un expositor activo que hace N horas que no registra un
--                   toque. Es la que más rinde: un expositor mudo suele
--                   significar que alguien lo guardó en un cajón, y el cliente
--                   se entera cuando mira la factura.
--   weekly_summary  el resumen de la semana, para que el panel se acuerde de
--                   existir sin que haya que entrar.
--
-- Las alertas que dependen de reseñas (responder cinco estrellas, avisar de una
-- negativa) NO están acá: necesitan las fases 4 y 5. Cuando existan, se suman
-- como filas nuevas del enum y columnas de esta misma tabla.
--
-- ---------------------------------------------------------------------------
-- Por qué hay DOS tablas y no una
-- ---------------------------------------------------------------------------
-- `notification_preferences` es lo que el cliente elige. `notification_log` es
-- lo que efectivamente se mandó, y sin eso el ejecutor no es idempotente: un
-- expositor que lleva una semana quieto cumple la condición TODOS los días, así
-- que correr el script dos veces —o correrlo a diario— le manda el mismo aviso
-- una y otra vez hasta que el cliente marca el remitente como spam. El log es
-- lo que permite preguntar "¿ya avisé de esto?" antes de mandar.
--
-- El script se corre a mano por ahora (services/api/scripts/send-alerts.js),
-- igual que rebuild-today-rollup.js. Cuando la fase 8 habilite pg_cron, se
-- engancha ahí sin reescribir nada: la lógica vive en SQL, no en el script.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_kind') then
    create type public.notification_kind as enum ('device_idle', 'weekly_summary');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Preferencias por organización
-- ---------------------------------------------------------------------------
-- Una fila por organización, creada a demanda. La ausencia de fila NO significa
-- "sin avisos": significa "nunca lo configuró", y ahí valen los defaults de
-- abajo. Por eso el ejecutor hace left join contra esta tabla en vez de inner
-- join — si no, una cuenta nueva nunca recibiría nada.
create table if not exists public.notification_preferences (
  organization_id        uuid primary key references public.organizations(id) on delete cascade,

  device_idle_enabled    boolean not null default true,
  -- Configurable porque 48 horas no le sirve a todos: un bar abre todos los
  -- días, una peluquería cierra los lunes y un expositor en un salón de eventos
  -- puede estar bien estando quieto dos semanas.
  device_idle_hours      integer not null default 48
                           check (device_idle_hours between 6 and 720),

  weekly_summary_enabled boolean not null default true,

  -- A quién se le manda. NULL = al correo de quien creó la organización, que es
  -- el caso normal. Se separa para que una cadena pueda mandarlo a una casilla
  -- de operaciones en vez de a la persona que abrió la cuenta.
  recipient_email        citext,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------------
-- Registro de lo enviado
-- ---------------------------------------------------------------------------
create table if not exists public.notification_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             public.notification_kind not null,

  -- Para device_idle es el dispositivo; para weekly_summary queda null, porque
  -- el aviso es de toda la organización.
  entity_id        uuid,

  recipient_email  citext not null,
  sent_at          timestamptz not null default now(),

  -- Qué se mandó, para poder responder "¿por qué me llegó esto?" sin adivinar.
  metadata         jsonb not null default '{}'::jsonb
);

create index if not exists notification_log_org_kind_idx
  on public.notification_log (organization_id, kind, sent_at desc);

-- La consulta caliente del ejecutor: "¿ya avisé de ESTE dispositivo?". Parcial
-- porque sólo device_idle tiene entity_id.
create index if not exists notification_log_entity_idx
  on public.notification_log (entity_id, sent_at desc)
  where entity_id is not null;


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notification_preferences enable row level security;
alter table public.notification_log         enable row level security;

-- Las preferencias las maneja quien administra la cuenta, igual que la
-- facturación: un manager opera su sucursal, no decide a qué casilla van los
-- avisos de toda la empresa.
drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

drop policy if exists notification_preferences_write on public.notification_preferences;
create policy notification_preferences_write on public.notification_preferences
  for all to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) )
  with check ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

-- El log se lee, no se escribe desde el cliente: lo escribe el ejecutor con
-- service_role. Sin política de INSERT/UPDATE/DELETE, que es justamente lo que
-- impide que alguien borre el registro de un aviso para forzar que se reenvíe.
drop policy if exists notification_log_select on public.notification_log;
create policy notification_log_select on public.notification_log
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw_with_access()))) );

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select on public.notification_log to authenticated;


-- ---------------------------------------------------------------------------
-- Qué hay para avisar
-- ---------------------------------------------------------------------------
-- Devuelve las alertas pendientes de TODAS las organizaciones. Es del ejecutor
-- (service_role), nunca del cliente: por eso vive en `private` y queda fuera de
-- la API de PostgREST. El wrapper público de más abajo es el que se llama.
--
-- Decide qué mandar, no manda nada: el envío es del script, y así esta lógica
-- se puede consultar a mano para entender por qué llegó —o no llegó— un aviso.
create or replace function private.pending_notifications()
returns table (
  organization_id  uuid,
  organization_name text,
  kind             public.notification_kind,
  entity_id        uuid,
  recipient_email  text,
  payload          jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with prefs as (
    -- left join: una organización sin fila de preferencias usa los defaults.
    -- Con inner join, nadie recibiría nada hasta entrar a configurarlo.
    select
      o.id                                          as organization_id,
      o.name                                        as organization_name,
      coalesce(np.device_idle_enabled, true)        as device_idle_enabled,
      coalesce(np.device_idle_hours, 48)            as device_idle_hours,
      coalesce(np.weekly_summary_enabled, true)     as weekly_summary_enabled,
      coalesce(np.recipient_email::text, u.email::text) as recipient_email
    from public.organizations o
    left join public.notification_preferences np on np.organization_id = o.id
    left join auth.users u on u.id = o.created_by
    where o.deleted_at is null
      -- Sin acceso vigente no se manda nada: avisarle de sus métricas a alguien
      -- que no puede entrar a verlas es spam, no un servicio.
      and public.org_has_access(o.id)
  ),

  -- --- Expositores callados -------------------------------------------------
  idle as (
    select
      p.organization_id,
      p.organization_name,
      'device_idle'::public.notification_kind as kind,
      d.id                                    as entity_id,
      p.recipient_email,
      jsonb_build_object(
        'device_label', d.label,
        'location_name', l.name,
        'last_scan_at', d.last_scan_at,
        'idle_hours', p.device_idle_hours
      ) as payload
    from prefs p
    join public.devices d on d.organization_id = p.organization_id
    left join public.locations l on l.id = d.location_id
    where p.device_idle_enabled
      and p.recipient_email is not null
      and d.deleted_at is null
      and d.status = 'active'
      -- Un expositor recién vinculado que todavía no se escaneó nunca no es un
      -- expositor en problemas: es uno que no llegó al mostrador. Se le da el
      -- mismo plazo contado desde que se vinculó.
      and coalesce(d.last_scan_at, d.claimed_at) < now() - make_interval(hours => p.device_idle_hours)
      -- Y no se repite el aviso dentro de la misma ventana.
      and not exists (
        select 1 from public.notification_log nl
        where nl.entity_id = d.id
          and nl.kind = 'device_idle'
          and nl.sent_at > now() - make_interval(hours => p.device_idle_hours)
      )
  ),

  -- --- Resumen semanal ------------------------------------------------------
  weekly as (
    select
      p.organization_id,
      p.organization_name,
      'weekly_summary'::public.notification_kind as kind,
      null::uuid                                 as entity_id,
      p.recipient_email,
      jsonb_build_object(
        'scans_7d', coalesce(w.scans, 0),
        'scans_prev_7d', coalesce(w.prev_scans, 0),
        'active_devices', coalesce(w.active_devices, 0)
      ) as payload
    from prefs p
    left join lateral (
      select
        -- human_scans, no scans: el mail tiene que decir el mismo número que el
        -- panel (0018). Un resumen que no coincide con la pantalla es peor que
        -- no mandarlo.
        sum(r.scans - r.bot_scans) filter (where r.day > current_date - 7)::int  as scans,
        sum(r.scans - r.bot_scans) filter (where r.day > current_date - 14
                                             and r.day <= current_date - 7)::int as prev_scans,
        (select count(*) from public.devices d
          where d.organization_id = p.organization_id
            and d.deleted_at is null and d.status = 'active')                    as active_devices
      from public.scan_daily_rollups r
      where r.organization_id = p.organization_id
        and r.day > current_date - 14
    ) w on true
    where p.weekly_summary_enabled
      and p.recipient_email is not null
      and not exists (
        select 1 from public.notification_log nl
        where nl.organization_id = p.organization_id
          and nl.kind = 'weekly_summary'
          and nl.sent_at > now() - interval '6 days'
      )
  )

  select * from idle
  union all
  select * from weekly;
$$;

-- Wrapper en `public` para poder llamarlo por PostgREST desde el script, con el
-- mismo criterio que rebuild_today_rollup() (0012): la función real vive en
-- `private`, que no está expuesta.
create or replace function public.pending_notifications()
returns table (
  organization_id   uuid,
  organization_name text,
  kind              public.notification_kind,
  entity_id         uuid,
  recipient_email   text,
  payload           jsonb
)
language sql
security definer
set search_path = public, private, pg_temp
as $$ select * from private.pending_notifications(); $$;

revoke all on function public.pending_notifications() from public, anon, authenticated;
grant execute on function public.pending_notifications() to service_role;


-- ---------------------------------------------------------------------------
-- Registrar un envío
-- ---------------------------------------------------------------------------
-- La escribe el script DESPUÉS de que el proveedor aceptó el mail. Si el envío
-- falla no se registra, y la alerta vuelve a aparecer en la próxima corrida —
-- que es el comportamiento que se quiere.
create or replace function public.record_notification(
  p_organization_id uuid,
  p_kind            public.notification_kind,
  p_recipient_email text,
  p_entity_id       uuid default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notification_log
    (organization_id, kind, entity_id, recipient_email, metadata)
  values
    (p_organization_id, p_kind, p_entity_id, p_recipient_email, coalesce(p_metadata, '{}'::jsonb))
  returning id;
$$;

revoke all on function public.record_notification(uuid, public.notification_kind, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_notification(uuid, public.notification_kind, text, uuid, jsonb)
  to service_role;


comment on table public.notification_preferences is
  'Qué avisos quiere recibir cada organización. La ausencia de fila significa "no configurado" y valen los defaults, no "sin avisos".';
comment on table public.notification_log is
  'Qué se mandó efectivamente. Es lo que hace idempotente al ejecutor: sin esto, un expositor quieto genera el mismo aviso en cada corrida.';
