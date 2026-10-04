import { supabase } from './supabaseClient';

/* Escrituras sobre `devices`.
 *
 * Vive acá y no en dashboardApi.js a propósito: ese módulo lee EXCLUSIVAMENTE
 * vistas (decisión 2 de CLAUDE.md) y esto toca la tabla. Mismo criterio que
 * teamApi.js, que tampoco pasa por ahí.
 *
 * Qué se puede y qué no:
 *   · INSERT no existe y no se agrega. Los dispositivos se aprovisionan del
 *     lado del servidor con `status = 'unassigned'` y un claim_code impreso, y
 *     se vinculan con claim_device(). Una policy de insert desde el cliente
 *     saltearía el límite de dispositivos del plan (invariante 4).
 *   · UPDATE sí: la policy devices_update de la 0014 lo habilita para
 *     owner/admin/manager de una organización con acceso vigente.
 */

/* `destination_url` NO está en v_device_performance (es una vista de métricas),
   así que se trae aparte para poder editarlo. Devuelve Map<device_id, url>. */
export async function fetchDeviceDestinations() {
  const { data, error } = await supabase
    .from('devices')
    .select('id, destination_url');

  if (error) throw error;
  return new Map((data ?? []).map(d => [d.id, d.destination_url ?? '']));
}

/* PostgREST no da error cuando la RLS rechaza un update: devuelve cero filas.
   Sin este chequeo, un `viewer` veía "guardado" y no se había guardado nada.
   Por eso todas las escrituras piden `.select()` y cuentan lo que volvió. */
function assertApplied(data, error) {
  if (error) throw error;
  if (!data || data.length === 0) {
    const err = new Error('No tenés permiso para modificar este dispositivo.');
    err.denied = true;
    throw err;
  }
}

export async function updateDevice(deviceId, fields) {
  const { data, error } = await supabase
    .from('devices')
    .update(fields)
    .eq('id', deviceId)
    .select('id');

  assertApplied(data, error);
}

/* El enum device_status es ('unassigned','active','paused','lost','retired'):
   'inactive' NO existe y escribirlo revienta con un error de Postgres. En el
   panel se muestran sólo dos estados —Activo e Inactivo—, así que apagar un
   expositor lo deja en 'paused'. 'lost' y 'retired' siguen existiendo en la
   base (los usa org_is_activated() y el aprovisionamiento) y se muestran como
   "Inactivo" igual, pero no se escriben desde acá. */
export function setDeviceActive(deviceId, active) {
  return updateDevice(deviceId, { status: active ? 'active' : 'paused' });
}
