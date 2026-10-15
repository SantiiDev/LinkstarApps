/*
 * Datos INVENTADOS para las maquetas de la landing. Negocios, personas y
 * números son ficticios: la landing es marketing y las maquetas se leen como
 * ejemplos de la pantalla, nunca como datos de un cliente.
 *
 * Sólo lo que no existe ya en otro archivo de ejemplo (reportsSample.js,
 * automationsSample.js, googleMetricsSample.js y los *Mockup.jsx).
 */

const ago = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();

/* Una reseña crítica con el borrador de la IA ya escrito (Reseñas → detalle). */
export const SAMPLE_AI_REVIEW = {
  id: 'landing-ai-1',
  reviewer_name: 'Diego Fernández',
  is_anonymous: false,
  star_rating: 3,
  comment: 'El café muy rico y el lugar lindo, pero tardaron casi media hora en traer el pedido un sábado a la mañana.',
  created_time: ago(5),
  reply_comment: null,
  google_locations: { title: 'Café del Parque · Centro', maps_uri: null, locations: { name: 'Centro' } },
  google_review_analysis: { sentiment: 'neutral' },
};

export const SAMPLE_AI_DRAFT =
  '¡Hola Diego! Gracias por venir y por contarnos. Nos alegra que te haya gustado el café, y tenés razón con la espera: los sábados a la mañana se nos junta mucha gente y estamos sumando una persona más en la barra para que no vuelva a pasar. Te esperamos de nuevo. Equipo de Café del Parque';

/* Cuatro locales para la página de Multiubicaciones (LocationSummaryCard). */
export const SAMPLE_LOCATION_SUMMARY = [
  { id: 'centro', name: 'Café del Parque · Centro', linked: true, scans: 412, reviews: 31, answered: 30, answeredPct: 97, sentiment: 86, rating: 4.8 },
  { id: 'fisherton', name: 'Café del Parque · Fisherton', linked: true, scans: 268, reviews: 19, answered: 17, answeredPct: 89, sentiment: 81, rating: 4.6 },
  { id: 'pichincha', name: 'Café del Parque · Pichincha', linked: true, scans: 233, reviews: 16, answered: 11, answeredPct: 69, sentiment: 72, rating: 4.4 },
  { id: 'funes', name: 'Café del Parque · Funes', linked: true, scans: 141, reviews: 9, answered: 9, answeredPct: 100, sentiment: 90, rating: 4.9 },
];

export const SAMPLE_COMPLAINTS_BY_LOCATION = [
  { locationId: 'centro', name: 'Café del Parque · Centro', total: 124, negativePct: 6 },
  { locationId: 'fisherton', name: 'Café del Parque · Fisherton', total: 77, negativePct: 9 },
  { locationId: 'pichincha', name: 'Café del Parque · Pichincha', total: 64, negativePct: 17 },
  { locationId: 'funes', name: 'Café del Parque · Funes', total: 36, negativePct: 4 },
];

export const SAMPLE_SCOPE_OPTIONS = [
  { value: 'all', label: 'Todos los locales' },
  { value: 'centro', label: 'Café del Parque · Centro' },
  { value: 'fisherton', label: 'Café del Parque · Fisherton' },
  { value: 'pichincha', label: 'Café del Parque · Pichincha' },
  { value: 'funes', label: 'Café del Parque · Funes' },
];

/* La regla de respuesta automática de un local, distinta de la general. */
export const SAMPLE_LOCATION_RULE = { enabled: true, stars: [4, 5], delay: 'now', location_id: 'pichincha' };

/* Seguimiento de expositores (Funciones): escaneos de los últimos 30 días y uno
   que dejó de recibir escaneos, que es lo que dispara el aviso por mail. */
export const SAMPLE_DEVICES = [
  { name: 'Mesa 4', location: 'Centro', scans: 128 },
  { name: 'Mostrador', location: 'Centro', scans: 96 },
  { name: 'Mesa 12', location: 'Fisherton', scans: 71 },
  { name: 'Barra', location: 'Fisherton', scans: 4, idle: 'Sin escaneos hace 3 días' },
];

/* El equipo con acceso por local (no hay bloque del panel para esto: es una
   tarjeta propia de la landing). Los roles son los de lib/teamApi.js. */
export const SAMPLE_TEAM = [
  { initials: 'SR', name: 'Sofía Ríos', role: 'Propietario', scope: 'Todos los locales' },
  { initials: 'MG', name: 'Martín Gómez', role: 'Encargado', scope: 'Centro · Fisherton' },
  { initials: 'LP', name: 'Lucía Paz', role: 'Encargado', scope: 'Pichincha' },
  { initials: 'TB', name: 'Tomás Bianchi', role: 'Encargado', scope: 'Funes' },
];
