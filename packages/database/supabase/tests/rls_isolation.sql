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
-- 'free' activa, que limita a 1 sola ubicación. Este test no prueba límites de
-- plan sino aislamiento entre tenants, así que las dos organizaciones arrancan
-- en un plan pago. El acceso se prueba aparte, en las secciones 5 y 6.
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
-- 6. Plan gratis sin expositor vinculado: SÍ entra (0022, que revirtió 0015)
--
-- Hasta la 0022 esta sección probaba lo contrario —gratis sin dispositivo
-- quedaba afuera—. La regla se sacó porque el expositor llega días después del
-- alta y dejaba afuera justo al que ya había comprado. Ahora org_is_activated()
-- vale lo mismo que org_has_access(), y esto asegura que nadie reintroduzca la
-- condición del dispositivo sin darse cuenta.
-- =========================================================================
reset role;

update public.subscriptions
set plan_code        = 'free',
    status           = 'active',
    grace_until      = null,
    plan_selected_at = now()
where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.check(
  'Plan gratis SIN expositor: org_has_access y org_is_activated (0022)',
  public.org_has_access('aaaaaaaa-0000-0000-0000-000000000001')
  and public.org_is_activated('aaaaaaaa-0000-0000-0000-000000000001')
);

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check(
  'Ana en gratis sin expositor SÍ ve sus ubicaciones',
  (select count(*) from public.locations) = 2
);

-- Vincular un expositor no cambia nada del acceso. Se inserta igual porque las
-- secciones siguientes parten de este estado.
reset role;

insert into public.devices (organization_id, kind, form_factor, status, claimed_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'google_review', 'nfc_stand', 'active', now());

select pg_temp.check(
  'Con un expositor vinculado, la organización sigue activada',
  public.org_is_activated('aaaaaaaa-0000-0000-0000-000000000001')
);

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check(
  'Ana en gratis CON expositor sigue viendo sus ubicaciones',
  (select count(*) from public.locations) = 2
);

-- =========================================================================
-- 7. Las vistas del dashboard tampoco filtran de menos (0008, 0016 y 0018)
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

-- Estos dos inserts son, además de fixture, la regresión del 0019: hasta esa
-- migración TODO insert sobre employees moría con `record "new" has no field
-- "employee_id"`, porque private.check_same_org() —compartida con devices—
-- resolvía new.employee_id incluso disparando sobre una tabla que no la tiene.
-- Si alguien vuelve a colapsar los dos IF anidados de esa función en un solo
-- `and`, esta sección deja de correr acá mismo.
insert into public.employees (id, organization_id, location_id, full_name) values
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', 'Mozo Uno'),
  ('ffffffff-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000003', 'Mozo Dos');

select pg_temp.check(
  '0019: se pueden crear empleados (el trigger compartido con devices no explota)',
  (select count(*) from public.employees
   where id in ('ffffffff-0000-0000-0000-000000000001',
                'ffffffff-0000-0000-0000-000000000002')) = 2
);

-- Y la otra mitad: el chequeo que la función SÍ tiene que hacer sigue vivo —
-- un dispositivo no puede apuntar a un empleado de otra organización.
do $$
begin
  insert into public.devices (organization_id, location_id, employee_id, kind, form_factor, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
          'ffffffff-0000-0000-0000-000000000002',  -- empleado de Bar Dos
          'google_review', 'nfc_card', 'active');  -- tarjeta: sólo prueba la regla de organización (0028)
  raise exception 'FALLO: se pudo asignar un empleado de otra organización a un dispositivo';
exception
  when foreign_key_violation then
    raise notice '   OK   Un dispositivo no acepta un empleado de otra organización';
end $$;

-- Los que tienen empleado son tarjetas personales: desde la 0028 un expositor
-- no se puede asignar a un empleado.
insert into public.devices (id, organization_id, location_id, employee_id, kind, form_factor, status, claimed_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
   'google_review', 'nfc_card', 'active', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002', null,
   'google_review', 'nfc_stand', 'active', now()),
  ('eeeeeeee-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000002',
   'google_review', 'nfc_card', 'active', now());

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

-- --- Las mismas cuentas, ahora en las vistas del 0008 (migración 0018) -------
-- Bar Uno tiene hoy dos filas de rollup: Centro (10 toques, 2 bots) y Pichincha
-- (7 toques, 1 bot). O sea 17 crudos, 14 humanos, 3 bots. El punto de esta
-- tanda es que TODAS las vistas coincidan en ese 14 — que era exactamente lo que
-- no pasaba antes del 0018, con cada pantalla leyendo una columna distinta.

select pg_temp.check(
  'v_scans_daily: human_scans descuenta los bots de toda la org (17 - 3 = 14)',
  (select coalesce(sum(human_scans), 0) from public.v_scans_daily) = 14
);

select pg_temp.check(
  'v_scans_daily: scans sigue siendo el crudo, con bots (17)',
  (select coalesce(sum(scans), 0) from public.v_scans_daily) = 17
);

select pg_temp.check(
  'v_device_performance: human_scans_30d del dispositivo de Centro (10 - 2 = 8)',
  (select human_scans_30d from public.v_device_performance
   where device_id = 'eeeeeeee-0000-0000-0000-000000000001') = 8
);

