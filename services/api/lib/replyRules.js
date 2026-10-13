/* Las decisiones de la cola de respuestas (lib/replyJobs.js), sin dependencias:
 * se testean sin base ni Google (test/replyJobs.test.js).
 *
 * REPLY_ALLOWED_LOCATIONS: ids de `locations` separados por coma. Si está
 * cargada, la cola sólo publica en esos locales. Es un seguro para el proyecto
 * de pruebas, que tiene vinculada la ficha real de un cliente; en producción
 * queda vacía (sin efecto) y se puede quitar al salir a vender.
 */

/* El set de locales permitidos, o null si no hay restricción. */
export function allowedLocations(raw = process.env.REPLY_ALLOWED_LOCATIONS) {
  const ids = String(raw ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

/* Qué hacer con un trabajo, mirando el contexto fresco (review_reply_context,
   0037). Devuelve { publish: true } o { publish: false, reason }. */
export function jobDecision(ctx, job, allowed = allowedLocations()) {
  if (!ctx) return { publish: false, reason: 'La ficha ya no está vinculada a un local' };
  if (ctx.review?.has_reply) return { publish: false, reason: 'La reseña ya tiene respuesta' };
  if (!ctx.is_business) return { publish: false, reason: 'La organización ya no está en Business' };
  if (job.source === 'auto' && !ctx.auto_rule_active) {
    return { publish: false, reason: 'La regla automática ya no aplica a esta reseña' };
  }
  const location = String(ctx.google?.location_id ?? '').toLowerCase();
  if (allowed && !allowed.has(location)) {
    return { publish: false, reason: 'Local fuera de REPLY_ALLOWED_LOCATIONS' };
  }
  return { publish: true };
}
