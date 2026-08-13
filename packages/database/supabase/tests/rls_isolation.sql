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
-- 'free' activa, que limita a 1 sola ubicación. Este test necesita 2 para Bar
-- Uno, así que le subimos el plan antes de sembrar los datos (no estamos
-- probando límites de plan acá, sino aislamiento entre tenants).
update public.subscriptions set plan_code = 'business'
where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

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

reset role;

do $$ begin
  raise notice '';
  raise notice '=== Todos los tests de aislamiento pasaron ===';
end $$;

rollback;
