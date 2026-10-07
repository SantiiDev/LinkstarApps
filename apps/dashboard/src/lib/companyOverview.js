/* Cuentas de Mi Empresa. Todo sale de filas que ya trajo la pantalla (reseñas
 * leídas de Google, su análisis, escaneos por sucursal y el Análisis SEO): acá
 * no hay ninguna consulta, sólo filtrar por sucursal y período y contar.
 *
 * Los días son de calendario en la hora de Argentina: una reseña del 31 a las
 * 22 h es de ese día, no del siguiente. (Los escaneos cortan en UTC —decisión 10
 * de CLAUDE.md—; para el total de un rango la diferencia de unas horas en el
 * borde no cambia nada que se pueda leer.)
 *
 * La regla de siempre: «—» cuando no hay medición, 0 sólo cuando se midió y fue
 * cero. Por eso varias funciones devuelven null en vez de 0.
 */

export const RANGE_OPTIONS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: '365', label: 'Últimos 12 meses' },
  { value: 'all', label: 'Todo el historial' },
];

/* ─── Fechas como 'YYYY-MM-DD' en la hora de Argentina ───────────────────── */

const AR_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
});

function dayKeyOf(date) {
  return AR_DAY.format(date instanceof Date ? date : new Date(date));
}

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Primer día del mes `n` meses antes (n negativo) o después del de `key`. */
function monthStart(key, n = 0) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' });
  return `${name.replace('.', '')} ${String(y).slice(2)}`;
}

/* El período elegido y el anterior, del mismo largo. «Todo el historial» no
   tiene anterior: sin base no hay variación que mostrar. */
export function periodFor(range, today = dayKeyOf(new Date())) {
  if (range === 'all') {
    return { range, kind: 'all', fromKey: null, toKey: today, prevFromKey: null, prevToKey: null };
  }
  if (range === '365') {
    const fromKey = monthStart(today, -11);
    return {
      range, kind: 'months', fromKey, toKey: today,
      prevFromKey: monthStart(today, -23), prevToKey: addDays(fromKey, -1),
    };
  }
  const days = Number(range);
  const fromKey = addDays(today, -(days - 1));
  return {
    range, kind: 'days', days, fromKey, toKey: today,
    prevFromKey: addDays(fromKey, -days), prevToKey: addDays(fromKey, -1),
  };
}

const inside = (key, from, to) => (!from || key >= from) && key <= to;

/* ─── Normalización de filas ─────────────────────────────────────────────── */

/* google_reviews (fetchReviewRows) → { stars, dayKey, answered, locationId }. */
export function normalizeReviewRows(rows) {
  return (rows ?? []).map((r) => ({
    id: r.id,
    stars: r.star_rating,
    dayKey: dayKeyOf(r.created_time),
    answered: Boolean(r.reply_comment),
    locationId: r.google_locations?.location_id ?? null,
  }));
}

/* v_review_analysis (fetchReviewAnalysis) → { sentiment, dayKey, locationId }. */
export function normalizeAnalysisRows(rows) {
  return (rows ?? []).map((r) => ({
    sentiment: r.sentiment,
    dayKey: dayKeyOf(r.created_time),
    locationId: r.location_id,
  }));
}

export function byLocation(rows, locationId) {
  return locationId === 'all' ? rows : rows.filter((r) => r.locationId === locationId);
}

export function inPeriod(rows, period) {
  return rows.filter((r) => inside(r.dayKey, period.fromKey, period.toKey));
}

export function inPreviousPeriod(rows, period) {
  if (!period.prevFromKey) return null;
  return rows.filter((r) => inside(r.dayKey, period.prevFromKey, period.prevToKey));
}

/* ─── Números chicos ─────────────────────────────────────────────────────── */

const NUM = new Intl.NumberFormat('es-AR');
export const formatNumber = (n) => NUM.format(n);
export const formatOneDecimal = (n) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* Variación porcentual. Sin base (anterior nulo o en cero) no hay porcentaje:
   «+∞%» no informa nada. */
export function percentTrend(current, previous) {
  if (current == null || !previous) return null;
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { text: '0%', direction: 'flat' };
  return {
    text: `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`,
    direction: change > 0 ? 'up' : 'down',
  };
}

