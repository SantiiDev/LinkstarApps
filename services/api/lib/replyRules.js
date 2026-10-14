/* Seguro para entornos de prueba de la cola de respuestas con IA
 * (lib/autoReplies.js). Sin dependencias, para testearlo sin base ni Google
 * (test/replyRules.test.js). Viene de la versión de `develop` (13 oct 2026).
 *
 * REPLY_ALLOWED_LOCATIONS: ids de `locations` separados por coma. Si está
 * cargada, la cola sólo publica en esos locales y saltea el resto. Existe porque
 * el proyecto de pruebas tiene vinculada la ficha real de un cliente (Vineria
 * Martu, ver CLAUDE.md): un «Responder anteriores» con «Todos los locales» le
 * publicaría respuestas en su Google. En producción queda vacía (vacía = sin
 * efecto). No afecta el borrador ni el «Publicar» manual, que siempre los decide
 * una persona.
 */

/* El set de locales permitidos, o null si no hay restricción. */
export function allowedLocations(raw = process.env.REPLY_ALLOWED_LOCATIONS) {
  const ids = String(raw ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

/* ¿Se puede publicar en este local? Sin restricción, siempre. */
export function isLocationAllowed(locationId, allowed = allowedLocations()) {
  return !allowed || allowed.has(String(locationId ?? '').toLowerCase());
}
