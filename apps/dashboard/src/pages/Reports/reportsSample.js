/*
 * DATOS INVENTADOS de los reportes (NPS, Sentimiento, Palabras clave). Los usan
 * sólo las maquetas (`Reports*Mockup.jsx`, detrás de GoogleGate o de
 * BusinessPitch) y las ilustraciones del modal de ventas (ReportsPitches.jsx,
 * dentro de BusinessPitch). Nunca se mezclan con datos del cliente.
 *
 * Viven juntos para que la maqueta de atrás y la ilustración del modal digan los
 * mismos números: el +58 del NPS sale de los promotores y detractores de abajo,
 * y las palabras de Sentimiento son las mismas que las de Palabras clave.
 */

/* ─── NPS ──────────────────────────────────────────────────────────────── */

export const SAMPLE_NPS = { promoters: 33, passives: 10, detractors: 5, total: 48, score: 58, small: false };

const aspect = (topic, label, positive, neutral, negative) => {
  const mentions = positive + neutral + negative;
  return { topic, label, positive, neutral, negative, mentions, score: Math.round(((positive - negative) / mentions) * 100) };
};

export const SAMPLE_ASPECTS = [
  aspect('calidad', 'Calidad', 41, 6, 1),
  aspect('atencion', 'Atención', 32, 6, 3),
  aspect('ambiente', 'Ambiente', 25, 9, 2),
  aspect('limpieza', 'Limpieza', 15, 5, 2),
  aspect('precio', 'Precio', 12, 13, 8),
  aspect('espera', 'Tiempo de espera', 4, 3, 12),
];

/* ─── Sentimiento ──────────────────────────────────────────────────────── */

// 13 semanas (rango «Últimos 90 días»). Suman lo que dice SAMPLE_SENTIMENT_COUNTS.
export const SAMPLE_SENTIMENT_SERIES = {
  unit: 'semana',
  withData: 13,
  labels: ['13 jul', '20 jul', '27 jul', '3 ago', '10 ago', '17 ago', '24 ago', '31 ago', '7 sept', '14 sept', '21 sept', '28 sept', '5 oct'],
  positive: [4, 5, 5, 6, 6, 7, 6, 7, 8, 7, 8, 7, 8],
  neutral: [3, 2, 3, 2, 3, 2, 3, 2, 2, 3, 2, 2, 2],
  negative: [2, 2, 1, 2, 1, 1, 2, 1, 1, 0, 1, 1, 0],
};
export const SAMPLE_SENTIMENT_COUNTS = { positive: 84, neutral: 31, negative: 15 };

export const SAMPLE_COMPLAINTS_BY_LOCATION = [
  { locationId: 'sample-1', name: 'Café del Parque · Centro', total: 82, negativePct: 15 },
  { locationId: 'sample-2', name: 'Café del Parque · Fisherton', total: 48, negativePct: 6 },
];

/* ─── Palabras clave ───────────────────────────────────────────────────── */

// [término, elogios, neutras, quejas]
const RAW_KEYWORDS = [
  ['atención', 21, 1, 2], ['café', 18, 0, 0], ['amables', 15, 1, 0], ['rico', 13, 0, 1],
  ['recomendable', 11, 0, 0], ['ambiente', 9, 1, 1], ['ubicación', 2, 6, 0], ['demora', 0, 1, 7],
  ['caro', 1, 0, 5], ['horario', 0, 4, 1], ['ruidoso', 0, 0, 3],
];

export const SAMPLE_KEYWORDS = RAW_KEYWORDS.map(([term, positive, neutral, negative]) => {
  let dominant = 'neutral';
  if (positive > negative && positive >= neutral) dominant = 'positive';
  else if (negative > positive && negative >= neutral) dominant = 'negative';
  return { term, positive, neutral, negative, count: positive + neutral + negative, dominant, reviews: [] };
}).sort((a, b) => b.count - a.count);

export const SAMPLE_PRAISED = SAMPLE_KEYWORDS.filter((k) => k.dominant === 'positive');
export const SAMPLE_COMPLAINTS = SAMPLE_KEYWORDS.filter((k) => k.dominant === 'negative');

/* ─── Reseñas (con la forma de fetchReviewsByIds) ──────────────────────── */

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const review = (id, reviewerName, stars, days, comment) => ({
  id, reviewer_name: reviewerName, is_anonymous: false, star_rating: stars, created_time: daysAgo(days), comment,
});

/* Las que hablan de la atención, cada una con el tono con que la nombra. */
export const SAMPLE_ATTENTION_REVIEWS = {
  items: [
    review('sample-r1', 'Lucía M.', 5, 3, 'Atención espectacular, gracias por la atención a Carolina, encantadora.'),
    review('sample-r2', 'Martín G.', 5, 9, 'Muy rico todo y la atención muy buena. Volvemos seguro.'),
    review('sample-r3', 'Sofía R.', 2, 16, 'El café bien, pero muy mala atención en la caja.'),
  ],
  tones: { 'sample-r1': 'positive', 'sample-r2': 'positive', 'sample-r3': 'negative' },
};
