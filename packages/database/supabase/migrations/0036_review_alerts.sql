-- ============================================================================
-- 0036 — Alertas de reseñas: valoración baja y palabras clave
-- ============================================================================
-- Las dos alertas de Automatizaciones que no necesitan IA. Corren para TODOS los
-- planes (como en Tapstar, y como las de escaneos de la 0023), sobre las reseñas
-- que ya guarda sync-google (0024/0025). Las manda el mismo ejecutor:
-- scripts/send-alerts.js lee public.pending_notifications(), que esta migración
-- reemplaza con la misma firma.
--
-- Tres decisiones que son fáciles de deshacer sin querer:
--
--   1. ARRANCAN APAGADAS. A diferencia de las de escaneos (que valen por defecto
--      aunque no haya fila), éstas hay que activarlas: un mail por cada reseña
--      floja que nadie pidió es spam.
--
--   2. SÓLO MIRAN RESEÑAS NUEVAS. Al prenderse, el trigger de abajo anota
--      `*_enabled_at`, y sólo cuentan las reseñas creadas desde entonces. Sin
--      eso, activar la regla mandaría un mail por cada reseña de 1★ de la
--      historia.
--
--   3. NO SE REPITEN. Una reseña ya avisada a un destinatario queda en
--      notification_log (entity_id = la reseña) y no vuelve a salir para él.
--
-- Las reseñas sólo se leen una vez por día (job `daily`, 8:00), así que el aviso
-- puede llegar hasta un día después de la reseña. Para acortarlo se puede sumar
-- en Railway un cron que corra sólo sync-google + send-alerts cada hora (ver
-- services/api/DEPLOY.md); esta migración no cambia con eso.
--
-- Pendiente para más adelante: reglas por local (hoy valen para todos los
-- locales de la organización).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------
-- `extensions.citext` calificado: ver la nota de la 0023.
alter table public.notification_preferences
  add column if not exists low_rating_enabled       boolean not null default false,
  add column if not exists low_rating_stars         smallint[] not null default '{1,2}',
  add column if not exists low_rating_recipients    extensions.citext[] not null default '{}',
  add column if not exists low_rating_enabled_at    timestamptz,
  add column if not exists keyword_alert_enabled    boolean not null default false,
  add column if not exists keyword_alert_terms      text[] not null default '{}',
  add column if not exists keyword_alert_recipients extensions.citext[] not null default '{}',
  add column if not exists keyword_alert_enabled_at timestamptz;

-- Las estrellas que ofrece la pantalla son 1, 2 y 3. Más es «valoración baja»
-- sólo de nombre.
create or replace function private.valid_low_rating_stars(p_stars smallint[])
returns boolean
language sql
immutable
as $$
  select coalesce(array_length(p_stars, 1), 0) between 1 and 3
     and not exists (select 1 from unnest(p_stars) s where s is null or s not between 1 and 3);
$$;

create or replace function private.valid_alert_terms(p_terms text[])
returns boolean
language sql
immutable
as $$
  select coalesce(array_length(p_terms, 1), 0) <= 20
     and not exists (
       select 1 from unnest(p_terms) t
       where t is null or length(btrim(t)) not between 2 and 40
     );
$$;

create or replace function private.valid_alert_recipients(p_emails extensions.citext[])
returns boolean
language sql
immutable
as $$
  select coalesce(array_length(p_emails, 1), 0) <= 10
     and not exists (
       select 1 from unnest(p_emails) e
       where e is null or e::text !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     );
$$;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_low_rating_stars_check,
  add constraint notification_preferences_low_rating_stars_check
    check (private.valid_low_rating_stars(low_rating_stars)),
  drop constraint if exists notification_preferences_keyword_terms_check,
  add constraint notification_preferences_keyword_terms_check
    check (private.valid_alert_terms(keyword_alert_terms)),
  drop constraint if exists notification_preferences_low_rating_recipients_check,
  add constraint notification_preferences_low_rating_recipients_check
    check (private.valid_alert_recipients(low_rating_recipients)),
  drop constraint if exists notification_preferences_keyword_recipients_check,
  add constraint notification_preferences_keyword_recipients_check
    check (private.valid_alert_recipients(keyword_alert_recipients));


