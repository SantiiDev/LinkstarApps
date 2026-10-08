-- ============================================================================
-- LINKSTAR — 0034: el historial que promete cada plan, aplicado
-- ============================================================================
-- plans.data_retention_days (0005, valores en 0013: gratis 30 · Business 365 ·
-- Enterprise 1095) existía desde el principio y no lo aplicaba nadie: una cuenta
-- gratis veía toda su historia, y la política de privacidad del panel ya decía
-- que «los eventos individuales se borran pasado ese plazo». Esta migración lo
-- hace verdad, en dos partes que no son lo mismo:
--
--   1. QUÉ VE el cliente. Las políticas de lectura de escaneos, rollups, reseñas
--      estimadas (snapshots y deltas) y métricas/búsquedas de Google cortan en
--      el inicio del historial de su plan. Es un corte de LECTURA: los rollups y
--      las métricas se conservan, así que una cuenta que pasa a Business
--      recupera su historia en el acto. Las reseñas individuales y su análisis
--      NO se cortan (decisión del 8/10/2026): son las reseñas públicas del
--      propio cliente, y esconderlas confunde más de lo que vende.
--
--   2. QUÉ GUARDAMOS. Los escaneos crudos (scan_events, el 99 % del volumen) se
--      borran pasado el plazo del plan, con un piso de 30 días. Los rollups no:
--      son lo que el panel lee (invariante 2) y lo que el upgrade devuelve.
--      private.purge_old_scan_events() (0007, 400 días fijos para todos) queda
--      sin uso; lo reemplaza purge_scan_events_by_plan(), que corre desde el
--      job diario de Railway (scripts/rebuild-rollups.js), no desde pg_cron.
--
-- El piso de 30 días también protege a los rollups: reconstruir un día cuyos
-- escaneos crudos ya se borraron lo dejaría en CERO (DELETE + INSERT de
-- nada). Por eso rebuild_today_rollup() rechaza días anteriores al piso.
--
-- Los días son UTC, como el resto de los cortes (decisión 10, abierta).
-- service_role no pasa por RLS: los jobs (alertas, resumen semanal) leen igual.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. EL INICIO DEL HISTORIAL DE UNA ORGANIZACIÓN
-- ---------------------------------------------------------------------------
-- El plan sale de la suscripción, no del acceso: una org sin acceso ya no ve
-- nada por orgs_with_access(), y una Business cancelada que todavía no eligió
-- gratis conserva sus 365 días hasta que lo haga. Sin suscripción o con un
-- plan que no está en el catálogo (el 'trial' viejo de antes de la 0013), 30:
-- lo más restrictivo.
create or replace function private.org_retention_days(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.data_retention_days
       from public.subscriptions s
       join public.plans p on p.code = s.plan_code
      where s.organization_id = p_org),
    30
  );
$$;

create or replace function private.org_history_start(p_org uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select current_date - private.org_retention_days(p_org); $$;

revoke all on function private.org_retention_days(uuid) from public, anon;
revoke all on function private.org_history_start(uuid) from public, anon;
grant execute on function private.org_retention_days(uuid) to authenticated, service_role;
grant execute on function private.org_history_start(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. QUÉ VE EL CLIENTE — políticas de lectura con el corte por fecha
-- ---------------------------------------------------------------------------
-- Cada política conserva sus condiciones de siempre (0006 / 0014 / 0029) y
-- suma una. Las vistas del panel (0008, 0016, 0018) son security_invoker, así
-- que heredan el corte sin tocarlas.
--
-- org_history_start() se evalúa por fila. Es una búsqueda por clave primaria;
-- si algún día pesa, se reemplaza por un arreglo (org, inicio) como el de
-- orgs_with_access().

drop policy if exists scan_events_select on public.scan_events;
create policy scan_events_select on public.scan_events
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_with_access())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
    and occurred_at >= private.org_history_start(organization_id)
  );

drop policy if exists rollups_select on public.scan_daily_rollups;
create policy rollups_select on public.scan_daily_rollups
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_with_access())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
    and day >= private.org_history_start(organization_id)
  );

drop policy if exists review_snapshots_select on public.location_review_snapshots;
create policy review_snapshots_select on public.location_review_snapshots
  for select to authenticated
  using (
    location_id = any ((select unnest(private.visible_location_ids())))
    and captured_on >= private.org_history_start(organization_id)
  );

drop policy if exists review_deltas_select on public.review_deltas;
create policy review_deltas_select on public.review_deltas
  for select to authenticated
  using (
    location_id = any ((select unnest(private.visible_location_ids())))
    and day >= private.org_history_start(organization_id)
  );

-- Las búsquedas son mensuales: entra el mes que contiene el inicio del
-- historial, así una cuenta gratis ve el mes en curso y el anterior.
drop policy if exists google_search_keywords_select on public.google_search_keywords;
create policy google_search_keywords_select on public.google_search_keywords
  for select to authenticated
  using (
    private.org_has_business(organization_id)
    and month >= date_trunc('month', private.org_history_start(organization_id))::date
    and (
      organization_id = any ((select unnest(
        private.orgs_with_access(array['owner','admin','viewer']::public.org_role[])
      )))
      or google_location_id in (
        select gl.id from public.google_locations gl
        where gl.location_id = any ((select unnest(private.visible_location_ids())))
      )
    )
  );

