-- ============================================================================
-- LINKSTAR — 0018: "Escaneos" son toques humanos, en TODAS las vistas
-- ============================================================================
-- Cierra la deuda que el 0016 dejó anotada a propósito en su cabecera:
--
--   "El frontend todavía lee `scans`. Cambiarlo a `human_scans` allá solo
--    dejaría a Dispositivos mostrando un número y a Mi Empresa otro, porque
--    v_scans_daily y v_device_performance (0008) siguen agregando el `scans`
--    crudo. La migración de esa semántica se hace de una vez sobre las tres
--    pantallas y las vistas del 0008."
--
-- Esto es esa migración del lado SQL. Las tres pantallas cambian en el mismo
-- commit; ese es el punto — si sale a mitad, el panel muestra dos verdades.
--
-- ---------------------------------------------------------------------------
-- El problema, con datos de esta base
-- ---------------------------------------------------------------------------
-- `scan_daily_rollups.scans` es un count(*) crudo: incluye bots. Y "bot" acá no
-- es un atacante — la regex de resolve_scan (0011) marca `whatsapp` y
-- `facebookexternalhit`, así que cada vez que alguien comparte el link del
-- expositor por WhatsApp la preview golpea el endpoint y suma un "escaneo".
-- El 2026-08-06 quedó `scans=1, bot_scans=1, unique_scans=0`: un escaneo que el
-- panel contaba y que fue un crawler.
--
-- ---------------------------------------------------------------------------
-- Qué se toca y qué NO
-- ---------------------------------------------------------------------------
-- Las columnas viejas se quedan donde están. Esto es `create or replace view`,
-- que en Postgres sólo permite AGREGAR columnas al final: no se puede renombrar,
-- reordenar ni cambiarle el tipo a una columna existente sin dropear la vista
-- (y perder los grants). Además, pisar el significado de `scans` en silencio
-- sería peor que agregar: alguien que consulte la vista por fuera del panel
-- vería cambiar sus números sin que nada en el nombre lo avise.
--
-- Entonces, mismo vocabulario que el 0016 en las seis vistas:
--
--   scans        todo toque, bots incluidos (lo que hay en la tabla)
--   human_scans  toques humanos  ← el número que la UI rotula "Escaneos"
--   bot_scans    sólo bots, para depurar; no se muestra
--   unique_scans personas distintas (ya excluía bots desde el 0007)
--
-- Dos que ya estaban bien y quedan como están:
--
--   · `v_recent_activity` filtra `not e.is_bot` desde el 0008.
--   · `devices.total_scans` lo incrementa resolve_scan dentro de un
--     `if not v_bot then`, así que el contador denormalizado nunca contó bots.
--     Es el número que la tarjeta de Dispositivos muestra como "Escaneos", y por
--     eso ese era el único que ya decía la verdad.
--
-- ⚠️  security_invoker = on en todas, igual que el 0008 original. Un
-- `create or replace view` NO hereda las opciones de la vista anterior: si esta
-- migración se olvidara el `with (security_invoker = on)`, las seis vistas
-- pasarían a correr con los permisos del creador e ignorarían el RLS de
-- scan_daily_rollups — exactamente la fuga que el 0008 advierte en su cabecera y
-- que el 0014 vino a cerrar. Hay asserts para esto en tests/rls_isolation.sql.
--
-- ---------------------------------------------------------------------------
-- Si esto falla al aplicarse
-- ---------------------------------------------------------------------------
-- `cannot change name of view column "X" to "Y"` significa que la vista que hay
-- en Postgres NO es la que dice el 0008 — alguien la editó a mano, que ya pasó
-- una vez en este repo (ver 0017 y la nota de CLAUDE.md sobre el 0013). En ese
-- caso NO reordenes esta migración para que encaje: mirá primero qué hay
-- realmente en la base, que es lo que manda:
--
--   select pg_get_viewdef('public.v_scans_daily'::regclass, true);
--
-- y recién ahí decidí si corresponde un `drop view ... cascade` + recrear (con
-- sus grants) en una migración nueva.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Serie diaria de toda la organización (el gráfico de barras de Dispositivos)
-- ---------------------------------------------------------------------------
create or replace view public.v_scans_daily
with (security_invoker = on) as
select
  r.organization_id,
  r.day,
  sum(r.scans)                     as scans,
  sum(r.unique_scans)              as unique_scans,
  coalesce(rev.new_reviews, 0)     as estimated_reviews,
  -- ↓ nuevas
  sum(r.scans - r.bot_scans)       as human_scans,
  sum(r.bot_scans)                 as bot_scans
