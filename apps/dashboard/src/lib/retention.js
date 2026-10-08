/* El historial que deja ver cada plan (plans.data_retention_days, 0034).
 *
 * La base es la que corta: las políticas de lectura de rollups, escaneos,
 * reseñas estimadas y métricas no devuelven nada anterior al inicio del
 * historial. Esto sólo evita que una pantalla ofrezca un período que va a volver
 * vacío, o que compare contra un «período anterior» que no existe: ese vacío se
 * dibujaría como ceros, y un cero no se distingue de «medimos y no hubo nada».
 *
 * `retentionDays` en null (todavía no se leyó, o falló la lectura) significa
 * «no recortar nada en pantalla»: el corte de la base sigue estando.
 */

/* Opciones de un selector de período («7», «30», «90» días) con las que superan
   el historial deshabilitadas y marcadas. */
export function periodOptionsFor(options, retentionDays) {
  if (!retentionDays) return options;
  return options.map((opt) =>
    Number(opt.value) > retentionDays
      ? { ...opt, disabled: true, label: `${opt.label} · Business` }
      : opt
  );
}

/* Si el período guardado (de otra sesión, o de antes de bajar de plan) supera
   el historial, el más largo que sí entra. */
export function clampPeriod(value, options, retentionDays) {
  if (!retentionDays || Number(value) <= retentionDays) return value;
  const allowed = options.filter((opt) => Number(opt.value) <= retentionDays);
  return allowed.length ? allowed[allowed.length - 1].value : value;
}

/* ¿Cabe el período anterior (los `days` días antes de los últimos `days`)? */
export function canComparePrevious(days, retentionDays) {
  return !retentionDays || days * 2 <= retentionDays;
}