/* Variación en puntos (para puntajes y porcentajes ya calculados). */
export function pointsTrend(current, previous, { decimals = 1, unit = '' } = {}) {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  const step = 10 ** -decimals;
  if (Math.abs(diff) < step / 2) return { text: `0${unit}`, direction: 'flat' };
  const abs = decimals ? formatOneDecimal(Math.abs(diff)) : String(Math.round(Math.abs(diff)));
  return { text: `${diff > 0 ? '+' : '−'}${abs}${unit}`, direction: diff > 0 ? 'up' : 'down' };
}

/* ─── KPIs ───────────────────────────────────────────────────────────────── */

export function ratingOf(rows) {
  if (!rows?.length) return null;
  return rows.reduce((s, r) => s + r.stars, 0) / rows.length;
}

export function answeredShare(rows) {
  if (!rows.length) return null;
  return Math.round((rows.filter((r) => r.answered).length / rows.length) * 100);
}

export function positiveShare(rows) {
  if (!rows?.length) return null;
  return Math.round((rows.filter((r) => r.sentiment === 'positive').length / rows.length) * 100);
}

/* Reseñas de 1 o 2 estrellas que siguen sin respuesta, de todo el historial: una
   queja vieja sin contestar sigue a la vista de todos en Google. */
export function pendingNegatives(rows) {
  return rows.filter((r) => r.stars <= 2 && !r.answered).length;
}

/* ─── Distribución por estrellas ─────────────────────────────────────────── */

