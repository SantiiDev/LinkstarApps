/*
 * Lo que el cliente desbloquea conectando su ficha de Google.
 *
 * Vive acá y no dentro de un componente porque lo dicen dos lugares distintos
 * —el banner de Dispositivos y el modal de `GoogleGate`— y es la misma promesa:
 * duplicada, se desincroniza.
 */
export const GOOGLE_BENEFITS = [
  'Responder con IA usando tu propio tono de marca.',
  'Consultar cuántos clientes te llegan desde Google Maps.',
  'Revisar las publicaciones de tu ficha.',
  'Descubrir tu puntuación de SEO local y qué mejorar.',
];