-- ---------------------------------------------------------------------------
-- «Desde cuándo»: lo anota la base, no el cliente
-- ---------------------------------------------------------------------------
-- Al pasar de apagada a prendida se anota now(). Si lo mandara el navegador, un
-- reloj atrasado (o un `enabled_at` viejo a propósito) haría que la regla avise
-- de reseñas anteriores a la activación.
create or replace function private.notification_preferences_enabled_at()
returns trigger
language plpgsql
as $$
begin
  if new.low_rating_enabled
     and (tg_op = 'INSERT' or not old.low_rating_enabled) then
    new.low_rating_enabled_at := now();
  elsif tg_op = 'UPDATE' then
    new.low_rating_enabled_at := old.low_rating_enabled_at;
  elsif not new.low_rating_enabled then
    new.low_rating_enabled_at := null;
  end if;

  if new.keyword_alert_enabled
     and (tg_op = 'INSERT' or not old.keyword_alert_enabled) then
    new.keyword_alert_enabled_at := now();
  elsif tg_op = 'UPDATE' then
    new.keyword_alert_enabled_at := old.keyword_alert_enabled_at;
  elsif not new.keyword_alert_enabled then
    new.keyword_alert_enabled_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists notification_preferences_enabled_at on public.notification_preferences;
create trigger notification_preferences_enabled_at
  before insert or update on public.notification_preferences
  for each row execute function private.notification_preferences_enabled_at();


-- ---------------------------------------------------------------------------
-- Texto comparable: minúsculas y sin tildes
-- ---------------------------------------------------------------------------
-- `unaccent` no está instalado (0001), y para esto alcanza con translate(). La ñ
-- se deja: «año» y «ano» no son la misma palabra.
create or replace function private.fold_text(p_text text)
returns text
language sql
immutable
as $$
  select translate(lower(coalesce(p_text, '')), 'áàäâéèëêíìïîóòöôúùüû', 'aaaaeeeeiiiioooouuuu');
$$;

-- El texto original de una reseña. Google manda las traducidas como
-- «(Translated by Google) … (Original) …»; se guardan tal cual (ver
-- originalReviewText() en el panel) y acá se usa lo que escribió el cliente.
create or replace function private.review_original_text(p_comment text)
returns text
language sql
immutable
as $$
  select case
    when p_comment like '(Translated by Google)%' and position('(Original)' in p_comment) > 0
      then btrim(substr(p_comment, position('(Original)' in p_comment) + length('(Original)')), E' \n\r\t')
    else coalesce(p_comment, '')
  end;
$$;


