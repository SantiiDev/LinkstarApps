/*
 * Análisis SEO, las cuentas que no son presentación. `audit` tiene la forma que
 * devuelve services/api/lib/seoAudit.js; lo usan la pantalla real y su maqueta.
 */

/* Lo que se resuelve sin salir del panel gana los empates de la próxima misión. */
const IN_PANEL = new Set(['profile', 'posts', 'reviews']);

/* La tarea pendiente que más puntos suma. Quedan afuera las que no se pueden
   «completar» (promedio, cantidad y ritmo de reseñas: acción 'devices', son
   resultados) y lo que no se pudo medir. En un empate gana lo que se resuelve en
   el panel, y después el orden de las categorías. La ganancia va en la escala
   del puntaje (sobre lo medido), para que cuadre con el «te faltan» de arriba. */
export function nextMission(audit) {
  if (!audit) return null;
  const measuredMax = audit.categories.reduce((s, c) => s + c.measuredMax, 0);
  let best = null;
  for (const category of audit.categories) {
    for (const check of category.checks) {
      if (check.status !== 'pending' && check.status !== 'partial') continue;
      if (check.action === 'devices') continue;
      const gain = check.max - check.score;
      const better = !best
        || gain > best.gain
        || (gain === best.gain && IN_PANEL.has(check.action) && !IN_PANEL.has(best.check.action));
      if (better) best = { check, gain, categoryId: category.id };
    }
  }
  if (!best || !measuredMax) return null;
  return { ...best, points: Math.max(1, Math.round((best.gain * 100) / measuredMax)) };
}