from public.scan_daily_rollups r
left join lateral (
  select sum(rd.new_reviews)::int as new_reviews
  from public.review_deltas rd
  where rd.organization_id = r.organization_id
    and rd.day = r.day
) rev on true
group by r.organization_id, r.day, rev.new_reviews;

-- ---------------------------------------------------------------------------
-- Rendimiento por dispositivo (las tarjetas de Dispositivos)
-- ---------------------------------------------------------------------------
-- `total_scans` sigue siendo el contador de devices (histórico, ya sin bots).
-- Lo que cambia son las ventanas de 7 y 30 días, que salían de los rollups
-- crudos.
create or replace view public.v_device_performance
with (security_invoker = on) as
select
  d.id                              as device_id,
  d.organization_id,
  d.location_id,
  d.employee_id,
  d.label,
  d.kind,
  d.form_factor,
  d.status,
  d.public_id,
  l.name                            as location_name,
  emp.full_name                     as employee_name,
  d.total_scans,
  d.last_scan_at,
  coalesce(m30.scans, 0)            as scans_30d,
  coalesce(m30.unique_scans, 0)     as unique_scans_30d,
  coalesce(m7.scans, 0)             as scans_7d,
  -- ↓ nuevas
  coalesce(m30.human_scans, 0)      as human_scans_30d,
  coalesce(m30.bot_scans, 0)        as bot_scans_30d,
  coalesce(m7.human_scans, 0)       as human_scans_7d
from public.devices d
left join public.locations l   on l.id = d.location_id
left join public.employees emp on emp.id = d.employee_id
left join lateral (
  select
    sum(scans)::int                 as scans,
    sum(unique_scans)::int          as unique_scans,
    sum(scans - bot_scans)::int     as human_scans,
    sum(bot_scans)::int             as bot_scans
  from public.scan_daily_rollups r
  where r.device_id = d.id and r.day > current_date - 30
) m30 on true
left join lateral (
  select
    sum(scans)::int                 as scans,
    sum(scans - bot_scans)::int     as human_scans
  from public.scan_daily_rollups r
  where r.device_id = d.id and r.day > current_date - 7
) m7 on true
where d.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Ranking de empleados
-- ---------------------------------------------------------------------------
-- El `rank()` sigue ordenando por unique_scans, que nunca contó bots: el orden
-- del ranking no se mueve con esta migración, sólo se suma la columna que la
-- pantalla va a rotular "Escaneos" cuando exista (hoy no la consume nadie).
create or replace view public.v_employee_leaderboard
with (security_invoker = on) as
select
  e.id                              as employee_id,
  e.organization_id,
  e.location_id,
  e.full_name,
  e.role_title,
  e.avatar_url,
  coalesce(sum(r.scans), 0)::int         as scans_30d,
  coalesce(sum(r.unique_scans), 0)::int  as unique_scans_30d,
  rank() over (
    partition by e.organization_id
    order by coalesce(sum(r.unique_scans), 0) desc
  )                                 as position,
  -- ↓ nueva
  coalesce(sum(r.scans - r.bot_scans), 0)::int as human_scans_30d
from public.employees e
left join public.scan_daily_rollups r
       on r.employee_id = e.id and r.day > current_date - 30
where e.deleted_at is null and e.is_active
group by e.id, e.organization_id, e.location_id, e.full_name, e.role_title, e.avatar_url;

-- ---------------------------------------------------------------------------
-- Rendimiento por ubicación
-- ---------------------------------------------------------------------------
-- Acá el arreglo es doble. La vista NO tenía ninguna columna de escaneos: sólo
-- `unique_scans_30d`, y la pantalla de Ubicaciones la mostraba rotulada
-- "Escaneos". Personas distintas y toques no son lo mismo — un local con 40
-- toques de 12 clientes mostraba 12. `human_scans_30d` es el número que va en
-- esa etiqueta; `unique_scans_30d` se queda porque es lo que alimenta
-- conversion_rate (dividir reseñas por toques repetidos infla el denominador).
create or replace view public.v_location_performance
with (security_invoker = on) as
select
  l.id                              as location_id,
  l.organization_id,
  l.name,
  l.city,
  coalesce(sum(r.unique_scans), 0)::int  as unique_scans_30d,
  coalesce(rev.new_reviews, 0)           as new_reviews_30d,
  snap.total_reviews                     as total_reviews,
  snap.average_rating,
  case
    when coalesce(sum(r.unique_scans), 0) > 0
    then round(100.0 * coalesce(rev.new_reviews, 0) / sum(r.unique_scans), 1)
    else null
  end                                    as conversion_rate,
  -- ↓ nuevas
  coalesce(sum(r.scans - r.bot_scans), 0)::int as human_scans_30d,
  coalesce(sum(r.bot_scans), 0)::int           as bot_scans_30d
