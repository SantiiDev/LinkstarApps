import { REVIEW_TOPICS } from './googleApi';

/* Cuentas sobre el análisis de reseñas (fase 5, 0033) que comparten Sentimiento y
 * Palabras clave. Todo sale de las filas de v_review_analysis: una por reseña
 * con texto, ya analizada. Nada se le pregunta al modelo al abrir la pantalla.
 *
 * El sentimiento es del TEXTO, no de las estrellas: una reseña de 4★ que se queja
 * de la demora puede ser «neutral». Por eso estas pantallas no dicen «reseñas
 * positivas» a secas sino «tono positivo».
 */

export const RANGE_OPTIONS = [
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
  { value: 'all', label: 'Todo el historial' },
];

export const SENTIMENT_LABELS = { positive: 'Positivo', neutral: 'Neutro', negative: 'Negativo' };

const TOPIC_LABEL = new Map(REVIEW_TOPICS.map((t) => [t.id, t.label]));
export const topicLabel = (id) => TOPIC_LABEL.get(id) ?? id;

/* 'YYYY-MM' del mes calendario de una fecha, en la hora de Argentina: una reseña
   del 31 a las 22 h es de ese mes, no del siguiente. */
const MONTH_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
});
function monthKey(iso) {
  return MONTH_KEY.format(new Date(iso)).slice(0, 7);
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' });
  return `${name.replace('.', '')} ${String(y).slice(2)}`;
}
function lastMonths(n) {
  const [y, m] = monthKey(new Date().toISOString()).split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/* Filtra por sucursal y por rango ('3' | '6' | '12' | 'all' meses). */
export function filterAnalysis(rows, { locationId = 'all', range = 'all' } = {}) {
  let out = locationId === 'all' ? rows : rows.filter((r) => r.location_id === locationId);
  if (range !== 'all') {
    const from = lastMonths(Number(range))[0];
    out = out.filter((r) => monthKey(r.created_time) >= from);
  }
  return out;
}

export function sentimentCounts(rows) {
  const c = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) c[r.sentiment] = (c[r.sentiment] ?? 0) + 1;
  return c;
}

/* % de tono positivo por mes. Un mes sin reseñas NO es 0%: queda afuera de la
   serie (sus etiquetas también), si no el gráfico mostraría una caída que no
   pasó. Para «todo el historial» se muestran los últimos 12 meses. */
export function monthlyPositiveShare(rows, range) {
  const months = lastMonths(range === 'all' ? 12 : Number(range));
  const byMonth = new Map(months.map((k) => [k, { total: 0, positive: 0 }]));
  for (const r of rows) {
    const b = byMonth.get(monthKey(r.created_time));
    if (!b) continue;
    b.total++;
    if (r.sentiment === 'positive') b.positive++;
  }
  const points = months
    .map((k) => ({ key: k, ...byMonth.get(k) }))
    .filter((p) => p.total > 0);
  return {
    labels: points.map((p) => monthLabel(p.key)),
    data: points.map((p) => Math.round((p.positive / p.total) * 100)),
    counts: points.map((p) => p.total),
  };
}

/* Por tema: cuántas reseñas lo mencionan y con qué tono, de más a menos
   mencionado. Un tema que nadie mencionó no aparece. */
export function topicStats(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const t of r.topics ?? []) {
      if (!map.has(t.topic)) map.set(t.topic, { topic: t.topic, label: topicLabel(t.topic), mentions: 0, positive: 0, neutral: 0, negative: 0 });
      const e = map.get(t.topic);
      e.mentions++;
      e[t.sentiment]++;
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, positivePct: Math.round((e.positive / e.mentions) * 100) }))
    .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label));
}

/* Por palabra clave: en cuántas reseñas aparece y con qué tono. El tono es el
   de la PALABRA en cada reseña, no el de la reseña entera (0033): «lugar lindo»
   en una reseña negativa sigue siendo un elogio. «Dominante» es la mayoría de
   esas menciones; empate → neutral. */
export function keywordStats(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const k of r.keywords ?? []) {
      if (!map.has(k.term)) map.set(k.term, { term: k.term, count: 0, positive: 0, neutral: 0, negative: 0 });
      const e = map.get(k.term);
      e.count++;
      e[k.sentiment]++;
    }
  }
  return [...map.values()]
    .map((e) => {
      let dominant = 'neutral';
      if (e.positive > e.negative && e.positive >= e.neutral) dominant = 'positive';
      else if (e.negative > e.positive && e.negative >= e.neutral) dominant = 'negative';
      return { ...e, dominant };
    })
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

/* Por sucursal: reseñas analizadas y qué parte tiene tono negativo, de más a
   menos quejas. Es lo que responde «qué sucursal concentra las quejas». */
export function locationStats(rows, nameOf) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.location_id)) map.set(r.location_id, { locationId: r.location_id, name: nameOf(r.location_id), total: 0, negative: 0, positive: 0 });
    const e = map.get(r.location_id);
    e.total++;
    if (r.sentiment === 'negative') e.negative++;
    if (r.sentiment === 'positive') e.positive++;
  }
  return [...map.values()]
    .map((e) => ({ ...e, negativePct: Math.round((e.negative / e.total) * 100) }))
    .sort((a, b) => b.negativePct - a.negativePct || b.total - a.total);
}
