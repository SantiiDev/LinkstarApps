-- ============================================================================
-- LINKSTAR — 0006: Row Level Security
-- ============================================================================
-- Con un SPA de Vite no hay backend propio: el navegador habla directo con
-- PostgREST usando la anon key, que es PÚBLICA por diseño. Cualquiera puede
-- abrir la consola y hacer `supabase.from('scan_events').select('*')`.
-- Lo único que separa a un cliente de los datos de otro son estas políticas.
--
-- Dos detalles de implementación que valen mucho:
--
--  1. Los helpers son SECURITY DEFINER. Eso evita la recursión infinita clásica:
--     la política de `memberships` necesita leer `memberships`, y si la lectura
--     estuviera sujeta a RLS, Postgres entraría en bucle.
--
--  2. Los helpers devuelven uuid[], así que la comparación es `= any (...)`.
--     `x = any(fn())` a secas hace que Postgres ejecute fn() UNA VEZ POR FILA.
--     `x = any((select unnest(fn())))` fuerza un InitPlan: fn() se ejecuta una
--     sola vez por query y se compara contra el array ya resuelto. En una
--     tabla de 500k escaneos la diferencia es de segundos a milisegundos.
--     (Ojo: `x = any((select fn()))` SIN el unnest no compila — ANY(subquery)
--     espera filas escalares, no una fila que contenga un array; Postgres
--     tira "operator does not exist: uuid = uuid[]".)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de permisos
-- ---------------------------------------------------------------------------

-- Organizaciones a las que pertenece el usuario actual, opcionalmente
-- filtradas por rol.
create or replace function private.user_org_ids(p_roles public.org_role[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and (p_roles is null or m.role = any(p_roles));
$$;

-- Ubicaciones visibles para el usuario actual.
--   owner / admin / viewer — todas las de sus organizaciones
--   manager                — sólo las asignadas en membership_locations
create or replace function private.visible_location_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct l.id), '{}'::uuid[])
  from public.memberships m
  join public.locations l on l.organization_id = m.organization_id
  left join public.membership_locations ml
         on ml.membership_id = m.id and ml.location_id = l.id
  where m.user_id = auth.uid()
    and l.deleted_at is null
    and (m.role <> 'manager' or ml.location_id is not null);
$$;

revoke all on function private.user_org_ids(public.org_role[]) from public, anon;
revoke all on function private.visible_location_ids() from public, anon;
grant execute on function private.user_org_ids(public.org_role[]) to authenticated, service_role;
grant execute on function private.visible_location_ids() to authenticated, service_role;

-- Atajos legibles para usar dentro de las políticas.
-- security definer acá también: son wrappers finitos de user_org_ids(), pero
-- al no ser security definer heredarían los privilegios de quien las llama
-- (authenticated), que no tiene USAGE sobre el schema `private` — cualquier
-- policy que las use fallaría con "permission denied for schema private".
create or replace function private.orgs_rw()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select private.user_org_ids(array['owner','admin']::public.org_role[]); $$;

create or replace function private.orgs_manage()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select private.user_org_ids(array['owner','admin','manager']::public.org_role[]); $$;

create or replace function private.orgs_owner()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select private.user_org_ids(array['owner']::public.org_role[]); $$;

grant execute on function private.orgs_rw()     to authenticated;
grant execute on function private.orgs_manage() to authenticated;
grant execute on function private.orgs_owner()  to authenticated;

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
alter table public.organizations enable row level security;
alter table public.organizations force row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using ( id = any ((select unnest(private.user_org_ids()))) and deleted_at is null );

-- Cualquiera autenticado puede crear su propia organización (onboarding).
-- El trigger de 0007 le asigna la membresía de owner automáticamente.
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check ( created_by = (select auth.uid()) );

create policy organizations_update on public.organizations
  for update to authenticated
  using  ( id = any ((select unnest(private.orgs_rw()))) )
  with check ( id = any ((select unnest(private.orgs_rw()))) );

create policy organizations_delete on public.organizations
  for delete to authenticated
  using ( id = any ((select unnest(private.orgs_owner()))) );

-- ============================================================================
-- PROFILES
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Cada uno ve su propio perfil...
create policy profiles_select_self on public.profiles
  for select to authenticated
  using ( id = (select auth.uid()) );

-- ...y el de sus compañeros de organización (para mostrar el listado de equipo).
create policy profiles_select_teammates on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = public.profiles.id
        and m.organization_id = any ((select unnest(private.user_org_ids())))
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ============================================================================
-- MEMBERSHIPS
-- ============================================================================
alter table public.memberships enable row level security;
alter table public.memberships force row level security;

create policy memberships_select on public.memberships
  for select to authenticated
  using ( organization_id = any ((select unnest(private.user_org_ids()))) );

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check ( organization_id = any ((select unnest(private.orgs_rw()))) );

create policy memberships_update on public.memberships
  for update to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_rw()))) )
  with check ( organization_id = any ((select unnest(private.orgs_rw()))) );

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_rw())))
    -- ...o uno mismo abandonando la organización
    or user_id = (select auth.uid())
  );

-- ============================================================================
-- MEMBERSHIP_LOCATIONS
-- ============================================================================
alter table public.membership_locations enable row level security;
alter table public.membership_locations force row level security;

create policy membership_locations_select on public.membership_locations
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id
        and m.organization_id = any ((select unnest(private.user_org_ids())))
    )
  );

create policy membership_locations_write on public.membership_locations
  for all to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id
        and m.organization_id = any ((select unnest(private.orgs_rw())))
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id
        and m.organization_id = any ((select unnest(private.orgs_rw())))
    )
  );

