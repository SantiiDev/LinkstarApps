import { REVIEW_TOPICS } from './googleApi';
import { RANGE_OPTIONS, dayKeyOf, periodFor, periodBuckets } from './companyOverview';
import { sharesOf } from './shares';

/* Cuentas sobre el análisis de reseñas (fase 5, 0033) que comparten NPS,
 * Sentimiento y Palabras clave. Todo sale de las filas de v_review_analysis: una
 * por reseña con texto, ya analizada. Nada se le pregunta al modelo al abrir la
 * pantalla.
 *
 * El sentimiento es del TEXTO, no de las estrellas: una reseña de 4★ que se queja
 * de la demora puede ser «neutral». Por eso estas pantallas no dicen «reseñas
 * positivas» a secas sino «tono positivo».
 */

/* Los mismos rangos que Mi Empresa (7 / 30 / 90 días, 12 meses, todo), con la
   misma cuenta de días en la hora de Argentina (periodFor). Antes Reportes
   tenía los suyos, en meses. */
export { RANGE_OPTIONS };
export const DEFAULT_RANGE = '90';

export const SENTIMENT_LABELS = { positive: 'Positivo', neutral: 'Neutro', negative: 'Negativo' };

const TOPIC_LABEL = new Map(REVIEW_TOPICS.map((t) => [t.id, t.label]));
export const topicLabel = (id) => TOPIC_LABEL.get(id) ?? id;

/* Filtra por sucursal y por rango (un valor de RANGE_OPTIONS). */
export function filterAnalysis(rows, { locationId = 'all', range = 'all' } = {}) {
  let out = locationId === 'all' ? rows : rows.filter((r) => r.location_id === locationId);
  const { fromKey } = periodFor(range);
  if (fromKey) out = out.filter((r) => dayKeyOf(r.created_time) >= fromKey);
  return out;
}

export function sentimentCounts(rows) {
  const c = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) c[r.sentiment] = (c[r.sentiment] ?? 0) + 1;
  return c;
}

/* Hasta cuántos días el gráfico de Sentimiento va día por día. Con 30 días
   serían 30 puntos casi todos en cero: en 30 y 90 va por semana. */
const SENTIMENT_DAILY_UP_TO = 7;

/* La evolución del sentimiento: positivas, neutras y negativas por tramo, con
   los mismos tramos que Mi Empresa (periodBuckets) — así el gráfico respeta el
   rango elegido. `rows` ya filtradas por sucursal y rango.
     'count'   → cantidad de reseñas por tramo; un tramo sin reseñas vale 0
                 (no hubo, y eso sí se midió).
     'percent' → qué parte de cada tramo es de cada tono (suman 100). Un tramo
                 sin reseñas queda AFUERA, etiqueta incluida: no fue 0 %.
   `unit` es el tramo ('día' | 'semana' | 'mes'), para el subtítulo. */
export function sentimentSeries(rows, range, mode = 'count') {
  const period = periodFor(range);
  const keyed = rows.map((r) => ({ dayKey: dayKeyOf(r.created_time), sentiment: r.sentiment }));
  const unit = period.kind === 'days' ? (period.days <= SENTIMENT_DAILY_UP_TO ? 'día' : 'semana') : 'mes';

  let points = periodBuckets(period, keyed, { maxDailyDays: SENTIMENT_DAILY_UP_TO }).map((b) => {
    const c = { positive: 0, neutral: 0, negative: 0 };
    for (const r of keyed) if (r.dayKey >= b.from && r.dayKey <= b.to && r.sentiment in c) c[r.sentiment]++;
    return { label: b.label, ...c, total: c.positive + c.neutral + c.negative };
  });
  const withData = points.filter((p) => p.total > 0).length;

  if (mode === 'percent') {
    points = points.filter((p) => p.total > 0).map((p) => {
      const [positive, neutral, negative] = sharesOf([p.positive, p.neutral, p.negative]);
      return { ...p, positive, neutral, negative };
    });
  }

  return {
    unit,
    withData,
    labels: points.map((p) => p.label),
    positive: points.map((p) => p.positive),
    neutral: points.map((p) => p.neutral),
    negative: points.map((p) => p.negative),
  };
}

