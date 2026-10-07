/* Lo último que mostró cada pantalla, en memoria mientras la pestaña esté
 * abierta (no en el navegador: se pierde al recargar la página).
 *
 * Es lo que evita que Mi Empresa y Dispositivos arranquen en blanco con
 * «Cargando…» cada vez que se vuelve a ellas desde otra sección: la pantalla
 * muestra lo recordado al instante y lo relee por detrás.
 *
 * Es por usuario. Si en la misma pestaña entra otra persona se descarta todo,
 * porque lo que ve cada uno depende de su rol (un encargado ve sólo sus
 * sucursales) y no puede quedar ni un instante en pantalla lo del anterior.
 *
 * Las claves las arma cada pantalla e incluyen la organización: con otra activa
 * no se reusa nada. */
const memory = new Map();
let owner = null;

export function recall(userId, key) {
  if (owner !== userId) {
    memory.clear();
    owner = userId;
  }
  return memory.get(key);
}

export function remember(key, value) {
  memory.set(key, value);
}
