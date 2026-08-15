import { supabase } from './supabaseClient';

// Capa de fetching del dashboard. Lee EXCLUSIVAMENTE vistas —
// supabase/migrations/0008_dashboard_views.sql y las series por entidad del
// 0016_entity_daily_series.sql — nunca scan_events ni
// scan_daily_rollups directo (decisión 2 de CLAUDE.md). Las vistas tienen
// security_invoker = on, así que RLS filtra sola: con el cliente logueado
// (anon key + sesión del usuario) cada query devuelve sólo lo que ese
// usuario puede ver por sus memberships, sin filtrar organization_id acá.
//
// v_dashboard_kpis y v_recent_activity las consume Mi Empresa, que es la
// pantalla post-login y la única con un panel de KPIs generales.
//
// ---------------------------------------------------------------------------
// "Escaneos" = human_scans, en todas las pantallas
// ---------------------------------------------------------------------------
// `scans` en los rollups es un count(*) crudo con bots adentro, y el bot típico
// acá no es un atacante: la preview de WhatsApp golpea la URL del expositor
// cada vez que alguien comparte el link. Para el dueño del local eso no es un
// escaneo. Desde el 0018 las seis vistas del 0008 exponen `human_scans` al lado
// de `scans`, igual que ya hacían las tres del 0016, y este módulo pide SIEMPRE
// la columna humana. La cruda queda disponible en la vista para depurar.
//
// Consecuencia operativa: si el 0018 no está aplicado en el entorno, estas
// queries fallan con "column ... does not exist" en vez de devolver un número
// equivocado. Es a propósito — cada pantalla ya tiene su fallback, y un error
// ruidoso es mejor que dos pantallas mostrando cifras distintas.

// Estas tres piden `select('*')` porque las pantallas usan casi toda la fila.
// El costo de `*` es que una columna que falta NO da error: PostgREST devuelve
// la fila sin ella y en JS queda `undefined`, que con un `?? 0` se convierte en
// un cero perfectamente creíble. Es el peor resultado posible acá — es
// exactamente lo que este módulo intenta evitar mostrando un solo número en
// todas las pantallas.
//
// Y no es hipotético: este repo ya vivió una migración escrita que tardó en
// llegar a Postgres mientras el código asumía que estaba (ver 0013/0017 en
// CLAUDE.md). Si el 0018 todavía no se aplicó, esto tiene que gritar.
function assertColumn(rows, column, migration) {
  if (rows.length > 0 && !(column in rows[0])) {
    throw new Error(
      `La vista no expone "${column}". Falta aplicar la migración ${migration} ` +
      `en este entorno (npm run db:push desde packages/database).`
    );
  }
  return rows;
}

export async function fetchDevicePerformance() {
  const { data, error } = await supabase.from('v_device_performance').select('*');
  if (error) throw error;
  return assertColumn(data ?? [], 'human_scans_30d', '0018');
}

export async function fetchEmployeeLeaderboard() {
  const { data, error } = await supabase.from('v_employee_leaderboard').select('*');
  if (error) throw error;
  return assertColumn(data ?? [], 'human_scans_30d', '0018');
}

export async function fetchLocationPerformance() {
  const { data, error } = await supabase.from('v_location_performance').select('*');
  if (error) throw error;
  return assertColumn(data ?? [], 'human_scans_30d', '0018');
}

// Los KPIs generales de Mi Empresa: 30 días contra los 30 anteriores.
// Devuelve UNA fila —la organización activa— o null si todavía no hay ninguna.
// La vista sale de `organizations` con left joins, así que una organización sin
// un solo escaneo igual tiene fila, con ceros. Eso es distinto de "no hay
// datos" y la pantalla lo trata distinto.
export async function fetchDashboardKpis() {
  const { data, error } = await supabase
    .from('v_dashboard_kpis')
    .select('*')
    .limit(1);

  if (error) throw error;
  const rows = assertColumn(data ?? [], 'human_scans', '0018');
  return rows[0] ?? null;
}

