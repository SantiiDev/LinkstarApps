-- ============================================================================
-- LINKSTAR — Test de aislamiento multi-tenant
-- ============================================================================
-- Corré esto contra la base LOCAL (supabase db reset primero). Si algún
-- assert falla, hay una fuga entre clientes.
--
--   psql "$DATABASE_URL" -f tests/rls_isolation.sql
--
-- El test simula lo que hace PostgREST: se pone el rol `authenticated` y se
-- fija el claim `sub` del JWT. Es exactamente el contexto en el que corren las
-- queries de tu frontend.
-- ============================================================================

begin;

-- --- Semilla: dos organizaciones que no deben verse entre sí ---
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test',  '{"full_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test', '{"full_name":"Beto"}'),
  ('33333333-3333-3333-3333-333333333333', 'caro@bar-uno.test', '{"full_name":"Caro"}')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Bar Uno', 'bar-uno', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Bar Dos', 'bar-dos', '22222222-2222-2222-2222-222222222222');

-- El trigger organizations_bootstrap (0013) le crea a cada org una suscripción
-- 'free' activa, que limita a 1 sola ubicación y que además exige un expositor
-- vinculado para dar acceso (org_is_activated, 0015). Este test no prueba ni
-- límites de plan ni activación, sino aislamiento entre tenants, así que las
-- dos organizaciones arrancan en un plan pago. La activación se prueba aparte,
-- en la sección 5.
update public.subscriptions set plan_code = 'business';

-- Caro es manager de Bar Uno, acotada a una sola sucursal.
insert into public.memberships (id, organization_id, user_id, role) values
  ('cccccccc-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', 'manager');

insert into public.locations (id, organization_id, name) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Centro'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Pichincha'),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'Fisherton');

insert into public.membership_locations (membership_id, location_id) values
  ('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001');

-- --- Helper para simular un usuario logueado ---
create or replace function pg_temp.login(p_user uuid, p_email text)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'email', p_email, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function pg_temp.check(p_label text, p_condition boolean)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice '  OK   %', p_label;
  else
    raise exception 'FALLA: %', p_label;
  end if;
end;
$$;

-- =========================================================================
-- 1. Ana (owner de Bar Uno) ve lo suyo y nada más
-- =========================================================================
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check(
  'Ana ve exactamente 1 organización',
  (select count(*) from public.organizations) = 1
);

select pg_temp.check(
  'Ana ve sus 2 ubicaciones y ninguna de Bar Dos',
  (select count(*) from public.locations) = 2
);

select pg_temp.check(
  'Ana NO puede leer la ubicación de Bar Dos por id directo',
  (select count(*) from public.locations
   where id = 'dddddddd-0000-0000-0000-000000000003') = 0
);

-- =========================================================================
-- 2. Beto (owner de Bar Dos) tampoco cruza la frontera
-- =========================================================================
select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');

select pg_temp.check(
  'Beto ve sólo su ubicación',
  (select count(*) from public.locations) = 1
);

select pg_temp.check(
  'Beto no ve empleados ajenos',
  (select count(*) from public.employees) = 0
);

-- Intento de escritura cruzada: debe fallar o no afectar filas.
do $$
declare v_rows int;
begin
  update public.locations
  set name = 'HACKEADO'
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    raise exception 'FALLA: Beto pudo modificar % ubicaciones de Bar Uno', v_rows;
  end if;
  raise notice '  OK   Beto no puede modificar ubicaciones de Bar Uno';
end;
$$;

-- =========================================================================
-- 3. Caro (manager acotada) ve una sola sucursal de su propia organización
-- =========================================================================
select pg_temp.login('33333333-3333-3333-3333-333333333333', 'caro@bar-uno.test');

select pg_temp.check(
  'Caro (manager) ve sólo la sucursal que tiene asignada',
  (select count(*) from public.locations) = 1
);

select pg_temp.check(
  'Caro ve la organización a la que pertenece',
  (select count(*) from public.organizations) = 1
);

select pg_temp.check(
  'Caro NO ve la facturación (es manager, no admin)',
  (select count(*) from public.subscriptions) = 0
);

-- =========================================================================
-- 4. Un anónimo no ve absolutamente nada de negocio
-- =========================================================================
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', null, true);

select pg_temp.check(
  'anon no ve organizaciones',
  (select count(*) from public.organizations) = 0
);

select pg_temp.check(
  'anon no ve dispositivos',
  (select count(*) from public.devices) = 0
);

select pg_temp.check(
  'anon SÍ ve el catálogo público de planes',
  (select count(*) from public.plans) > 0
);

