import { supabase } from './supabase.js';
import { DAILY_METRIC_COLUMNS, fetchDailyMetrics, fetchMonthlyKeywords } from './googleBusiness.js';

/* Métricas de la ficha (fase 4.6): google_daily_metrics y google_search_keywords
 * (0029), sólo de las fichas vinculadas a una sucursal — las mismas de las que
 * se leen reseñas (0025).
 *
 * ── Qué días se piden ─────────────────────────────────────────────────────
 * Google publica las métricas con unos 4 días de atraso y corrige días ya
 * publicados, así que cada corrida vuelve a pedir los últimos 10 y pisa lo que
 * había (upsert por ficha + día). La primera vez de una ficha se trae el
 * historial que permite la API, 18 meses, para que «período anterior» tenga
 * contra qué comparar desde el primer día.
 *
 * Las palabras de búsqueda son mensuales y Google suma el rango que se le pide,
 * así que se piden de a un mes: los 3 últimos cerrados en cada corrida, 12 la
 * primera vez. El mes en curso no se pide: todavía no está cerrado.
 *
 * Se guardan para todas las organizaciones, no sólo Business: el corte lo hace
 * la base al leer (0029). Así, quien pasa a Business ve su historial en el acto.
 */

const UPSERT_CHUNK = 200;
const RECENT_DAYS = 10;
const BACKFILL_DAYS = 540;
const RECENT_MONTHS = 3;
const BACKFILL_MONTHS = 12;

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return isoDay(date);
}

/* 'YYYY-MM' de los últimos `count` meses cerrados, del más viejo al más nuevo. */
function closedMonths(count) {
  const now = new Date();
  const months = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

async function upsertInChunks(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict });
    if (error) throw error;
  }
}

async function hasRows(table, googleLocationId) {
  const { count, error } = await supabase
    .from(table)
    .select('google_location_id', { count: 'exact', head: true })
    .eq('google_location_id', googleLocationId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function syncLocationDaily(accessToken, organizationId, gl) {
  const backfill = !(await hasRows('google_daily_metrics', gl.id));
  const start = daysAgo(backfill ? BACKFILL_DAYS : RECENT_DAYS);
  const end = daysAgo(1);

  const byDay = await fetchDailyMetrics(accessToken, gl.google_location, start, end);
  const fetchedAt = new Date().toISOString();
  const zero = Object.fromEntries(Object.values(DAILY_METRIC_COLUMNS).map((c) => [c, 0]));

  const rows = [...byDay.entries()].map(([day, values]) => ({
    google_location_id: gl.id,
    organization_id: organizationId,
    day,
    ...zero,
    ...values,
    fetched_at: fetchedAt,
  }));
  if (rows.length) await upsertInChunks('google_daily_metrics', rows, 'google_location_id,day');
  return { days: rows.length, backfill };
}

async function syncLocationKeywords(accessToken, organizationId, gl) {
  const backfill = !(await hasRows('google_search_keywords', gl.id));
  let total = 0;
  for (const month of closedMonths(backfill ? BACKFILL_MONTHS : RECENT_MONTHS)) {
    const keywords = await fetchMonthlyKeywords(accessToken, gl.google_location, month, month);
    const rows = keywords.map((k) => ({
      google_location_id: gl.id,
      organization_id: organizationId,
      month: `${month}-01`,
      keyword: k.keyword,
      impressions: k.impressions,
      threshold: k.threshold,
      fetched_at: new Date().toISOString(),
    }));
    if (rows.length) await upsertInChunks('google_search_keywords', rows, 'google_location_id,month,keyword');
    total += rows.length;
  }
  return total;
}

/* Devuelve { locations, days, keywords, failures }. Una ficha que falla no
 * frena a las demás, igual que en las reseñas. */
export async function syncMetrics(accessToken, organizationId, linkedLocations, { dryRun = false, log = console.log } = {}) {
  const summary = { locations: linkedLocations.length, days: 0, keywords: 0, failures: 0 };
  if (dryRun) {
    for (const gl of linkedLocations) log(`    · ${gl.title ?? gl.google_location}: se leerían sus métricas`);
    return summary;
  }

  for (const gl of linkedLocations) {
    try {
      const daily = await syncLocationDaily(accessToken, organizationId, gl);
      const keywords = await syncLocationKeywords(accessToken, organizationId, gl);
      summary.days += daily.days;
      summary.keywords += keywords;

      const { error } = await supabase
        .from('google_locations')
        .update({ metrics_synced_at: new Date().toISOString() })
        .eq('id', gl.id);
      if (error) throw error;

      log(`    ✓ ${gl.title ?? gl.google_location}: ${daily.days} día(s) de métricas${daily.backfill ? ' (historial)' : ''}, ${keywords} palabra(s)`);
    } catch (err) {
      summary.failures++;
      log(`    ✗ ${gl.title ?? gl.google_location} (métricas): ${err.message}`);
    }
  }
  return summary;
}