-- google_daily_metrics no se lee directo (sin política para authenticated):
-- todo pasa por esta RPC, que es security definer y por eso corta a mano.
-- Mismo cuerpo que la 0029; el único cambio es recortar p_from.
create or replace function public.google_metrics_daily(p_org uuid, p_from date, p_to date)
returns table (
  day                        date,
  google_location_id         uuid,
  location_id                uuid,
  impressions                integer,
  impressions_desktop_maps   integer,
  impressions_desktop_search integer,
  impressions_mobile_maps    integer,
  impressions_mobile_search  integer,
  direction_requests         integer,
  call_clicks                integer,
  website_clicks             integer,
  bookings                   integer,
  food_menu_clicks           integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_all_locations boolean;
  v_business      boolean;
  v_from          date;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;

  v_all_locations := p_org = any (private.orgs_with_access(array['owner','admin','viewer']::public.org_role[]));
  v_business := private.org_has_business(p_org);
  -- Pedir antes del inicio del historial no es un error: se devuelve lo que
  -- el plan deja ver, y el panel dice por qué el período arranca después.
  v_from := greatest(p_from, private.org_history_start(p_org));

  return query
    select
      m.day,
      m.google_location_id,
      gl.location_id,
      (m.impressions_desktop_maps + m.impressions_desktop_search
        + m.impressions_mobile_maps + m.impressions_mobile_search)::integer,
      case when v_business then m.impressions_desktop_maps end,
      case when v_business then m.impressions_desktop_search end,
      case when v_business then m.impressions_mobile_maps end,
      case when v_business then m.impressions_mobile_search end,
      m.direction_requests,
      m.call_clicks,
      m.website_clicks,
      m.bookings,
      m.food_menu_clicks
    from public.google_daily_metrics m
    join public.google_locations gl on gl.id = m.google_location_id
    join public.locations l on l.id = gl.location_id and l.deleted_at is null
    where m.organization_id = p_org
      and m.day between v_from and p_to
      and (
        v_all_locations
        or gl.location_id = any (private.visible_location_ids())
      )
    order by m.day, m.google_location_id;
end;
$$;

revoke all on function public.google_metrics_daily(uuid, date, date) from public, anon;
grant execute on function public.google_metrics_daily(uuid, date, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. QUÉ GUARDAMOS — purga de escaneos crudos según el plan
-- ---------------------------------------------------------------------------
-- Un DELETE con el corte de cada org calculado una vez por org, no por fila.
-- Irreversible: el job la corre con --dry-run primero la primera vez
-- (scripts/rebuild-rollups.js informa cuántas borraría sin borrar).
create or replace function private.purge_scan_events_by_plan(p_dry_run boolean default false)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if p_dry_run then
    select count(*) into v_rows
      from public.scan_events e
      join public.organizations o on o.id = e.organization_id
     where e.occurred_at < now() - make_interval(days => greatest(private.org_retention_days(o.id), 30));
    return v_rows;
  end if;

  with cut as (
    select o.id as organization_id,
           now() - make_interval(days => greatest(private.org_retention_days(o.id), 30)) as before
      from public.organizations o
  )
  delete from public.scan_events e
   using cut
   where e.organization_id = cut.organization_id
     and e.occurred_at < cut.before;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function private.purge_scan_events_by_plan(boolean) from public, anon, authenticated;

-- El envoltorio en `public` para que el job lo llame por PostgREST, como
-- run_expire_subscriptions() (0028). Sólo service_role.
create or replace function public.run_purge_scan_events(p_dry_run boolean default false)
returns integer
language sql
security definer
set search_path = public, private, pg_temp
as $$ select private.purge_scan_events_by_plan(p_dry_run); $$;

revoke all on function public.run_purge_scan_events(boolean) from public, anon, authenticated;
grant execute on function public.run_purge_scan_events(boolean) to service_role;


-- ---------------------------------------------------------------------------
-- 4. NO RECONSTRUIR UN DÍA YA PURGADO
-- ---------------------------------------------------------------------------
-- Mismo envoltorio que la 0012, con una guarda: antes del piso de 30 días los
-- escaneos crudos de una cuenta gratis ya no existen, y el DELETE + INSERT de
-- rebuild_daily_rollups() reemplazaría su total por cero sin avisar. El job
-- diario sólo reconstruye ayer y hoy; esto frena un uso manual equivocado.
create or replace function public.rebuild_today_rollup(p_day date default current_date)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_day < current_date - 30 then
    raise exception 'No se reconstruye el %: sus escaneos crudos pueden estar purgados y el total quedaría en cero', p_day
      using errcode = '22023', hint = 'day_purged';
  end if;
  return private.rebuild_daily_rollups(p_day);
end;
$$;

revoke all on function public.rebuild_today_rollup(date) from public, anon, authenticated;
grant execute on function public.rebuild_today_rollup(date) to service_role;