from public.locations l
left join public.scan_daily_rollups r
       on r.location_id = l.id and r.day > current_date - 30
left join lateral (
  select sum(rd.new_reviews)::int as new_reviews
  from public.review_deltas rd
  where rd.location_id = l.id and rd.day > current_date - 30
) rev on true
left join lateral (
  select s.total_reviews, s.average_rating
  from public.location_review_snapshots s
  where s.location_id = l.id and s.source = 'google'
  order by s.captured_on desc
  limit 1
) snap on true
where l.deleted_at is null
group by l.id, l.organization_id, l.name, l.city, rev.new_reviews,
         snap.total_reviews, snap.average_rating;

-- ---------------------------------------------------------------------------
-- Las 4 tarjetas de KPI, con comparación contra el mes anterior
-- ---------------------------------------------------------------------------
-- Nadie la consume todavía (Mi Empresa es la fase 2 del roadmap). Se migra
-- igual, ahora: es más barato que descubrir en la fase 2 que el KPI general no
-- coincide con la suma de las tarjetas de Dispositivos.
create or replace view public.v_dashboard_kpis
with (security_invoker = on) as
with cur as (
  select organization_id,
         sum(scans)::int              as scans,
         sum(unique_scans)::int       as unique_scans,
         sum(scans - bot_scans)::int  as human_scans
  from public.scan_daily_rollups
  where day > current_date - 30
  group by organization_id
),
prev as (
  select organization_id,
         sum(scans)::int              as scans,
         sum(unique_scans)::int       as unique_scans,
         sum(scans - bot_scans)::int  as human_scans
  from public.scan_daily_rollups
  where day > current_date - 60 and day <= current_date - 30
  group by organization_id
),
rev_cur as (
  select organization_id, sum(new_reviews)::int as reviews
  from public.review_deltas
  where day > current_date - 30
  group by organization_id
),
rev_prev as (
  select organization_id, sum(new_reviews)::int as reviews
  from public.review_deltas
  where day > current_date - 60 and day <= current_date - 30
  group by organization_id
),
dev as (
  select organization_id,
         count(*) filter (where status = 'active') as active_devices,
         count(*)                                  as total_devices
  from public.devices
  where deleted_at is null
  group by organization_id
)
select
  o.id                                       as organization_id,
  coalesce(cur.scans, 0)                     as total_scans,
  coalesce(rev_cur.reviews, 0)               as estimated_reviews,
  coalesce(dev.active_devices, 0)            as active_devices,
  coalesce(dev.total_devices, 0)             as total_devices,
  case
    when coalesce(cur.unique_scans, 0) > 0
    then round(100.0 * coalesce(rev_cur.reviews, 0) / cur.unique_scans, 1)
    else null
  end                                        as conversion_rate,
  case
    when coalesce(prev.scans, 0) > 0
    then round(100.0 * (coalesce(cur.scans, 0) - prev.scans) / prev.scans, 1)
    else null
  end                                        as scans_change_pct,
  case
    when coalesce(rev_prev.reviews, 0) > 0
    then round(100.0 * (coalesce(rev_cur.reviews, 0) - rev_prev.reviews) / rev_prev.reviews, 1)
    else null
  end                                        as reviews_change_pct,
  -- ↓ nuevas. `human_scans` es lo que va en la tarjeta "Escaneos" y
  -- `human_scans_change_pct` la flecha de variación que la acompaña; las dos
  -- viejas quedan para no romper a nadie que ya las lea.
  coalesce(cur.human_scans, 0)               as human_scans,
  case
    when coalesce(prev.human_scans, 0) > 0
    then round(100.0 * (coalesce(cur.human_scans, 0) - prev.human_scans) / prev.human_scans, 1)
    else null
  end                                        as human_scans_change_pct
from public.organizations o
left join cur       on cur.organization_id      = o.id
left join prev      on prev.organization_id     = o.id
left join rev_cur   on rev_cur.organization_id  = o.id
left join rev_prev  on rev_prev.organization_id = o.id
left join dev       on dev.organization_id      = o.id
where o.deleted_at is null;

-- `create or replace view` conserva los grants de la vista anterior, así que
-- los `grant select ... to authenticated` del 0008 siguen en pie. Se repiten
-- igual: es idempotente, y si alguna vista fuera recreada a mano en el futuro
-- (la historia del 0013/0017 en este repo) esta línea evita que quede muda.
grant select on
  public.v_scans_daily,
  public.v_device_performance,
  public.v_employee_leaderboard,
  public.v_location_performance,
  public.v_dashboard_kpis
to authenticated;
