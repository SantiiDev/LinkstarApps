-- ============================================================================
-- LINKSTAR — 0029: qué es Business, y las métricas de la ficha de Google
-- ============================================================================
-- Fase 4.6. Dos piezas:
--
-- ── 1. private.org_has_business() ───────────────────────────────────────────
-- Hasta acá la base sólo sabía si una organización tenía acceso (org_has_access,
-- 0005): plan vigente, cualquiera. Las pantallas de Google separan lo gratis de
-- lo Business igual que Tapstar, y lo que se corta tiene que cortarse acá, no
-- sólo en la pantalla. Business = acceso vigente y plan business o enterprise
-- (trialing cuenta: la prueba de 7 días es Business).
--
-- ── 2. Métricas de la ficha (Business Profile Performance API) ───────────────
--   google_daily_metrics   una fila por ficha y día: impresiones separadas por
--                          plataforma (Maps/Búsqueda × celular/PC) y las
--                          interacciones (llamadas, cómo llegar, web, reservas,
--                          menú). La escribe el job diario (service_role).
--   google_search_keywords mensual: con qué términos apareció la ficha. Google
--                          da el número, o un umbral («menos de 15») cuando es
--                          chico — por eso `impressions` o `threshold`.
--
-- QUÉ SE CORTA EN EL SERVIDOR. El total de impresiones y las interacciones son
-- del plan gratis. El desglose por plataforma y las palabras de búsqueda son
-- Business. Para que el corte sea real:
--   - google_daily_metrics NO tiene política de select: el panel la lee sólo por
--     google_metrics_daily(), que devuelve las cuatro columnas de plataforma en
--     null cuando la organización no es Business.
--   - google_search_keywords sí se lee directo, con RLS que exige Business.
-- La tasa de conversión y las recomendaciones NO se cortan acá: salen de números
-- que el plan gratis ya ve, así que esconderlas en la base no protegería nada.
--
-- Sólo fichas VINCULADAS a una sucursal viva, igual que las reseñas (0025).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. ¿TIENE BUSINESS?
-- ---------------------------------------------------------------------------
create or replace function private.org_has_business(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.org_has_access(p_org)
     and exists (
       select 1 from public.subscriptions s
        where s.organization_id = p_org
          and s.plan_code in ('business', 'enterprise')
     );
$$;

revoke all on function private.org_has_business(uuid) from public, anon;
grant execute on function private.org_has_business(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------------
create table if not exists public.google_daily_metrics (
  google_location_id         uuid not null references public.google_locations(id) on delete cascade,
  day                        date not null,
  organization_id            uuid not null references public.organizations(id) on delete cascade,
  impressions_desktop_maps   integer not null default 0,
  impressions_desktop_search integer not null default 0,
  impressions_mobile_maps    integer not null default 0,
  impressions_mobile_search  integer not null default 0,
  direction_requests         integer not null default 0,
  call_clicks                integer not null default 0,
  website_clicks             integer not null default 0,
  bookings                   integer not null default 0,
  food_menu_clicks           integer not null default 0,
  fetched_at                 timestamptz not null default now(),
  primary key (google_location_id, day)
);

create index if not exists google_daily_metrics_org_day_idx
  on public.google_daily_metrics (organization_id, day);

create table if not exists public.google_search_keywords (
  google_location_id uuid not null references public.google_locations(id) on delete cascade,
  month              date not null check (extract(day from month) = 1),
  keyword            text not null,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  -- Uno de los dos: Google da el número, o «menos de N» si es chico.
  impressions        integer,
  threshold          integer,
  fetched_at         timestamptz not null default now(),
  primary key (google_location_id, month, keyword),
  check (impressions is not null or threshold is not null)
);

create index if not exists google_search_keywords_org_month_idx
  on public.google_search_keywords (organization_id, month);

-- Cuándo se leyeron las métricas de cada ficha por última vez. Distingue en la
-- pantalla «Google todavía no publicó datos» de «no hubo actividad».
alter table public.google_locations
  add column if not exists metrics_synced_at timestamptz;


-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.google_daily_metrics   enable row level security;
alter table public.google_daily_metrics   force row level security;
alter table public.google_search_keywords enable row level security;
alter table public.google_search_keywords force row level security;

revoke all on public.google_daily_metrics   from anon, authenticated;
revoke all on public.google_search_keywords from anon;
revoke insert, update, delete, truncate on public.google_search_keywords from authenticated;
grant select on public.google_search_keywords to authenticated;

-- google_daily_metrics: sin políticas a propósito (ver cabecera). Se lee por la
-- RPC de abajo.

-- Mismo alcance que google_reviews_select (0024), más Business.
drop policy if exists google_search_keywords_select on public.google_search_keywords;
create policy google_search_keywords_select on public.google_search_keywords
  for select to authenticated
  using (
    private.org_has_business(organization_id)
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


-- ---------------------------------------------------------------------------
-- 4. LECTURA DE MÉTRICAS
-- ---------------------------------------------------------------------------
-- Una fila por (día, ficha) de las fichas vinculadas que el usuario puede ver:
-- owner/admin/viewer todas las de la organización, un manager las de sus
-- sucursales. `impressions` (el total) va siempre; el desglose por plataforma,
-- sólo con Business. El período anterior lo pide el panel ampliando el rango.
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
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;

  v_all_locations := p_org = any (private.orgs_with_access(array['owner','admin','viewer']::public.org_role[]));
  v_business := private.org_has_business(p_org);

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
      and m.day between p_from and p_to
      and (
        v_all_locations
        or gl.location_id = any (private.visible_location_ids())
      )
    order by m.day, m.google_location_id;
end;
$$;

revoke all on function public.google_metrics_daily(uuid, date, date) from public, anon;
grant execute on function public.google_metrics_daily(uuid, date, date) to authenticated;


comment on table public.google_daily_metrics is
  'Métricas diarias de cada ficha de Google vinculada (Performance API). Sin select directo: se lee por google_metrics_daily(), que corta el desglose por plataforma para el plan gratis.';
comment on table public.google_search_keywords is
  'Términos de búsqueda mensuales con los que apareció cada ficha. Business. impressions o threshold («menos de N»).';
