-- ============================================================================
-- LINKSTAR — 0008: Vistas del dashboard
-- ============================================================================
-- ⚠️  security_invoker = on  ⚠️
--
-- Por defecto, una vista de Postgres se ejecuta con los permisos de QUIEN LA
-- CREÓ (vos, el superusuario), no de quien la consulta. Es decir: una vista
-- normal IGNORA el RLS de las tablas que hay debajo y le devuelve a cualquier
-- cliente los datos de todos los demás.
--
-- Es la fuga de datos multi-tenant más común y más silenciosa: el RLS está
-- perfecto, las pruebas sobre las tablas pasan, y la vista filtra todo.
-- security_invoker = on hace que la vista corra con los permisos del usuario
-- que la llama. Es obligatorio en TODAS las vistas de este proyecto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Actividad reciente (el panel derecho del dashboard)
-- ---------------------------------------------------------------------------
create or replace view public.v_recent_activity
with (security_invoker = on) as
select
  'scan'::text                     as event_type,
  e.organization_id,
  e.location_id,
  d.label                          as device_label,
  d.kind,
  e.occurred_at
from public.scan_events e
join public.devices d on d.id = e.device_id
where e.occurred_at > now() - interval '7 days'
  and not e.is_bot
order by e.occurred_at desc
limit 200;

-- ---------------------------------------------------------------------------
-- Serie de los últimos N días (el gráfico de barras).
-- Se apoya en los rollups, no en scan_events: consultar 7 días de eventos
-- crudos por cada carga del dashboard es lo que te hace saltar de plan.
-- ---------------------------------------------------------------------------
create or replace view public.v_scans_daily
with (security_invoker = on) as
select
  r.organization_id,
  r.day,
  sum(r.scans)                     as scans,
  sum(r.unique_scans)              as unique_scans,
  coalesce(rev.new_reviews, 0)     as estimated_reviews
from public.scan_daily_rollups r
left join lateral (
  select sum(rd.new_reviews)::int as new_reviews
  from public.review_deltas rd
  where rd.organization_id = r.organization_id
    and rd.day = r.day
) rev on true
group by r.organization_id, r.day, rev.new_reviews;

-- ---------------------------------------------------------------------------
-- Rendimiento por dispositivo (las tarjetas de abajo)
-- ---------------------------------------------------------------------------
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
  coalesce(m7.scans, 0)             as scans_7d
from public.devices d
left join public.locations l   on l.id = d.location_id
left join public.employees emp on emp.id = d.employee_id
left join lateral (
  select sum(scans)::int as scans, sum(unique_scans)::int as unique_scans
  from public.scan_daily_rollups r
  where r.device_id = d.id and r.day > current_date - 30
) m30 on true
left join lateral (
  select sum(scans)::int as scans
  from public.scan_daily_rollups r
  where r.device_id = d.id and r.day > current_date - 7
) m7 on true
where d.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Ranking de empleados. Este es el dato que engancha al dueño del local:
-- saber qué mozo consigue reseñas y cuál no.
-- ---------------------------------------------------------------------------
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
  )                                 as position
from public.employees e
left join public.scan_daily_rollups r
       on r.employee_id = e.id and r.day > current_date - 30
where e.deleted_at is null and e.is_active
group by e.id, e.organization_id, e.location_id, e.full_name, e.role_title, e.avatar_url;

-- ---------------------------------------------------------------------------
-- Rendimiento por ubicación
-- ---------------------------------------------------------------------------
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
  end                                    as conversion_rate
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
-- Las 4 tarjetas de KPI de arriba, con la comparación contra el mes anterior.
-- ---------------------------------------------------------------------------
create or replace view public.v_dashboard_kpis
with (security_invoker = on) as
with cur as (
  select organization_id,
         sum(scans)::int         as scans,
         sum(unique_scans)::int  as unique_scans
  from public.scan_daily_rollups
  where day > current_date - 30
  group by organization_id
),
prev as (
  select organization_id,
         sum(scans)::int         as scans,
         sum(unique_scans)::int  as unique_scans
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
  end                                        as reviews_change_pct
from public.organizations o
left join cur       on cur.organization_id      = o.id
left join prev      on prev.organization_id     = o.id
left join rev_cur   on rev_cur.organization_id  = o.id
left join rev_prev  on rev_prev.organization_id = o.id
left join dev       on dev.organization_id      = o.id
where o.deleted_at is null;

grant select on
  public.v_recent_activity,
  public.v_scans_daily,
  public.v_device_performance,
  public.v_employee_leaderboard,
  public.v_location_performance,
  public.v_dashboard_kpis
to authenticated;
