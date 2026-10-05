/* El plan que el usuario eligió en la landing, hasta que llega al checkout.
 *
 * Las dos tarjetas de precio de la landing llamaban al mismo callback que
 * "Iniciar sesión" del navbar, así que la elección se perdía: el usuario
 * apretaba "Probar 7 días gratis" y tres pantallas después tenía que volver a
 * elegir el mismo plan en el selector del alta. Es la diferencia nº 1 que
 * quedó relevada contra MyTapStar, donde el botón del plan pago manda derecho
 * a pagar.
 *
 * sessionStorage y no la URL ni el estado del router: entre el click y el
 * selector de planes hay un registro o un login de por medio —y eventualmente
 * una confirmación por mail—, así que el valor tiene que sobrevivir a varias
 * navegaciones sin ensuciar los enlaces que el usuario podría copiar. Muere al
 * cerrar la pestaña, que es exactamente lo que querés de una intención.
 *
 * Esto NO activa ni cobra nada: sólo evita volver a preguntar. El alta sigue
 * pasando por la creación de la empresa y por la confirmación del checkout.
 */
const KEY = 'linkstar_intended_plan';

export function rememberIntendedPlan(code) {
  if (typeof code !== 'string' || !code) return;
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    // Modo privado o almacenamiento bloqueado: se pierde la intención y el
    // usuario elige el plan a mano, como antes. No es motivo para romper nada.
  }
}

/* Devuelve la intención y la borra en el mismo paso: se consume una sola vez.
   Si quedara guardada, volver atrás desde el checkout rebotaría de nuevo al
   checkout y el selector de planes sería inalcanzable. */
export function takeIntendedPlan() {
  try {
    const code = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}