-- ---------------------------------------------------------------------------
-- Qué hay para avisar (reemplaza la de la 0023, misma firma)
-- ---------------------------------------------------------------------------
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
      coalesce(np.recipient_email::text, u.email::text) as recipient_email,
      -- Las de reseñas: apagadas si no hay fila (decisión 1 de arriba).
      coalesce(np.low_rating_enabled, false)        as low_rating_enabled,
      coalesce(np.low_rating_stars, '{1,2}')        as low_rating_stars,
      np.low_rating_recipients                      as low_rating_recipients,
      np.low_rating_enabled_at                      as low_rating_enabled_at,
      coalesce(np.keyword_alert_enabled, false)     as keyword_alert_enabled,
      coalesce(np.keyword_alert_terms, '{}')        as keyword_alert_terms,
      np.keyword_alert_recipients                   as keyword_alert_recipients,
      np.keyword_alert_enabled_at                   as keyword_alert_enabled_at
    from public.organizations o
    left join public.notification_preferences np on np.organization_id = o.id
    left join auth.users u on u.id = o.created_by
    where o.deleted_at is null
      -- Sin acceso vigente no se manda nada: avisarle de sus métricas a alguien
      -- que no puede entrar a verlas es spam, no un servicio.
      and public.org_has_access(o.id)
  ),

  -- --- Expositores callados (igual que la 0023) -----------------------------
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
      and coalesce(d.last_scan_at, d.claimed_at) < now() - make_interval(hours => p.device_idle_hours)
      and not exists (
        select 1 from public.notification_log nl
        where nl.entity_id = d.id
          and nl.kind = 'device_idle'
          and nl.sent_at > now() - make_interval(hours => p.device_idle_hours)
      )
  ),

  -- --- Resumen semanal (igual que la 0023) ----------------------------------
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
  ),

  -- --- Reseñas candidatas ----------------------------------------------------
  -- Sólo de fichas vinculadas a una sucursal viva: lo mismo que deja guardar la
  -- 0025. Una ficha sin vincular no tiene reseñas, pero se filtra igual por si
  -- el sync todavía no podó.
  reviews as (
    select
      r.id,
      r.organization_id,
      r.star_rating,
      r.created_time,
      r.reviewer_name,
      r.is_anonymous,
      private.review_original_text(r.comment) as original_text,
      l.name                                   as location_name
    from public.google_reviews r
    join public.google_locations gl on gl.id = r.google_location_id
    join public.locations l on l.id = gl.location_id and l.deleted_at is null
    -- Una semana alcanza: lo más viejo que puede faltar es lo que entró el día
    -- en que el job no corrió. Acota la búsqueda sin cambiar el resultado.
    where r.created_time > now() - interval '7 days'
  ),

  -- --- Valoración baja --------------------------------------------------------
  low_rating as (
    select
      p.organization_id,
      p.organization_name,
      'low_rating'::public.notification_kind as kind,
      rv.id                                  as entity_id,
      rcpt.email                             as recipient_email,
      jsonb_build_object(
        'location_name', rv.location_name,
        'star_rating', rv.star_rating,
        'reviewer_name', case when rv.is_anonymous then null else rv.reviewer_name end,
        'excerpt', left(rv.original_text, 300),
        'created_time', rv.created_time
      ) as payload
    from prefs p
    join reviews rv on rv.organization_id = p.organization_id
    cross join lateral unnest(
      case when coalesce(array_length(p.low_rating_recipients, 1), 0) > 0
           then p.low_rating_recipients::text[]
           else array[p.recipient_email] end
    ) as rcpt(email)
    where p.low_rating_enabled
      and p.low_rating_enabled_at is not null
      and rv.created_time >= p.low_rating_enabled_at
      and rv.star_rating = any (p.low_rating_stars)
      and rcpt.email is not null
      and not exists (
        select 1 from public.notification_log nl
        where nl.entity_id = rv.id
          and nl.kind = 'low_rating'
          and nl.recipient_email = rcpt.email
      )
  ),

  -- --- Palabras clave --------------------------------------------------------
  keyword as (
    select
      p.organization_id,
      p.organization_name,
      'review_keyword'::public.notification_kind as kind,
      rv.id                                      as entity_id,
      rcpt.email                                 as recipient_email,
      jsonb_build_object(
        'location_name', rv.location_name,
        'star_rating', rv.star_rating,
        'reviewer_name', case when rv.is_anonymous then null else rv.reviewer_name end,
        'excerpt', left(rv.original_text, 300),
        'created_time', rv.created_time,
        'matched_terms', m.terms
      ) as payload
    from prefs p
    join reviews rv on rv.organization_id = p.organization_id
    -- Por coincidencia de texto, sin tildes ni mayúsculas: «lento» encuentra
    -- «Lentos» y «LENTO».
    cross join lateral (
      select array_agg(t order by t) as terms
      from unnest(p.keyword_alert_terms) t
      where position(private.fold_text(btrim(t)) in private.fold_text(rv.original_text)) > 0
    ) m
    cross join lateral unnest(
      case when coalesce(array_length(p.keyword_alert_recipients, 1), 0) > 0
           then p.keyword_alert_recipients::text[]
           else array[p.recipient_email] end
    ) as rcpt(email)
    where p.keyword_alert_enabled
      and p.keyword_alert_enabled_at is not null
      and rv.created_time >= p.keyword_alert_enabled_at
      and m.terms is not null
      and rcpt.email is not null
      and not exists (
        select 1 from public.notification_log nl
        where nl.entity_id = rv.id
          and nl.kind = 'review_keyword'
          and nl.recipient_email = rcpt.email
      )
  )

  select * from idle
  union all
  select * from weekly
  union all
  select * from low_rating
  union all
  select * from keyword;
$$;

revoke all on function private.pending_notifications() from public, anon, authenticated;


comment on column public.notification_preferences.low_rating_enabled_at is
  'Cuándo se prendió la alerta de valoración baja (lo pone el trigger). Sólo se avisa de reseñas creadas desde entonces.';
comment on column public.notification_preferences.keyword_alert_enabled_at is
  'Cuándo se prendió la alerta por palabras clave (lo pone el trigger). Sólo se avisa de reseñas creadas desde entonces.';
