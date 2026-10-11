/*
 * Publicaciones, sin componentes: los tres tipos que permite Google, los
 * botones, los pasos del compositor, las variables de la ficha y los ajustes de
 * IA. Lo usan la pantalla real
 * (GooglePostsScreen), sus bloques (GooglePostsBlocks) y su maqueta. Va aparte
 * de los bloques porque un archivo de componentes que además exporta constantes
 * rompe el Fast Refresh.
 */

export const TYPES = [
  {
    id: 'STANDARD',
    icon: 'megaphone',
    tone: 'blue',
    title: 'Actualización',
    text: 'Una novedad, una noticia o un anuncio general sobre tu negocio.',
    example: 'Ej: Nuevo menú de temporada disponible',
  },
  {
    id: 'OFFER',
    icon: 'percent',
    tone: 'orange',
    title: 'Oferta',
    text: 'Un descuento o una promoción con fechas de validez y, si querés, un código de cupón.',
    example: 'Ej: 20% de descuento este fin de semana',
  },
  {
    id: 'EVENT',
    icon: 'calendar',
    tone: 'purple',
    title: 'Evento',
    text: 'Algo que va a pasar en una fecha concreta: un show, una degustación, una jornada especial.',
    example: 'Ej: Noche de jazz el viernes',
  },
];

export const CTA_OPTIONS = [
  { value: '', label: 'Sin botón' },
  { value: 'LEARN_MORE', label: 'Más información' },
  { value: 'BOOK', label: 'Reservar' },
  { value: 'ORDER', label: 'Pedir online' },
  { value: 'SHOP', label: 'Comprar' },
  { value: 'SIGN_UP', label: 'Registrarse' },
  { value: 'CALL', label: 'Llamar' },
];

/* Los pasos del compositor, como Tapstar. Oferta y Evento suman «Detalles»
   (título, fechas, cupón), que Google muestra destacado encima del texto. El
   tipo sólo se elige en el primer paso, así que la lista no cambia a mitad de
   camino. */
const STEP_LABELS = {
  type: 'Tipo',
  photo: 'Foto',
  details: 'Detalles',
  content: 'Qué contar',
  review: 'Revisar',
};

export function stepsFor(topicType) {
  const ids = topicType === 'STANDARD'
    ? ['type', 'photo', 'content', 'review']
    : ['type', 'photo', 'details', 'content', 'review'];
  return ids.map((id) => ({ id, label: STEP_LABELS[id] }));
}

/* «Insertar variable» en Revisar: el dato real de la ficha elegida, tal como
   está hoy en Google (GET /api/google/locations/:id/profile). Cada publicación
   va a una sola ficha, así que se inserta el valor y no un comodín. */
export const PROFILE_VARIABLES = [
  { id: 'title', label: 'Nombre del negocio', valueOf: (p) => p.title },
  { id: 'city', label: 'Ciudad', valueOf: (p) => p.city },
  { id: 'address', label: 'Dirección', valueOf: (p) => p.address },
  { id: 'phone', label: 'Teléfono', valueOf: (p) => p.primaryPhone },
  { id: 'website', label: 'Página web', valueOf: (p) => p.websiteUri },
];

/* «IA · Ajustes rápidos»: sólo los botones, Próximamente (la IA la arma el
   mismo trabajo que las respuestas de Reseñas). */
export const AI_TWEAKS = ['Más cercano', 'Más formal', 'Usar emojis'];

export const POST_TEXT_MAX = 1500;