-- anon no puede ejecutar la función de redirección
do $$
begin
  perform public.resolve_scan('cualquiera');
  raise exception 'FALLA: anon pudo ejecutar resolve_scan';
exception
  when insufficient_privilege then
    raise notice '  OK   anon no puede ejecutar resolve_scan';
end;
$$;

-- =========================================================================
-- 5. Suscripción vencida: se cortan los datos, NO la facturación (0014)
--
-- El caso que importa: si a Ana se le vence el plan tiene que dejar de ver
-- ubicaciones, empleados y métricas, pero tiene que seguir viendo su
-- organización y su suscripción — si no, no puede volver a pagar.
-- =========================================================================
reset role;

update public.subscriptions
set status      = 'cancelled',
    grace_until = null
where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check(
  'Ana sin suscripción activa NO ve sus ubicaciones',
  (select count(*) from public.locations) = 0
);

select pg_temp.check(
  'Ana sin suscripción activa NO ve sus dispositivos',
  (select count(*) from public.devices) = 0
);

select pg_temp.check(
  'Ana sin suscripción activa NO ve sus métricas',
  (select count(*) from public.scan_daily_rollups) = 0
);

select pg_temp.check(
  'Ana SÍ sigue viendo su organización',
  (select count(*) from public.organizations) = 1
);

select pg_temp.check(
  'Ana SÍ sigue viendo su suscripción (para poder pagarla)',
  (select count(*) from public.subscriptions) = 1
);

-- Tampoco puede crear ubicaciones nuevas mientras no pague.
do $$
declare v_rows int;
begin
  insert into public.locations (organization_id, name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Sucursal sin pagar');
  get diagnostics v_rows = row_count;
  raise exception 'FALLA: Ana pudo crear una ubicación sin suscripción activa';
exception
  when insufficient_privilege then
    raise notice '  OK   Ana no puede crear ubicaciones sin suscripción activa';
end;
$$;

-- =========================================================================
-- 6. Plan gratis sin expositor vinculado: tampoco entra (0015)
--
-- La suscripción está perfecta (gratis, activa) pero no hay ningún
-- dispositivo, así que org_is_activated() es falso y el panel queda cerrado.
-- Al vincular uno, se abre. Este es el caso que separa org_has_access() de
-- org_is_activated().
-- =========================================================================
reset role;

update public.subscriptions
set plan_code        = 'free',
    status           = 'active',
    grace_until      = null,
    plan_selected_at = now()
where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.check(
  'Plan gratis SIN expositor: org_has_access sí, org_is_activated no',
  public.org_has_access('aaaaaaaa-0000-0000-0000-000000000001')
  and not public.org_is_activated('aaaaaaaa-0000-0000-0000-000000000001')
);

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check(
  'Ana en gratis sin expositor NO ve sus ubicaciones',
  (select count(*) from public.locations) = 0
);

-- Vincula el expositor y se abre el panel.
reset role;

insert into public.devices (organization_id, kind, form_factor, status, claimed_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'google_review', 'nfc_stand', 'active', now());

select pg_temp.check(
  'Con un expositor vinculado, la organización queda activada',
  public.org_is_activated('aaaaaaaa-0000-0000-0000-000000000001')
);

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check(
  'Ana en gratis CON expositor vuelve a ver sus ubicaciones',
  (select count(*) from public.locations) = 2
);

-- =========================================================================
-- 7. Las vistas del dashboard tampoco filtran de menos (0008 y 0016)
--
-- Por defecto una vista de Postgres corre con los permisos de QUIEN LA CREÓ,
-- no de quien la consulta: ignora el RLS de las tablas de abajo y le devuelve
-- a cualquier usuario logueado los datos de todos los clientes. Es la fuga
-- multi-tenant más silenciosa que hay — el RLS está perfecto, todos los
-- asserts de las secciones anteriores pasan, y la vista filtra igual.
--
-- `security_invoker = on` es lo que lo evita. Esta sección existe para que, si
-- alguien recrea una vista y se olvida el flag, el test falle en vez de que se
-- entere un cliente.
-- =========================================================================
reset role;

-- Las dos organizaciones vuelven a un plan pago: esta sección prueba
-- aislamiento, no límites de plan (la sección 6 dejó a Bar Uno en gratis, que
-- tope 3 dispositivos).
update public.subscriptions set plan_code = 'business', status = 'active';

insert into public.employees (id, organization_id, location_id, full_name) values
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', 'Mozo Uno'),
  ('ffffffff-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000003', 'Mozo Dos');

insert into public.devices (id, organization_id, location_id, employee_id, kind, form_factor, status, claimed_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
   'google_review', 'nfc_stand', 'active', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002', null,
   'google_review', 'nfc_stand', 'active', now()),
  ('eeeeeeee-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000002',
   'google_review', 'nfc_stand', 'active', now());

-- Métricas de un día, con bots incluidos para poder verificar human_scans.
insert into public.scan_daily_rollups
  (organization_id, day, location_id, device_id, employee_id, kind, scans, unique_scans, bot_scans)
values
  -- Bar Uno / Centro — la única sucursal que Caro tiene asignada
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date, 'dddddddd-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
   'google_review', 10, 4, 2),
  -- Bar Uno / Pichincha — Caro NO la tiene asignada
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date, 'dddddddd-0000-0000-0000-000000000002',
   'eeeeeeee-0000-0000-0000-000000000002', null,
   'google_review', 7, 3, 1),
  -- Bar Dos
  ('bbbbbbbb-0000-0000-0000-000000000002', current_date, 'dddddddd-0000-0000-0000-000000000003',
   'eeeeeeee-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000002',
   'google_review', 99, 50, 9);