export function starDistribution(rows) {
  const total = rows.length;
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = rows.filter((r) => r.stars === stars).length;
    return { stars, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
}

/* ─── Reseñas en el tiempo ───────────────────────────────────────────────── */

const MAX_HISTORY_MONTHS = 24;

/* Los tramos del gráfico según el rango: días hasta 30, semanas en 90, meses en
   12 meses y en todo el historial (los últimos 24 como máximo). Cada tramo trae
   su etiqueta: las etiquetas y los valores salen de la misma lista y no se
   pueden desalinear. */
function buckets(period, rows) {
  const { kind, fromKey, toKey } = period;
  const out = [];
  if (kind === 'days' && period.days <= 30) {
    for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push({ from: k, to: k, label: dayLabel(k) });
    return out;
  }
  if (kind === 'days') {
    for (let k = fromKey; k <= toKey; k = addDays(k, 7)) {
      const end = addDays(k, 6);
      out.push({ from: k, to: end < toKey ? end : toKey, label: dayLabel(k) });
    }
    return out;
  }
  let first = kind === 'months' ? fromKey : monthStart(toKey, -11);
  if (kind === 'all' && rows.length) {
    const oldest = rows.reduce((min, r) => (r.dayKey < min ? r.dayKey : min), toKey);
    const floor = monthStart(toKey, -(MAX_HISTORY_MONTHS - 1));
    first = monthStart(oldest > floor ? oldest : floor);
  }
  for (let k = first; k <= toKey; k = monthStart(k, 1)) {
    out.push({ from: k, to: addDays(monthStart(k, 1), -1), label: monthLabel(k) });
  }
  return out;
}

/* `rows` ya filtradas por sucursal y período. `mode`: 'count' cuenta reseñas por
   tramo; 'rating' promedia sus estrellas, y un tramo sin reseñas queda AFUERA en
   vez de dibujarse como 0 (no hubo puntaje, no fue un puntaje de cero). */
export function reviewSeries(rows, period, mode = 'count') {
  const points = buckets(period, rows).map((b) => {
    const own = rows.filter((r) => r.dayKey >= b.from && r.dayKey <= b.to);
    return { label: b.label, count: own.length, rating: ratingOf(own) };
  });
  if (mode === 'rating') {
    const rated = points.filter((p) => p.count > 0);
    return { labels: rated.map((p) => p.label), data: rated.map((p) => Math.round(p.rating * 100) / 100) };
  }
  return { labels: points.map((p) => p.label), data: points.map((p) => p.count) };
}

/* ─── Tu media de estrellas ──────────────────────────────────────────────── */

const round1 = (n) => Math.round(n * 10) / 10;

/* La media sobre la que Google redondea, y hasta dónde llega. No depende del
   período: es la nota que ve hoy cualquiera que busque el local.

   Google guarda la media redondeada a un decimal (services/api/lib/reviewSync.js),
   así que la «exacta» sale de las reseñas guardadas — pero sólo cuando las tenemos
   todas (tantas filas como dice el total de Google). Si falta alguna, se usa la
   de Google y la pantalla no la llama exacta. */
export function starAverage(fichas, rows, locationId) {
  const selected = fichas.filter((f) =>
    f.location_id
    && (locationId === 'all' || f.location_id === locationId)
    && f.total_reviews > 0
    && f.average_rating != null);
  if (!selected.length) return null;

  let total = 0;
  let sum = 0;
  let exact = true;
  for (const f of selected) {
    const own = rows.filter((r) => r.locationId === f.location_id);
    if (own.length === f.total_reviews) {
      total += own.length;
      sum += own.reduce((s, r) => s + r.stars, 0);
    } else {
      total += f.total_reviews;
      sum += f.average_rating * f.total_reviews;
      exact = false;
    }
  }
  const mean = sum / total;
  const shown = round1(mean);
  const targets = [];
  for (let t = round1(shown + 0.1); t <= 5 + 1e-9; t = round1(t + 0.1)) targets.push(t);
  return { mean, shown, total, sum, exact, targets };
}

/* Cuántas reseñas de 5★ faltan para que Google muestre `target`. Google muestra
   un decimal, así que «llegar a 4,9» es superar 4,85: n reseñas de 5 tales que
   (S + 5n) / (N + n) ≥ target − 0,05. La barra va del piso de la nota actual
   (mostrada − 0,05) a ese umbral. */
export function starGoal(average, target) {
  const threshold = target - 0.05;
  const { mean, shown, total, sum } = average;
  const needed = mean >= threshold ? 0 : Math.ceil((threshold * total - sum) / (5 - threshold) - 1e-9);
  const start = shown - 0.05;
  const progress = Math.max(0, Math.min(100, Math.round(((mean - start) / (threshold - start)) * 100)));
  return { needed, progress };
}

/* ─── SEO Local ──────────────────────────────────────────────────────────── */

/* Copia de levelOf() de services/api/lib/seoAudit.js: hace falta para el promedio
   de varias sucursales, que el API no calcula. Si cambian los cortes allá, acá
   también. */
function seoLevelOf(score) {
  if (score >= 85) return 'Destacada';
  if (score >= 65) return 'Bien posicionada';
  if (score >= 35) return 'Visible online';
  return 'Difícil de encontrar';
}

/* Mismo criterio de color que pctTone() de GoogleSeoLocalScreen.jsx. */
function seoTone(score) {
  return score >= 67 ? 'good' : score >= 34 ? 'mid' : 'bad';
}

/* El puntaje de la sucursal elegida, o el promedio de las medidas. */
export function seoSummary(seo, locationId) {
  const measured = (seo?.locations ?? []).filter((l) =>
    l.audit && (locationId === 'all' || l.locationId === locationId));
  if (!measured.length) return null;
  const score = Math.round(measured.reduce((s, l) => s + l.audit.score, 0) / measured.length);
  return {
    score,
    level: measured.length === 1 ? measured[0].audit.level : seoLevelOf(score),
    tone: seoTone(score),
    count: measured.length,
  };
}

/* ─── Resumen por local ──────────────────────────────────────────────────── */

/* Una fila por sucursal viva. `rows` y `analysis` ya vienen recortadas al
   período (no a la sucursal). Una sucursal sin ficha vinculada no tiene reseñas
   que contar: sus columnas de Google van en null («—»), no en 0. */
export function locationSummary({ locations, fichas, rows, analysis, scanTotals, isBusiness, locationId }) {
  const fichaOf = new Map(fichas.filter((f) => f.location_id).map((f) => [f.location_id, f]));
  return locations
    .filter((l) => locationId === 'all' || l.location_id === locationId)
    .map((l) => {
      const ficha = fichaOf.get(l.location_id);
      const own = ficha ? rows.filter((r) => r.locationId === l.location_id) : null;
      const answered = own ? own.filter((r) => r.answered).length : null;
      const ownAnalysis = ficha && analysis ? analysis.filter((a) => a.locationId === l.location_id) : null;
      return {
        id: l.location_id,
        name: l.name ?? 'Sucursal',
        linked: Boolean(ficha),
        scans: scanTotals ? (scanTotals.get(l.location_id) ?? 0) : null,
        reviews: own ? own.length : null,
        answered,
        answeredPct: own?.length ? Math.round((answered / own.length) * 100) : null,
        sentiment: !ficha ? null : isBusiness ? positiveShare(ownAnalysis) : 'locked',
        rating: ficha?.average_rating ?? null,
      };
    })
    .sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1) || (b.scans ?? 0) - (a.scans ?? 0) || a.name.localeCompare(b.name));
}