-- ============================================================================
-- INVITATIONS
-- ============================================================================
alter table public.invitations enable row level security;
alter table public.invitations force row level security;

create policy invitations_select on public.invitations
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw()))) );

create policy invitations_write on public.invitations
  for all to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_rw()))) )
  with check ( organization_id = any ((select unnest(private.orgs_rw()))) );

-- El que acepta la invitación todavía NO es miembro, así que no puede leer
-- esta tabla. La aceptación se hace por RPC (ver 0007).

-- ============================================================================
-- LOCATIONS
-- ============================================================================
alter table public.locations enable row level security;
alter table public.locations force row level security;

create policy locations_select on public.locations
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.user_org_ids())))
    and id = any ((select unnest(private.visible_location_ids())))
    and deleted_at is null
  );

create policy locations_insert on public.locations
  for insert to authenticated
  with check ( organization_id = any ((select unnest(private.orgs_rw()))) );

create policy locations_update on public.locations
  for update to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_rw()))) )
  with check ( organization_id = any ((select unnest(private.orgs_rw()))) );

create policy locations_delete on public.locations
  for delete to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw()))) );

-- ============================================================================
-- EMPLOYEES
-- ============================================================================
alter table public.employees enable row level security;
alter table public.employees force row level security;

create policy employees_select on public.employees
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.user_org_ids())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
    and deleted_at is null
  );

create policy employees_write on public.employees
  for all to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_manage()))) )
  with check ( organization_id = any ((select unnest(private.orgs_manage()))) );

-- ============================================================================
-- DEVICES
-- ============================================================================
alter table public.devices enable row level security;
alter table public.devices force row level security;

create policy devices_select on public.devices
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.user_org_ids())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
    and deleted_at is null
  );

-- OJO: no hay política de INSERT. Los dispositivos no se crean desde la app:
-- se fabrican (proceso interno con service_role) y se vinculan por RPC con el
-- claim_code. Si dejaras crear dispositivos desde el cliente, cualquiera se
-- daría de alta expositores infinitos y saltearía los límites del plan.
create policy devices_update on public.devices
  for update to authenticated
  using  ( organization_id = any ((select unnest(private.orgs_manage()))) )
  with check ( organization_id = any ((select unnest(private.orgs_manage()))) );

-- ============================================================================
-- SCAN_EVENTS — sólo lectura desde el cliente, jamás escritura.
-- ============================================================================
alter table public.scan_events enable row level security;
alter table public.scan_events force row level security;

revoke insert, update, delete on public.scan_events from anon, authenticated;

create policy scan_events_select on public.scan_events
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.user_org_ids())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
  );

-- ============================================================================
-- ROLLUPS, RESEÑAS Y AUDITORÍA — lectura para el tenant, escritura sólo por jobs
-- ============================================================================
alter table public.scan_daily_rollups enable row level security;
alter table public.scan_daily_rollups force row level security;
revoke insert, update, delete on public.scan_daily_rollups from anon, authenticated;

create policy rollups_select on public.scan_daily_rollups
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.user_org_ids())))
    and (location_id is null or location_id = any ((select unnest(private.visible_location_ids()))))
  );

alter table public.location_review_snapshots enable row level security;
alter table public.location_review_snapshots force row level security;
revoke insert, update, delete on public.location_review_snapshots from anon, authenticated;

create policy review_snapshots_select on public.location_review_snapshots
  for select to authenticated
  using ( location_id = any ((select unnest(private.visible_location_ids()))) );

alter table public.review_deltas enable row level security;
alter table public.review_deltas force row level security;
revoke insert, update, delete on public.review_deltas from anon, authenticated;

create policy review_deltas_select on public.review_deltas
  for select to authenticated
  using ( location_id = any ((select unnest(private.visible_location_ids()))) );

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
revoke insert, update, delete on public.audit_log from anon, authenticated;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw()))) );

-- ============================================================================
-- FACTURACIÓN
-- ============================================================================
alter table public.plans enable row level security;

-- El catálogo de planes es público: lo necesita la landing antes del login.
create policy plans_public_select on public.plans
  for select to anon, authenticated
  using ( is_public = true );

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- Sólo owner/admin ven la facturación. Un manager no tiene por qué saber
-- cuánto paga la empresa.
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw()))) );

alter table public.subscription_payments enable row level security;
alter table public.subscription_payments force row level security;
revoke insert, update, delete on public.subscription_payments from anon, authenticated;

create policy subscription_payments_select on public.subscription_payments
  for select to authenticated
  using ( organization_id = any ((select unnest(private.orgs_rw()))) );

-- ============================================================================
-- PEDIDOS (sitio de venta)
-- ============================================================================
alter table public.orders enable row level security;
alter table public.orders force row level security;
revoke all on public.orders from anon;
revoke insert, update, delete on public.orders from authenticated;

-- El comprador ve sus pedidos por email verificado, aunque todavía no tenga
-- organización creada.
create policy orders_select on public.orders
  for select to authenticated
  using (
    organization_id = any ((select unnest(private.orgs_rw())))
    or buyer_email = ((select auth.jwt()) ->> 'email')::citext
  );

alter table public.order_items enable row level security;
alter table public.order_items force row level security;
revoke all on public.order_items from anon;
revoke insert, update, delete on public.order_items from authenticated;

create policy order_items_select on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.organization_id = any ((select unnest(private.orgs_rw())))
          or o.buyer_email = ((select auth.jwt()) ->> 'email')::citext
        )
    )
  );

-- ============================================================================
-- Cinturón y tiradores: negar por defecto en cualquier tabla futura.
-- Si mañana creás una tabla y te olvidás del RLS, esto evita el desastre.
-- ============================================================================
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