-- --- Ana (owner de Bar Uno) ve sus dos dispositivos y ninguno de Bar Dos ---
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check(
  'v_device_scans_daily: Ana ve sus 2 dispositivos y ninguno ajeno',
  (select count(*) from public.v_device_scans_daily) = 2
);

select pg_temp.check(
  'v_device_scans_daily: Ana NO ve el dispositivo de Bar Dos por id directo',
  (select count(*) from public.v_device_scans_daily
   where device_id = 'eeeeeeee-0000-0000-0000-000000000003') = 0
);

select pg_temp.check(
  'v_location_scans_daily: Ana ve sus 2 ubicaciones',
  (select count(*) from public.v_location_scans_daily) = 2
);

select pg_temp.check(
  'v_employee_scans_daily: Ana ve sólo a su empleado',
  (select count(*) from public.v_employee_scans_daily) = 1
);

-- Los 99 escaneos de Bar Dos no pueden aparecer en ningún total de Ana.
select pg_temp.check(
  'Ana no ve ni un escaneo de Bar Dos en los totales',
  (select coalesce(sum(scans), 0) from public.v_device_scans_daily) = 17
);

-- human_scans = scans - bot_scans, que es el número que el panel llama
-- "Escaneos". Centro: 10 toques, 2 de bots -> 8 humanos.
select pg_temp.check(
  'human_scans descuenta los bots (10 - 2 = 8)',
  (select human_scans from public.v_device_scans_daily
   where device_id = 'eeeeeeee-0000-0000-0000-000000000001') = 8
);

-- --- Caro (manager acotada a Centro) ve una sola sucursal, también en vistas ---
select pg_temp.login('33333333-3333-3333-3333-333333333333', 'caro@bar-uno.test');

select pg_temp.check(
  'v_location_scans_daily: Caro ve sólo la sucursal que tiene asignada',
  (select count(*) from public.v_location_scans_daily) = 1
);

select pg_temp.check(
  'v_device_scans_daily: Caro no ve el dispositivo de la sucursal ajena',
  (select count(*) from public.v_device_scans_daily) = 1
);

-- --- Beto (owner de Bar Dos) ve lo suyo y nada de Bar Uno ---
select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');

select pg_temp.check(
  'v_device_scans_daily: Beto ve sólo su dispositivo',
  (select count(*) from public.v_device_scans_daily) = 1
);

select pg_temp.check(
  'Beto ve sus 99 escaneos y ninguno de Bar Uno',
  (select coalesce(sum(scans), 0) from public.v_device_scans_daily) = 99
);

-- --- Un anónimo no ve absolutamente nada en ninguna de las tres ---
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', null, true);

select pg_temp.check(
  'anon no ve nada en v_device_scans_daily',
  (select count(*) from public.v_device_scans_daily) = 0
);

select pg_temp.check(
  'anon no ve nada en v_location_scans_daily',
  (select count(*) from public.v_location_scans_daily) = 0
);

select pg_temp.check(
  'anon no ve nada en v_employee_scans_daily',
  (select count(*) from public.v_employee_scans_daily) = 0
);

-- Las vistas del 0008 corren sobre las mismas tablas y el mismo riesgo.
select pg_temp.check(
  'anon no ve nada en v_device_performance (0008)',
  (select count(*) from public.v_device_performance) = 0
);

select pg_temp.check(
  'anon no ve nada en v_scans_daily (0008)',
  (select count(*) from public.v_scans_daily) = 0
);

reset role;

do $$ begin
  raise notice '';
  raise notice '=== Todos los tests de aislamiento pasaron ===';
end $$;

rollback;