/* Por tema: cuántas reseñas lo mencionan y con qué tono, de más a menos
   mencionado. Un tema que nadie mencionó no aparece. `score` es el NPS del tema
   (ver aspectNps) y `reviews` las menciones en el orden de las filas —de la más
   nueva a la más vieja—, con el tono de ESE tema en cada reseña. */
export function topicStats(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const t of r.topics ?? []) {
      if (!map.has(t.topic)) {
        map.set(t.topic, { topic: t.topic, label: topicLabel(t.topic), mentions: 0, positive: 0, neutral: 0, negative: 0, reviews: [] });
      }
      const e = map.get(t.topic);
      e.mentions++;
      e[t.sentiment]++;
      e.reviews.push({ reviewId: r.review_id, sentiment: t.sentiment });
    }
  }
  return [...map.values()]
    .map((e) => ({
      ...e,
      positivePct: Math.round((e.positive / e.mentions) * 100),
      score: Math.round(((e.positive - e.negative) / e.mentions) * 100),
    }))
    .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label));
}

/* ─── NPS (sale del texto de las reseñas, no de una encuesta) ────────────────
 * Igual que Tapstar: cada reseña con texto ya analizada cuenta como promotor
 * (tono positivo), pasivo (neutro o mixto) o detractor (negativo), y el NPS es
 * % promotores − % detractores, de −100 a +100. No hay pregunta de 0 a 10: es
 * una aproximación, y la pantalla lo dice.
 *
 * Una sola escala en toda la sección: el «score medio +0.82» de Tapstar es el
 * mismo número que su «+82», así que acá sólo existe el segundo. */

/* Con menos reseñas que esto, cada reseña nueva mueve el puntaje 10 puntos o
   más: se muestra igual, con aviso. */
export const SMALL_SAMPLE = 10;
/* Un aspecto entra al ranking con al menos estas menciones (como Tapstar). */
export const MIN_ASPECT_MENTIONS = 2;

export function npsOf(rows) {
  const c = sentimentCounts(rows);
  const total = c.positive + c.neutral + c.negative;
  return {
    promoters: c.positive,
    passives: c.neutral,
    detractors: c.negative,
    total,
    score: total ? Math.round(((c.positive - c.negative) / total) * 100) : null,
    small: total > 0 && total < SMALL_SAMPLE,
  };
}

/* NPS por aspecto: (menciones positivas − negativas) / menciones, de mayor a
   menor puntaje. Los aspectos con pocas menciones quedan afuera. */
export function aspectNps(rows) {
  return topicStats(rows)
    .filter((t) => t.mentions >= MIN_ASPECT_MENTIONS)
    .sort((a, b) => b.score - a.score || b.mentions - a.mentions || a.label.localeCompare(b.label));
}

/* Fortaleza: el de mayor puntaje. Reto: el de menor, si es otro (con un solo
   aspecto en el ranking no hay reto que señalar). En un empate gana el más
   mencionado. Recibe la lista ya ordenada de aspectNps. */
export function strengthAndChallenge(aspects) {
  if (!aspects.length) return { strength: null, challenge: null };
  const strength = aspects[0];
  const challenge = [...aspects].sort((a, b) => a.score - b.score || b.mentions - a.mentions)[0];
  return { strength, challenge: challenge === strength ? null : challenge };
}

/* «+58», «−34», «0». Con el signo menos tipográfico, no el guion. */
export function formatNps(score) {
  if (score == null) return '—';
  if (score > 0) return `+${score}`;
  if (score < 0) return `−${Math.abs(score)}`;
  return '0';
}