select pg_temp.check(
  'v_device_performance: la ventana de 7 días descuenta bots igual que la de 30',
  (select human_scans_7d from public.v_device_performance
   where device_id = 'eeeeeeee-0000-0000-0000-000000000001') = 8
);

-- El bug que arregla el 0018 en esta vista no es sólo el de los bots: la
-- pantalla de Ubicaciones rotulaba "Escaneos" a unique_scans_30d, que son
-- PERSONAS. Centro tiene 8 toques humanos de 4 personas — dos números
-- distintos, y el correcto para esa etiqueta es el 8.
select pg_temp.check(
  'v_location_performance: human_scans_30d (8) no es unique_scans_30d (4)',
  (select human_scans_30d from public.v_location_performance
   where location_id = 'dddddddd-0000-0000-0000-000000000001') = 8
  and
  (select unique_scans_30d from public.v_location_performance
   where location_id = 'dddddddd-0000-0000-0000-000000000001') = 4
);

select pg_temp.check(
  'v_employee_leaderboard: human_scans_30d del mozo de Centro (10 - 2 = 8)',
  (select human_scans_30d from public.v_employee_leaderboard
   where employee_id = 'ffffffff-0000-0000-0000-000000000001') = 8
);

select pg_temp.check(
  'v_dashboard_kpis: human_scans coincide con el total de v_scans_daily (14)',
  (select human_scans from public.v_dashboard_kpis
   where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 14
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

-- --- Un anónimo no llega ni a consultarlas ------------------------------------
-- Ojo con lo que se afirma acá. La primera versión de estos asserts pedía
-- `count(*) = 0`, dando por hecho que anon podía consultar la vista y que el RLS
-- le iba a devolver cero filas. La realidad es más fuerte: el 0008 y el 0016
-- otorgan select SÓLO a `authenticated`, así que anon ni siquiera puede leer la
-- vista — Postgres corta antes, con `permission denied for view`.
--
-- Escribirlo como `count(*) = 0` no era un matiz: el assert no fallaba, ABORTABA
-- la corrida con un error, y todo lo que venía después quedaba sin ejecutar. Por
-- eso se verifica el error de permisos, que es la garantía que realmente existe.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', null, true);

do $$
declare
  v_view text;
  v_rows int;
begin
  foreach v_view in array array[
    -- 0016
    'v_device_scans_daily', 'v_location_scans_daily', 'v_employee_scans_daily',
    -- 0008, todas recreadas por el 0018: ese es justo el momento en que se
    -- pierde un `with (security_invoker = on)` o un grant sin que nadie lo note,
    -- porque create or replace view NO hereda las opciones de la vista anterior.
    'v_device_performance', 'v_scans_daily', 'v_location_performance',
    'v_employee_leaderboard', 'v_dashboard_kpis'
  ]
  loop
    begin
      execute format('select count(*) from public.%I', v_view) into v_rows;
      -- Si llegó acá es que anon PUDO consultarla. Sólo es aceptable si no
      -- devolvió nada; cualquier fila es una fuga entre tenants.
      if v_rows = 0 then
        raise notice '   OK   anon puede consultar %, pero no ve ninguna fila', v_view;
      else
        raise exception 'FALLO: anon vio % filas en %', v_rows, v_view;
      end if;
    exception
      when insufficient_privilege then
        raise notice '   OK   anon no tiene permiso ni para consultar %', v_view;
    end;
  end loop;
end $$;

reset role;

-- =========================================================================
-- 8. Google Business Profile (0024)
-- =========================================================================
-- Bar Uno conectó Google: una ficha por sucursal y una reseña en cada una.
-- Lo que se prueba: que el token cifrado no lo alcance nadie desde el cliente,
-- que las fichas y reseñas respeten el tenant y el alcance del manager, y que
-- las RPC del flujo OAuth y del job no se puedan llamar con sesión de usuario.
insert into public.google_connections (organization_id, connected_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

insert into private.google_oauth_tokens (organization_id, refresh_token_enc, key_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'texto-cifrado-de-prueba', 'v1');

insert into public.google_locations
  (id, organization_id, google_account, google_location, title, location_id) values
  ('9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'accounts/1', 'locations/1', 'Bar Uno Centro',    'dddddddd-0000-0000-0000-000000000001'),
  ('9a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'accounts/1', 'locations/2', 'Bar Uno Pichincha', 'dddddddd-0000-0000-0000-000000000002');

insert into public.google_reviews
  (organization_id, google_location_id, review_id, star_rating, created_time, updated_time) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'r1', 5, now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000002', 'r2', 4, now(), now());

-- Una ficha no se puede vincular a la sucursal de otra organización.
do $$
begin
  update public.google_locations
     set location_id = 'dddddddd-0000-0000-0000-000000000003'   -- Fisherton, de Bar Dos
   where id = '9a000000-0000-0000-0000-000000000002';
  raise exception 'FALLA: una ficha de Bar Uno quedó vinculada a una sucursal de Bar Dos';
exception
  when raise_exception then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK   el trigger rechaza vincular una ficha a una sucursal ajena';
end $$;

-- --- Ana (owner) ve todo lo de Bar Uno -------------------------------------
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check('Ana ve la conexión de Google de Bar Uno',
  (select count(*) from public.google_connections) = 1);
select pg_temp.check('Ana ve las dos fichas de Bar Uno',
  (select count(*) from public.google_locations) = 2);
select pg_temp.check('Ana ve las dos reseñas de Bar Uno',
  (select count(*) from public.google_reviews) = 2);

-- Ni siquiera la owner llega al token: vive en `private`, sin USAGE para
-- authenticated.
do $$
begin
  perform count(*) from private.google_oauth_tokens;
  raise exception 'FALLA: authenticated pudo leer private.google_oauth_tokens';
exception
  when insufficient_privilege then
    raise notice '  OK   authenticated no puede leer los tokens cifrados';
end $$;

-- Las escrituras son del API (service_role), no del cliente.
do $$
begin
  update public.google_connections set status = 'active';
  raise exception 'FALLA: authenticated pudo escribir google_connections';
exception
  when insufficient_privilege then
    raise notice '  OK   authenticated no puede escribir google_connections';
end $$;

-- Las RPC del flujo OAuth y del job son sólo de service_role.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'select public.google_oauth_begin(''11111111-1111-1111-1111-111111111111'', ''x'', ''y'')',
    'select * from public.google_oauth_consume(''x'')',
    'select * from public.google_sync_targets()',
    'select * from public.google_connection_for_admin(''11111111-1111-1111-1111-111111111111'')',
    'select public.google_save_connection(''aaaaaaaa-0000-0000-0000-000000000001'', ''11111111-1111-1111-1111-111111111111'', ''x'', ''v1'', ''{}'')'
  ]
  loop
    begin
      execute v_fn;
      raise exception 'FALLA: authenticated pudo ejecutar %', v_fn;
    exception
      when insufficient_privilege then
        raise notice '  OK   authenticated no puede ejecutar %', split_part(split_part(v_fn, 'public.', 2), '(', 1);
    end;
  end loop;
end $$;

-- --- Caro (manager de Centro) ve sólo la ficha de su sucursal ---------------
select pg_temp.login('33333333-3333-3333-3333-333333333333', 'caro@bar-uno.test');

select pg_temp.check('Caro ve que Bar Uno tiene Google conectado',
  (select count(*) from public.google_connections) = 1);
select pg_temp.check('Caro ve sólo la ficha de Centro',
  (select count(*) from public.google_locations) = 1
  and (select location_id from public.google_locations) = 'dddddddd-0000-0000-0000-000000000001');
select pg_temp.check('Caro ve sólo la reseña de Centro',
  (select count(*) from public.google_reviews) = 1);

-- --- Beto (Bar Dos) no ve nada de Bar Uno, ni puede vincular sus fichas ------
select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');

select pg_temp.check('Beto no ve la conexión de Bar Uno',
  (select count(*) from public.google_connections) = 0);
select pg_temp.check('Beto no ve las fichas de Bar Uno',
  (select count(*) from public.google_locations) = 0);
select pg_temp.check('Beto no ve las reseñas de Bar Uno',
  (select count(*) from public.google_reviews) = 0);

do $$
begin
  perform public.link_google_location('9a000000-0000-0000-0000-000000000001', null);
  raise exception 'FALLA: Beto pudo desvincular una ficha de Bar Uno';
exception
  when insufficient_privilege then
    raise notice '  OK   Beto no puede vincular ni desvincular fichas de Bar Uno';
end $$;

-- --- anon no llega ni a consultar ------------------------------------------
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', null, true);

do $$
declare
  v_table text;
begin
  foreach v_table in array array['google_connections', 'google_locations', 'google_reviews'] loop
    begin
      execute format('select count(*) from public.%I', v_table);
      raise exception 'FALLA: anon pudo consultar %', v_table;
    exception
      when insufficient_privilege then
        raise notice '  OK   anon no tiene permiso ni para consultar %', v_table;
    end;
  end loop;
end $$;

reset role;

-- =========================================================================
-- 9. Reseñas sólo de fichas vinculadas a una sucursal viva (0025)
-- =========================================================================
-- Una ficha que deja de estar vinculada pierde sus reseñas en el acto: pueden
-- ser de un tercero (la cuenta de Google que conectó administra también la
-- ficha de un cliente), y no tenemos por qué guardarlas.
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select public.link_google_location('9a000000-0000-0000-0000-000000000002', null);

select pg_temp.check('Al desvincular la ficha de Pichincha, su reseña se borra',
  (select count(*) from public.google_reviews) = 1);
select pg_temp.check('La ficha de Pichincha queda sin sucursal',
  (select location_id is null from public.google_locations
   where id = '9a000000-0000-0000-0000-000000000002'));

reset role;

-- Los borrados de sucursales son lógicos: la FK on delete set null no se
-- dispara. La sucursal borrada tiene que dejar de recibir snapshots, y la poda
-- tiene que soltar la ficha y borrar sus reseñas.
update public.locations set deleted_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000001';

select pg_temp.check('No se escribe snapshot para una sucursal borrada',
  not public.record_google_review_snapshot('9a000000-0000-0000-0000-000000000001', 10, 4.5, null));

select private.google_prune_unlinked_reviews('aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.check('Sucursal borrada: la ficha se suelta y sus reseñas se van',
  (select location_id is null from public.google_locations
   where id = '9a000000-0000-0000-0000-000000000001')
  and (select count(*) from public.google_reviews
       where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0);

-- =========================================================================
-- 10. Quién puede responder qué reseña (0026)
-- =========================================================================
-- Responder publica en Google en nombre del negocio, así que la regla tiene que
-- ser exacta: owner/admin todo lo de su organización, un manager sólo sus
-- sucursales, un viewer nada, y nadie una reseña de una ficha sin vincular.
-- Las RPC son de service_role: se llaman como postgres con el usuario de
-- parámetro, que es como las usa el API.
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'dani@bar-uno.test', '{"full_name":"Dani"}')
on conflict (id) do nothing;
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'viewer');

-- Sucursal nueva de Bar Uno (Centro quedó borrada en la sección 9), asignada a
-- Caro, con su ficha y una reseña. Pichincha vuelve a tener su ficha, con otra
-- reseña: Caro no tiene esa sucursal.
insert into public.locations (id, organization_id, name) values
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Echesortu');
insert into public.membership_locations (membership_id, location_id) values
  ('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004');

insert into public.google_locations (id, organization_id, google_account, google_location, title, location_id) values
  ('9a000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'accounts/1', 'locations/3', 'Bar Uno Echesortu', 'dddddddd-0000-0000-0000-000000000004');
update public.google_locations set location_id = 'dddddddd-0000-0000-0000-000000000002'
 where id = '9a000000-0000-0000-0000-000000000002';

insert into public.google_reviews
  (id, organization_id, google_location_id, review_id, star_rating, created_time, updated_time) values
  ('9b000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '9a000000-0000-0000-0000-000000000003', 'r3', 5, now(), now()),
  ('9b000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   '9a000000-0000-0000-0000-000000000002', 'r4', 2, now(), now()),
  ('9b000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '9a000000-0000-0000-0000-000000000001', 'r1', 4, now(), now());  -- ficha sin vincular

create or replace function pg_temp.reply_denied(p_user uuid, p_review uuid, p_code text)
returns boolean language plpgsql as $$
begin
  perform * from public.google_review_reply_target(p_user, p_review);
  return false;
exception
  when raise_exception then
    return sqlerrm like '%' || p_code || '%';
end;
$$;

select pg_temp.check('Ana (owner) puede responder en cualquier sucursal de Bar Uno',
  (select google_location from public.google_review_reply_target(
     '11111111-1111-1111-1111-111111111111', '9b000000-0000-0000-0000-000000000004')) = 'locations/2');
select pg_temp.check('Caro (manager) puede responder en su sucursal',
  (select review_id from public.google_review_reply_target(
     '33333333-3333-3333-3333-333333333333', '9b000000-0000-0000-0000-000000000003')) = 'r3');
select pg_temp.check('Caro (manager) NO puede responder en una sucursal que no tiene',
  pg_temp.reply_denied('33333333-3333-3333-3333-333333333333', '9b000000-0000-0000-0000-000000000004', 'rol_insuficiente'));
select pg_temp.check('Dani (viewer) no puede responder nada',
  pg_temp.reply_denied('44444444-4444-4444-4444-444444444444', '9b000000-0000-0000-0000-000000000003', 'rol_insuficiente'));
select pg_temp.check('Beto (otra organización) no puede responder reseñas de Bar Uno',
  pg_temp.reply_denied('22222222-2222-2222-2222-222222222222', '9b000000-0000-0000-0000-000000000003', 'rol_insuficiente'));
select pg_temp.check('Nadie responde una reseña de una ficha sin vincular',
  pg_temp.reply_denied('11111111-1111-1111-1111-111111111111', '9b000000-0000-0000-0000-000000000001', 'resena_inexistente'));

select public.google_record_reply('9b000000-0000-0000-0000-000000000003',
  '33333333-3333-3333-3333-333333333333', '¡Gracias por venir!', now());
select pg_temp.check('google_record_reply guarda la respuesta y deja registro',
  (select reply_comment from public.google_reviews where id = '9b000000-0000-0000-0000-000000000003') = '¡Gracias por venir!'
  and exists (select 1 from public.audit_log
              where action = 'google.review_replied'
                and entity_id = '9b000000-0000-0000-0000-000000000003'));

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
do $$
begin
  perform * from public.google_review_reply_target(
    '11111111-1111-1111-1111-111111111111', '9b000000-0000-0000-0000-000000000003');
  raise exception 'FALLA: authenticated pudo ejecutar google_review_reply_target';
exception
  when insufficient_privilege then
    raise notice '  OK   authenticated no puede ejecutar google_review_reply_target';
end $$;
do $$
begin
  perform public.google_record_reply('9b000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111', 'x', now());
  raise exception 'FALLA: authenticated pudo ejecutar google_record_reply';
exception
  when insufficient_privilege then
    raise notice '  OK   authenticated no puede ejecutar google_record_reply';
end $$;
reset role;

-- =========================================================================
-- 11. Selector de organización (0027)
-- =========================================================================
-- Ana entra también a Bar Dos, como viewer. Hasta la 0027 nada escribía
-- last_organization_id, así que caía siempre en Bar Uno (su membresía más
-- vieja). Lo que se prueba: que pueda elegir, que las tres funciones que leen
-- la organización activa la sigan, y que no pueda elegir una ajena.
-- created_at explícito y posterior: dentro de la transacción del test now() no
-- avanza, y con las dos membresías empatadas «la más vieja» quedaba librada al
-- orden físico de las filas (el test pasaba o fallaba según qué otros datos
-- hubiera en la base).
insert into public.memberships (organization_id, user_id, role, created_at) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'viewer', now() + interval '1 minute');

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

select pg_temp.check('list_my_organizations devuelve las dos organizaciones de Ana',
  (select count(*) from public.list_my_organizations()) = 2);
select pg_temp.check('Sin elegir, la activa es la más vieja (Bar Uno)',
  (select organization_id from public.list_my_organizations() where is_active)
    = 'aaaaaaaa-0000-0000-0000-000000000001'
  and (select organization_id from public.my_org_context()) = 'aaaaaaaa-0000-0000-0000-000000000001');

select public.set_active_organization('bbbbbbbb-0000-0000-0000-000000000002');

select pg_temp.check('Elegida Bar Dos: my_org_context la devuelve, con el rol de Ana ahí',
  (select organization_id from public.my_org_context()) = 'bbbbbbbb-0000-0000-0000-000000000002'
  and (select role from public.my_org_context()) = 'viewer');
select pg_temp.check('El menú marca la misma organización que el panel',
  (select organization_id from public.list_my_organizations() where is_active)
    = 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check('list_org_members sigue a la organización activa (el equipo de Bar Dos)',
  exists (select 1 from public.list_org_members() where user_id = '22222222-2222-2222-2222-222222222222')
  and not exists (select 1 from public.list_org_members() where user_id = '33333333-3333-3333-3333-333333333333'));

select public.set_active_organization('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check('Se puede volver a Bar Uno',
  (select organization_id from public.my_org_context()) = 'aaaaaaaa-0000-0000-0000-000000000001');

-- Beto no es miembro de Bar Uno: elegirla es un error, no un no-op silencioso.
select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');
do $$
begin
  perform public.set_active_organization('aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'FALLA: Beto pudo elegir una organización ajena';
exception
  when insufficient_privilege then
    raise notice '  OK   No se puede elegir una organización de la que no sos miembro';
end $$;
select pg_temp.check('Y su organización activa no cambió',
  (select organization_id from public.my_org_context()) = 'bbbbbbbb-0000-0000-0000-000000000002');
reset role;

-- =========================================================================
-- 12. Preferencias de avisos (0023), como las escribe Automatizaciones
-- =========================================================================
-- La pantalla hace upsert directo sobre notification_preferences. Owner y admin
-- pueden; un manager ni siquiera la lee (su SELECT vuelve vacío, y por eso la
-- pantalla no le muestra los valores por defecto como si fueran los reales).
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
insert into public.notification_preferences (organization_id, device_idle_hours, weekly_summary_enabled)
values ('aaaaaaaa-0000-0000-0000-000000000001', 72, false)
on conflict (organization_id) do update
  set device_idle_hours = excluded.device_idle_hours,
      weekly_summary_enabled = excluded.weekly_summary_enabled;
insert into public.notification_preferences (organization_id, device_idle_hours)
values ('aaaaaaaa-0000-0000-0000-000000000001', 24)
on conflict (organization_id) do update set device_idle_hours = excluded.device_idle_hours;
select pg_temp.check('El owner guarda y vuelve a guardar sus preferencias (upsert)',
  (select device_idle_hours from public.notification_preferences
   where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 24);

do $$
begin
  insert into public.notification_preferences (organization_id) values ('bbbbbbbb-0000-0000-0000-000000000002')
  on conflict (organization_id) do nothing;
  raise exception 'FALLA: Ana (viewer de Bar Dos) pudo escribir sus preferencias';
exception
  when insufficient_privilege then
    raise notice '  OK   Un viewer no escribe preferencias de avisos';
end $$;

select pg_temp.login('33333333-3333-3333-3333-333333333333', 'caro@bar-uno.test');
select pg_temp.check('Caro (manager) no ve las preferencias de su organización',
  (select count(*) from public.notification_preferences) = 0);

select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');
select pg_temp.check('Beto no ve las preferencias de Bar Uno',
  (select count(*) from public.notification_preferences) = 0);
reset role;

-- =========================================================================
-- 13. Empleado sólo en tarjetas personales, y vencer suscripciones (0028)
-- =========================================================================
-- Decisión 11: un expositor está sobre una mesa y no es de nadie. Asignarle un
-- empleado le acreditaría para siempre los escaneos de la mesa (invariante 1),
-- así que la base lo rechaza aunque el panel no ofrezca la opción.
create or replace function pg_temp.employee_rejected(p_sql text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception
  when check_violation then
    return sqlerrm like '%tarjeta personal%';
end;
$$;

select pg_temp.check('Un expositor (nfc_stand) no acepta un empleado',
  pg_temp.employee_rejected(
    'update public.devices set employee_id = ''ffffffff-0000-0000-0000-000000000001''
      where id = ''eeeeeeee-0000-0000-0000-000000000002'''));

select pg_temp.check('Una tarjeta no puede pasar a ser expositor con el empleado puesto',
  pg_temp.employee_rejected(
    'update public.devices set form_factor = ''qr_stand''
      where id = ''eeeeeeee-0000-0000-0000-000000000001'''));

update public.devices set form_factor = 'nfc_card'
 where id = 'eeeeeeee-0000-0000-0000-000000000002';
update public.devices set employee_id = 'ffffffff-0000-0000-0000-000000000001'
 where id = 'eeeeeeee-0000-0000-0000-000000000002';
select pg_temp.check('Una tarjeta personal sí acepta un empleado',
  (select employee_id from public.devices where id = 'eeeeeeee-0000-0000-0000-000000000002')
    = 'ffffffff-0000-0000-0000-000000000001');

select pg_temp.check('run_expire_subscriptions corre como service_role/postgres',
  public.run_expire_subscriptions() >= 0);

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
do $$
begin
  perform public.run_expire_subscriptions();
  raise exception 'FALLA: authenticated pudo ejecutar run_expire_subscriptions';
exception
  when insufficient_privilege then
    raise notice '  OK   authenticated no puede ejecutar run_expire_subscriptions';
end $$;
reset role;

-- =========================================================================
-- 14. Métricas de Google y el corte Business (0029)
-- =========================================================================
-- A esta altura Bar Uno tiene dos fichas vinculadas: Pichincha (9a..02) y
-- Echesortu (9a..03, la de Caro). Centro (9a..01) quedó suelta en la sección 9.
-- Lo que se prueba: que la tabla no se lea directo, que la RPC respete tenant y
-- manager, y que el desglose por plataforma y las palabras de búsqueda sean sólo
-- de Business.
insert into public.google_daily_metrics
  (google_location_id, day, organization_id, impressions_desktop_maps, impressions_mobile_search,
   call_clicks, direction_requests, website_clicks) values
  ('9a000000-0000-0000-0000-000000000002', current_date - 5, 'aaaaaaaa-0000-0000-0000-000000000001', 10, 20, 1, 2, 3),
  ('9a000000-0000-0000-0000-000000000003', current_date - 5, 'aaaaaaaa-0000-0000-0000-000000000001',  5,  5, 0, 1, 0),
  ('9a000000-0000-0000-0000-000000000001', current_date - 5, 'aaaaaaaa-0000-0000-0000-000000000001', 99, 99, 9, 9, 9);  -- suelta

insert into public.google_search_keywords
  (google_location_id, month, keyword, organization_id, impressions, threshold) values
  ('9a000000-0000-0000-0000-000000000002', date_trunc('month', current_date)::date, 'bar en rosario',
   'aaaaaaaa-0000-0000-0000-000000000001', 40, null),
  ('9a000000-0000-0000-0000-000000000002', date_trunc('month', current_date)::date, 'cerveza artesanal',
   'aaaaaaaa-0000-0000-0000-000000000001', null, 15);

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');

do $$
begin
  perform count(*) from public.google_daily_metrics;
  raise exception 'FALLA: authenticated pudo leer google_daily_metrics directo';
exception
  when insufficient_privilege then
    raise notice '  OK   google_daily_metrics no se lee directo (sólo por la RPC)';
end $$;

select pg_temp.check('Ana (Business) ve las dos fichas vinculadas, no la suelta',
  (select count(*) from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date)) = 2);
select pg_temp.check('El total de impresiones suma las cuatro plataformas',
  (select impressions from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date)
    where google_location_id = '9a000000-0000-0000-0000-000000000002') = 30);
select pg_temp.check('Con Business viene el desglose por plataforma',
  (select impressions_desktop_maps from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date)
    where google_location_id = '9a000000-0000-0000-0000-000000000002') = 10);
select pg_temp.check('Ana (Business) ve las palabras de búsqueda',
  (select count(*) from public.google_search_keywords) = 2);

select pg_temp.login('33333333-3333-3333-3333-333333333333', 'caro@bar-uno.test');
select pg_temp.check('Caro (manager) ve sólo las métricas de su sucursal',
  (select count(*) from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date)) = 1
  and (select google_location_id from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date))
      = '9a000000-0000-0000-0000-000000000003');
select pg_temp.check('Caro no ve palabras de una sucursal que no tiene',
  (select count(*) from public.google_search_keywords) = 0);

select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');
select pg_temp.check('Beto no ve métricas de Bar Uno',
  (select count(*) from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date)) = 0);
select pg_temp.check('Beto no ve palabras de Bar Uno',
  (select count(*) from public.google_search_keywords) = 0);
reset role;

-- Bar Uno pasa a gratis: siguen los totales, se van la plataforma y las palabras.
update public.subscriptions set plan_code = 'free'
 where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
select pg_temp.check('En gratis el total de impresiones sigue',
  (select impressions from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date)
    where google_location_id = '9a000000-0000-0000-0000-000000000002') = 30);
select pg_temp.check('En gratis el desglose por plataforma viene vacío',
  (select bool_and(impressions_desktop_maps is null and impressions_mobile_search is null)
     from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date)));
select pg_temp.check('En gratis las palabras de búsqueda no se ven',
  (select count(*) from public.google_search_keywords) = 0);
reset role;

update public.subscriptions set plan_code = 'business'
 where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', null, true);
do $$
begin
  perform * from public.google_metrics_daily('aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date);
  raise exception 'FALLA: anon pudo ejecutar google_metrics_daily';
exception
  when insufficient_privilege then
    raise notice '  OK   anon no puede ejecutar google_metrics_daily';
end $$;
reset role;

-- =========================================================================
-- 15. Escribir en la ficha y protección de ficha (0030)
-- =========================================================================
-- Misma regla que responder reseñas: owner/admin todo, manager sus sucursales,
-- viewer nada, ficha sin vincular nunca. La protección es Business, y un cambio
-- que Google mantiene no se registra dos veces.
create or replace function pg_temp.write_denied(p_user uuid, p_gl uuid, p_code text, p_business boolean default false)
returns boolean language plpgsql as $$
begin
  perform * from public.google_location_write_target(p_user, p_gl, p_business);
  return false;
exception
  when raise_exception then
    return sqlerrm like '%' || p_code || '%';
end;
$$;

select pg_temp.check('Ana (owner) puede escribir en la ficha de Pichincha',
  (select google_location from public.google_location_write_target(
     '11111111-1111-1111-1111-111111111111', '9a000000-0000-0000-0000-000000000002')) = 'locations/2');
select pg_temp.check('Caro (manager) puede escribir en la ficha de su sucursal',
  (select google_location from public.google_location_write_target(
     '33333333-3333-3333-3333-333333333333', '9a000000-0000-0000-0000-000000000003')) = 'locations/3');
select pg_temp.check('Caro (manager) NO puede escribir en una sucursal que no tiene',
  pg_temp.write_denied('33333333-3333-3333-3333-333333333333', '9a000000-0000-0000-0000-000000000002', 'rol_insuficiente'));
select pg_temp.check('Dani (viewer) no puede escribir en ninguna ficha',
  pg_temp.write_denied('44444444-4444-4444-4444-444444444444', '9a000000-0000-0000-0000-000000000002', 'rol_insuficiente'));
select pg_temp.check('Beto no puede escribir en fichas de Bar Uno',
  pg_temp.write_denied('22222222-2222-2222-2222-222222222222', '9a000000-0000-0000-0000-000000000002', 'rol_insuficiente'));
select pg_temp.check('Nadie escribe en una ficha sin vincular',
  pg_temp.write_denied('11111111-1111-1111-1111-111111111111', '9a000000-0000-0000-0000-000000000001', 'ficha_inexistente'));

select pg_temp.check('Un cambio nuevo de Google se registra',
  public.google_record_profile_change('9a000000-0000-0000-0000-000000000002',
    array['phoneNumbers'], '{"phoneNumbers":{"primaryPhone":"0800"}}', '{"phoneNumbers":{"primaryPhone":"0341"}}') is not null);
select pg_temp.check('El mismo cambio al día siguiente no se registra de nuevo',
  public.google_record_profile_change('9a000000-0000-0000-0000-000000000002',
    array['phoneNumbers'], '{"phoneNumbers":{"primaryPhone":"0800"}}', '{"phoneNumbers":{"primaryPhone":"0341"}}') is null);

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
select pg_temp.check('Ana (Business) ve el cambio detectado',
  (select count(*) from public.google_profile_changes) = 1);
select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');
select pg_temp.check('Beto no ve los cambios de Bar Uno',
  (select count(*) from public.google_profile_changes) = 0);
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
do $$
begin
  perform * from public.google_location_write_target(
    '11111111-1111-1111-1111-111111111111', '9a000000-0000-0000-0000-000000000002', false);
  raise exception 'FALLA: authenticated pudo ejecutar google_location_write_target';
exception
  when insufficient_privilege then
    raise notice '  OK   authenticated no puede ejecutar google_location_write_target';
end $$;
reset role;

select pg_temp.check('Revertir devuelve los valores del negocio',
  (select owner_values->'phoneNumbers'->>'primaryPhone' from public.google_resolve_profile_change(
     (select id from public.google_profile_changes
       where google_location_id = '9a000000-0000-0000-0000-000000000002' and status = 'pending' limit 1),
     '11111111-1111-1111-1111-111111111111', 'reverted')) = '0341');
select pg_temp.check('Si Google vuelve a meter lo mismo después de revertido, se avisa de nuevo',
  public.google_record_profile_change('9a000000-0000-0000-0000-000000000002',
    array['phoneNumbers'], '{"phoneNumbers":{"primaryPhone":"0800"}}', '{"phoneNumbers":{"primaryPhone":"0341"}}') is not null);
select pg_temp.check('Si Google deja de mostrarlo, el pendiente se cierra',
  public.google_clear_profile_changes('9a000000-0000-0000-0000-000000000002') = 1);

-- En gratis la protección no se ve ni se puede resolver.
select public.google_record_profile_change('9a000000-0000-0000-0000-000000000002',
  array['websiteUri'], '{"websiteUri":"http://otra.test"}', '{"websiteUri":"http://bar.test"}');
update public.subscriptions set plan_code = 'free'
 where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
select pg_temp.check('En gratis los cambios detectados no se ven',
  (select count(*) from public.google_profile_changes) = 0);
reset role;
select pg_temp.check('En gratis no se puede revertir',
  pg_temp.write_denied('11111111-1111-1111-1111-111111111111', '9a000000-0000-0000-0000-000000000002', 'solo_business', true));
update public.subscriptions set plan_code = 'business'
 where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- =========================================================================
-- 16. Publicaciones: quién ve la ficha, el cupo del plan gratis y las fotos (0031)
-- =========================================================================
create or replace function pg_temp.read_denied(p_user uuid, p_gl uuid)
returns boolean language plpgsql as $$
begin
  perform * from public.google_location_read_target(p_user, p_gl);
  return false;
exception
  when raise_exception then
    return sqlerrm like '%rol_insuficiente%';
end;
$$;

select pg_temp.check('Dani (viewer) puede VER la ficha aunque no la pueda editar',
  (select google_location from public.google_location_read_target(
     '44444444-4444-4444-4444-444444444444', '9a000000-0000-0000-0000-000000000002')) = 'locations/2');
select pg_temp.check('Caro (manager) no ve la ficha de una sucursal que no tiene',
  pg_temp.read_denied('33333333-3333-3333-3333-333333333333', '9a000000-0000-0000-0000-000000000002'));
select pg_temp.check('Beto no ve las fichas de Bar Uno',
  pg_temp.read_denied('22222222-2222-2222-2222-222222222222', '9a000000-0000-0000-0000-000000000002'));

create or replace function pg_temp.reserve_post(p_user uuid)
returns text language plpgsql as $$
begin
  perform public.google_post_reserve(p_user, '9a000000-0000-0000-0000-000000000002', 'STANDARD', 'Hola', null);
  return 'ok';
exception
  when raise_exception then
    return sqlerrm;
end;
$$;

-- Business: sin límite.
select pg_temp.check('Business publica dos veces en el mes',
  pg_temp.reserve_post('11111111-1111-1111-1111-111111111111') = 'ok'
  and pg_temp.reserve_post('11111111-1111-1111-1111-111111111111') = 'ok');
select pg_temp.check('Un viewer no puede publicar',
  pg_temp.reserve_post('44444444-4444-4444-4444-444444444444') like '%rol_insuficiente%');

-- Gratis: 1 por mes. Ya hay dos este mes, así que la tercera se rechaza.
update public.subscriptions set plan_code = 'free'
 where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check('En gratis, con el cupo usado, no se puede publicar',
  pg_temp.reserve_post('11111111-1111-1111-1111-111111111111') like '%cupo_agotado%');

-- Si Google rechaza, la reserva se suelta y el cupo vuelve.
delete from public.google_posts where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check('En gratis, la primera del mes entra',
  pg_temp.reserve_post('11111111-1111-1111-1111-111111111111') = 'ok');
select public.google_post_release((select id from public.google_posts
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1));
select pg_temp.check('Soltada la reserva, el cupo se puede volver a usar',
  pg_temp.reserve_post('11111111-1111-1111-1111-111111111111') = 'ok');

-- Confirmada y después borrada en Google: sigue contando.
select public.google_post_confirm((select id from public.google_posts
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1), 'accounts/1/locations/2/localPosts/9');
select public.google_post_mark_deleted('accounts/1/locations/2/localPosts/9', '11111111-1111-1111-1111-111111111111');
select pg_temp.check('Borrar una publicación no devuelve el cupo',
  pg_temp.reserve_post('11111111-1111-1111-1111-111111111111') like '%cupo_agotado%');

select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
select pg_temp.check('google_post_quota dice 1 de 1 en gratis',
  (select usadas = 1 and limite = 1 from public.google_post_quota('aaaaaaaa-0000-0000-0000-000000000001')));
reset role;
update public.subscriptions set plan_code = 'business'
 where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Fotos: cada organización escribe sólo en su carpeta del bucket.
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'ana@bar-uno.test');
insert into storage.objects (bucket_id, name)
values ('google-post-media', 'aaaaaaaa-0000-0000-0000-000000000001/foto.jpg');
select pg_temp.check('Ana sube una foto a la carpeta de Bar Uno', true);

select pg_temp.login('22222222-2222-2222-2222-222222222222', 'beto@bar-dos.test');
do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('google-post-media', 'aaaaaaaa-0000-0000-0000-000000000001/intruso.jpg');
  raise exception 'FALLA: Beto subió una foto a la carpeta de Bar Uno';
exception
  when insufficient_privilege then
    raise notice '  OK   Beto no puede subir fotos a la carpeta de Bar Uno';
end $$;
reset role;

do $$ begin
  raise notice '';
  raise notice '=== Todos los tests de aislamiento pasaron ===';
end $$;

rollback;
