-- ============================================================================
-- LINKSTAR — 0016: Serie diaria POR ENTIDAD (dispositivo / local / empleado)
-- ============================================================================
-- El dato ya estaba en la base y lo estábamos tirando.
--
-- `v_scans_daily` (0008) hace `group by organization_id, day` y descarta
-- `device_id` / `location_id` / `employee_id`, que `scan_daily_rollups` sí
-- guarda desde el 0004. Resultado: la única serie temporal que el panel podía
-- pedir era la de toda la organización, así que las sparklines de Dispositivos
-- y de Locales tenían `Array(7).fill(0)` escrito a mano — una línea plana de
-- ceros dibujada al lado de totales de 30 días que sí eran reales.
--
-- Esto no captura nada nuevo ni toca el pipeline de rollups: son tres
-- proyecciones de una tabla que ya está poblada. Los índices parciales que
-- necesitan (rollups_device_day_idx, rollups_location_day_idx,
-- rollups_employee_day_idx) también existen desde el 0004.
--
-- Igual que `v_scans_daily`, estas vistas NO acotan el rango de días: devuelven
-- todo el historial y el cliente filtra con `.gte('day', ...)`. Un `where day >
-- current_date - N` acá adentro haría que la vista mienta según el día en que
-- se la consulta, y dejaría al panel sin forma de pedir 30 días cuando la
-- vista fue escrita pensando en 7.
--
-- Tampoco rellenan los días sin escaneos: una entidad que no tuvo actividad el
-- martes simplemente no tiene fila para el martes. Densificar en SQL requiere
-- un `generate_series` sobre un rango, y una vista no toma parámetros. El
-- relleno con ceros se hace en el cliente, que es quien decide la ventana.
--
-- ⚠️  security_invoker = on, como TODAS las vistas de este proyecto (decisión 5
-- de CLAUDE.md). Sin eso la vista corre con los permisos de quien la creó e
-- ignora el RLS de scan_daily_rollups, que es exactamente la fuga que el 0014
-- vino a cerrar: `rollups_select` filtra por private.orgs_with_access() y por
-- private.visible_location_ids(), y esas dos condiciones tienen que seguir
-- aplicándose acá. Hay asserts para esto en tests/rls_isolation.sql.
--
-- ---------------------------------------------------------------------------
-- BOTS: por qué hay tres columnas de escaneos y no una
-- ---------------------------------------------------------------------------
-- `scan_daily_rollups.scans` es un `count(*)` crudo: incluye bots. El bot no es
-- un atacante, es cualquier programa que abre la URL sin que nadie la haya
-- tocado — y la regex de resolve_scan (0011) marca entre otros a `whatsapp` y
-- `facebookexternalhit`, así que cada vez que alguien comparte el link del
-- expositor por WhatsApp, la preview golpea el endpoint y suma un "escaneo".
--
-- Con datos reales de esta base: el 2026-08-06 quedó `scans=1, bot_scans=1,
-- unique_scans=0` — un escaneo que el panel contaba y que fue un crawler.
--
-- Decidido: para el dueño del local, "Escaneos" significa TOQUES HUMANOS. Por
-- eso estas vistas exponen las tres lecturas y dejan que la pantalla elija:
--
--   scans        todo toque, bots incluidos (lo que hay en la tabla)
--   human_scans  toques humanos  ← el número que va como "Escaneos"
--   bot_scans    sólo bots, para depurar; no se muestra
--   unique_scans personas distintas en el día (ya excluía bots)
--
-- ⚠️  El frontend todavía lee `scans`. Cambiarlo a `human_scans` acá solo
-- dejaría a Dispositivos mostrando un número y a Mi Empresa otro, porque
-- v_scans_daily y v_device_performance (0008) siguen agregando el `scans`
-- crudo. La migración de esa semántica se hace de una vez sobre las tres
-- pantallas y las vistas del 0008; hasta entonces esta columna está disponible
-- y sin usar, que es a propósito.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Por dispositivo — la sparkline de cada tarjeta en Dispositivos
-- ---------------------------------------------------------------------------
create or replace view public.v_device_scans_daily
with (security_invoker = on) as
select
  r.device_id,
  r.organization_id,
  r.day,
  sum(r.scans)::int                        as scans,
  sum(r.scans - r.bot_scans)::int          as human_scans,
  sum(r.bot_scans)::int                    as bot_scans,
  sum(r.unique_scans)::int                 as unique_scans
from public.scan_daily_rollups r
where r.device_id is not null
group by r.device_id, r.organization_id, r.day;

-- ---------------------------------------------------------------------------
-- Por ubicación — la sparkline de cada local en Gestión local
-- ---------------------------------------------------------------------------
create or replace view public.v_location_scans_daily
with (security_invoker = on) as
select
  r.location_id,
  r.organization_id,
  r.day,
  sum(r.scans)::int                        as scans,
  sum(r.scans - r.bot_scans)::int          as human_scans,
  sum(r.bot_scans)::int                    as bot_scans,
  sum(r.unique_scans)::int                 as unique_scans
from public.scan_daily_rollups r
where r.location_id is not null
group by r.location_id, r.organization_id, r.day;

-- ---------------------------------------------------------------------------
-- Por empleado — todavía sin pantalla que la consuma, pero es la misma
-- proyección y el ranking de empleados es el próximo lugar donde hace falta.
-- ---------------------------------------------------------------------------
create or replace view public.v_employee_scans_daily
with (security_invoker = on) as
select
  r.employee_id,
  r.organization_id,
  r.day,
  sum(r.scans)::int                        as scans,
  sum(r.scans - r.bot_scans)::int          as human_scans,
  sum(r.bot_scans)::int                    as bot_scans,
  sum(r.unique_scans)::int                 as unique_scans
from public.scan_daily_rollups r
where r.employee_id is not null
group by r.employee_id, r.organization_id, r.day;

grant select on
  public.v_device_scans_daily,
  public.v_location_scans_daily,
  public.v_employee_scans_daily
to authenticated;