// El feed de actividad. La vista ya filtra `not is_bot` desde el 0008 y se
// acota sola a 7 días y 200 filas, así que acá sólo se recorta a lo que entra
// en pantalla. No hace falta assertColumn: no tiene columnas del 0018.
export async function fetchRecentActivity(limit = 8) {
  const { data, error } = await supabase
    .from('v_recent_activity')
    .select('event_type, device_label, kind, occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

// v_scans_daily agrega TODO el historial de scan_daily_rollups agrupado por
// día — sin límite de rango incorporado. Filtramos acá a los últimos N días.
// `scans` se pide igual que `human_scans` para poder mostrar la diferencia
// cuando haga falta explicarla, pero el gráfico dibuja la humana.
export async function fetchScansDaily(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('v_scans_daily')
    .select('day, scans, human_scans, unique_scans, estimated_reviews')
    .gte('day', sinceStr)
    .order('day', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Series diarias POR ENTIDAD (0016_entity_daily_series.sql)
//
// Las vistas del 0016 devuelven una fila por (entidad, día) y sólo para los
// días que tuvieron escaneos: una entidad sin actividad el martes no tiene
// fila para el martes. Densificar con ceros es trabajo del cliente, porque es
// el cliente el que elige la ventana (7 días, 30 días) y una vista de Postgres
// no toma parámetros.
//
// Devuelven un Map<id, number[]> con un array de largo `days`, del día más
// viejo al más nuevo, listo para pasarle a una sparkline. Una entidad sin
// ninguna fila en el rango no aparece en el Map — quien lo consume decide si
// eso es un array de ceros o "sin datos".
// ---------------------------------------------------------------------------

// Claves ISO (YYYY-MM-DD) de los últimos N días, de la más vieja a la más
// nueva. Usa UTC igual que `day` en scan_daily_rollups, que la escribe el
// rollup con el current_date de Postgres — mezclar husos acá desalinearía la
// serie un día para quien mire el panel de noche.
function lastNDayKeys(days) {
  const today = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

// Etiquetas legibles para esa misma ventana, en el mismo orden. Vive acá y no
// en la pantalla a propósito: si las etiquetas se arman por separado terminan
// desalineadas con la serie, que es justo lo que pasaba cuando el modal de
// Dispositivos rotulaba las barras con ['L','M','X','J','V','S','D'] — eso
// asume que la semana arranca un lunes, pero la serie son los últimos N días
// terminando hoy.
export function lastNDayLabels(days) {
  return lastNDayKeys(days).map(key => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d))
      .toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .replace('.', '');
  });
}

async function fetchEntitySeries(view, idColumn, days) {
  const keys = lastNDayKeys(days);

  // human_scans, no scans: la sparkline tiene que contar lo mismo que el total
  // que va al lado. Con `scans` un expositor cuyo link circuló por WhatsApp
  // dibujaba picos que no fueron nadie.
  const { data, error } = await supabase
    .from(view)
    .select(`${idColumn}, day, human_scans`)
    .gte('day', keys[0])
    .order('day', { ascending: true });

  if (error) throw error;

  // Primero indexo por (entidad, día) y después recorro la ventana completa,
  // en vez de empujar cada fila a su posición: así los días sin fila quedan en
  // 0 sin tener que calcular índices a partir de fechas.
  const byEntityDay = new Map();
  for (const row of data ?? []) {
    const id = row[idColumn];
    if (!id) continue;
    let byDay = byEntityDay.get(id);
    if (!byDay) {
      byDay = new Map();
      byEntityDay.set(id, byDay);
    }
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + (row.human_scans ?? 0));
  }

  const series = new Map();
  for (const [id, byDay] of byEntityDay) {
    series.set(id, keys.map(key => byDay.get(key) ?? 0));
  }
  return series;
}

export function fetchDeviceScansSeries(days = 7) {
  return fetchEntitySeries('v_device_scans_daily', 'device_id', days);
}

export function fetchLocationScansSeries(days = 7) {
  return fetchEntitySeries('v_location_scans_daily', 'location_id', days);
}

export function fetchEmployeeScansSeries(days = 7) {
  return fetchEntitySeries('v_employee_scans_daily', 'employee_id', days);
}

// Decisión 6 de CLAUDE.md: Google no avisa reseñas nuevas, sólo se puede
// medir por diferencia de contador día a día (review_deltas). Cualquier
// número de "reseñas" que salga de ahí (directo o vía las vistas que lo
// agregan) tiene que quedar etiquetado como estimado en la UI.
export const ESTIMATED_LABEL = 'estimado';

export function formatRelativeTime(isoString) {
  if (!isoString) return 'Sin actividad';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Hace instantes';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} día${days === 1 ? '' : 's'}`;
}

const PALETTE = ['#F58529', '#1A2639', '#10B981', '#F59E0B', '#6366f1', '#8b5cf6', '#ec4899'];
export function colorForIndex(i) {
  return PALETTE[i % PALETTE.length];
}

export function initialsFor(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}
