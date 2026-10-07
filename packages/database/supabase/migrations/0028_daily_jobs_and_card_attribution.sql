-- ============================================================================
-- LINKSTAR — 0028: el job diario hace lo que hacía el cron, y empleados sólo
--                  por tarjeta personal
-- ============================================================================
-- Dos cosas independientes, juntas porque las dos son correcciones de lo que
-- ya está en producción y conviene subirlas antes que el resto de la fase 4.
--
-- ── 1. Vencer suscripciones desde el job diario ──────────────────────────────
-- Los cuatro cron.schedule de la 0007 siguen comentados y pg_cron no está
-- habilitado. El API ya corre un job diario en Railway (scripts/daily.js), así
-- que ese job pasa a hacer dos de esas cuatro tareas:
--
--   rollups   public.rebuild_today_rollup(día)   — ya existe (0012)
--   vencer    public.run_expire_subscriptions()  — este envoltorio
--
-- private.expire_subscriptions() vive en `private`, que PostgREST no expone,
-- así que hace falta el mismo envoltorio delgado que la 0012 le puso al rollup.
-- No reimplementa nada.
--
-- ── 2. Un empleado se atribuye sólo por tarjeta personal (decisión 11) ───────
-- Un expositor está sobre una mesa y no es de nadie; la tarjeta personal sí. Y
-- como scan_events congela employee_id en el momento del escaneo (invariante
-- 1), asignarle un mozo a un expositor le acredita para siempre las reseñas que
-- consiguió la mesa. Hasta ahora la regla estaba escrita pero nada la aplicaba:
-- el modal de Dispositivos ofrecía «Empleado» para cualquier dispositivo.
--
-- El trigger es propio de `devices` y NO reusa private.check_same_org(): esa
-- función la comparten dos tablas y ya costó un bug (0019) por preparar una
-- expresión sobre una columna que una de ellas no tiene.
--
-- Antes del trigger se sueltan los empleados que ya estuvieran asignados a algo
-- que no es una tarjeta. Los scan_events ya guardados NO se tocan: el escaneo
-- de ayer se atribuyó como se atribuyó (invariante 1).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. VENCER SUSCRIPCIONES
-- ---------------------------------------------------------------------------
create or replace function public.run_expire_subscriptions()
returns integer
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select private.expire_subscriptions();
$$;

revoke all on function public.run_expire_subscriptions() from public, anon, authenticated;
grant execute on function public.run_expire_subscriptions() to service_role;


-- ---------------------------------------------------------------------------
-- 2. EMPLEADO SÓLO EN TARJETAS
-- ---------------------------------------------------------------------------
update public.devices
   set employee_id = null
 where employee_id is not null
   and form_factor <> 'nfc_card';

create or replace function private.devices_employee_requires_card()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.employee_id is not null and new.form_factor <> 'nfc_card' then
    raise exception 'Sólo una tarjeta personal se puede asignar a un empleado'
      using errcode = '23514', hint = 'employee_requires_card';
  end if;
  return new;
end;
$$;

drop trigger if exists devices_employee_requires_card on public.devices;
create trigger devices_employee_requires_card
  before insert or update of employee_id, form_factor on public.devices
  for each row execute function private.devices_employee_requires_card();