/* Las bandas habituales del NPS. `tone` es el de las píldoras de KpiCard. */
export function npsLevel(score) {
  if (score == null) return null;
  if (score >= 70) return { label: 'Excelente', tone: 'good' };
  if (score >= 30) return { label: 'Muy bueno', tone: 'good' };
  if (score >= 0) return { label: 'Bueno', tone: 'mid' };
  return { label: 'Necesita atención', tone: 'bad' };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* «Qué dice tu NPS»: reglas simples sobre los números de la pantalla. No es IA
   ni pretende serlo (mismo criterio que «Qué dicen tus métricas»): cada frase se
   puede rehacer a mano con lo que está arriba. */
export function npsInsights({ nps, strength, challenge }) {
  const out = [];
  if (nps.score == null) return out;

  const level = npsLevel(nps.score);
  out.push({
    title: `Tu NPS es ${level.label.toLowerCase()}: ${formatNps(nps.score)}`,
    text: `De ${plural(nps.total, 'reseña con texto', 'reseñas con texto')}, ${nps.promoters} ${nps.promoters === 1 ? 'te recomienda' : 'te recomiendan'} y ${nps.detractors} ${nps.detractors === 1 ? 'te critica' : 'te critican'}. El puntaje es el porcentaje de unas menos el de las otras.`,
  });

  if (strength && strength.score > 0) {
    out.push({
      title: `Lo que más te suma: ${strength.label.toLowerCase()}`,
      text: `${strength.positive} de ${plural(strength.mentions, 'mención', 'menciones')} ${strength.positive === 1 ? 'es positiva' : 'son positivas'} (NPS ${formatNps(strength.score)}). Es lo que conviene destacar en tu ficha y en tus publicaciones.`,
    });
  }

  if (challenge && challenge.negative > 0) {
    out.push({
      title: `Lo que más te resta: ${challenge.label.toLowerCase()}`,
      text: `${challenge.negative} de ${plural(challenge.mentions, 'mención', 'menciones')} ${challenge.negative === 1 ? 'es negativa' : 'son negativas'} (NPS ${formatNps(challenge.score)}). Corregirlo y responder esas reseñas es lo que más mueve el puntaje.`,
    });
  } else if (nps.detractors === 0) {
    out.push({
      title: 'Ninguna crítica en el período',
      text: 'Ninguna reseña con texto tiene tono negativo. Pedir reseñas a más clientes es lo que hace que el puntaje sea firme.',
    });
  }

  if (nps.small) {
    out.push({
      title: 'Todavía son pocas reseñas',
      text: `Con ${plural(nps.total, 'reseña analizada', 'reseñas analizadas')}, una sola reseña nueva puede mover el puntaje unos ${Math.round(100 / (nps.total + 1))} puntos: tomalo como orientación, no como tendencia.`,
    });
  }

  return out;
}

/* Por palabra clave: en cuántas reseñas aparece y con qué tono. El tono es el
   de la PALABRA en cada reseña, no el de la reseña entera (0033): «lugar lindo»
   en una reseña negativa sigue siendo un elogio. «Dominante» es la mayoría de
   esas menciones; empate → neutral. `reviews` son las reseñas que la nombran,
   en el orden de las filas (de la más nueva a la más vieja), con el tono de la
   palabra en cada una: el panel de Palabras clave las muestra. */
export function keywordStats(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const k of r.keywords ?? []) {
      if (!map.has(k.term)) map.set(k.term, { term: k.term, count: 0, positive: 0, neutral: 0, negative: 0, reviews: [] });
      const e = map.get(k.term);
      e.count++;
      e[k.sentiment]++;
      e.reviews.push({ reviewId: r.review_id, sentiment: k.sentiment });
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

/* «pizza», «pizza y café», «pizza, café y amable». */
function joinTerms(terms) {
  if (terms.length <= 1) return terms[0] ?? '';
  return `${terms.slice(0, -1).join(', ')} y ${terms[terms.length - 1]}`;
}

/* La frase de resumen de Palabras clave (como la de Tapstar): las 3 primeras de
   cada columna. Es una plantilla, no IA: se puede rehacer a mano mirando las
   columnas. `praised` / `complaints` vienen ya ordenadas. */
export function keywordSummary(praised, complaints) {
  const good = joinTerms(praised.slice(0, 3).map((k) => k.term));
  const bad = joinTerms(complaints.slice(0, 3).map((k) => k.term));
  const badCount = Math.min(complaints.length, 3);
  const badPhrase = `Lo que más mencionan como algo a mejorar ${badCount === 1 ? 'es' : 'son'} ${bad}.`;
  if (good && bad) return `Tus clientes valoran principalmente ${good}. ${badPhrase}`;
  if (good) return `Tus clientes valoran principalmente ${good}. En este período ninguna palabra aparece sobre todo como queja.`;
  if (bad) return `En este período ninguna palabra aparece sobre todo como elogio. ${badPhrase}`;
  return 'En este período ninguna palabra se menciona con un tono claro: ni sobre todo como elogio, ni sobre todo como queja.';
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
