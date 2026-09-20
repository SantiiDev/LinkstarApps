import { supabase } from './supabaseClient';

/* Catálogo del cliente: sucursales, empleados y dispositivos.
 *
 * La contracara de dashboardApi.js. Aquel LEE las vistas del 0008/0016; éste
 * ESCRIBE las tablas del 0003. Hasta ahora el panel no escribía ninguna de las
 * tres: los botones "Nueva Ubicación", "Editar" y "Desactivar" cambiaban el
 * estado de React y al recargar volvía todo como estaba.
 *
 * Va directo por PostgREST y no por RPC, a diferencia de teamApi.js. No es
 * inconsistencia: el 0014 reescribió las políticas de estas tres tablas
 * justamente para que el cliente logueado escriba solo, y ahí está el reparto
 * de roles. En `memberships` hace falta RPC porque el email vive en
 * `auth.users`, que PostgREST no expone — acá no hay nada de eso.
 *
 * Quién puede qué, según el 0014 (no se replica en React: si la política dice
 * que no, la fila no se escribe y listo):
 *
 *   locations   insert/update/delete  owner, admin
 *   employees   todo                  owner, admin, manager
 *   devices     SÓLO update           owner, admin, manager
 *
 * `devices` no tiene política de INSERT y eso es deliberado (invariante 4): los
 * expositores se fabrican con `status = 'unassigned'` y se vinculan con
 * `claim_device()`. Una pantalla que cree dispositivos saltearía el límite de
 * dispositivos del plan.
 *
 * Los límites de plan los aplica `private.enforce_plan_limit()` (0007) por
 * trigger, con `hint = 'plan_limit_reached'`. No se cuentan filas acá antes de
 * insertar: entre el conteo y el insert cabe otra pestaña.
 */

/* ---------------------------------------------------------------------------
 * Normalización
 *
 * Postgres rechaza con `check_violation` y el mensaje que sale es el del
 * constraint, que no sirve en pantalla. Estas funciones evitan llegar ahí por
 * cosas que son de formato, no del usuario.
 * ------------------------------------------------------------------------- */

/* Un campo de texto vacío tiene que viajar como NULL, no como "". La mayoría de
 * estas columnas son nullable y opcionales; guardar "" hace que después
 * `coalesce(google_review_url, ...)` en resolve_scan tome la cadena vacía como
 * un valor presente y el escaneo termine redirigiendo a ninguna parte. */
function blankToNull(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/* `instagram_handle` tiene `check (instagram_handle !~ '^@')`: se guarda sin
 * arroba. Y la gente escribe la arroba — es como se lo ve en todos lados. Sin
 * esto, escribir "@milocal" devuelve un check_violation que no explica nada. */
function normalizeInstagramHandle(value) {
  const handle = blankToNull(value);
  if (!handle) return null;
  return handle.replace(/^@+/, '').trim() || null;
}

/* ---------------------------------------------------------------------------
 * Destino del escaneo — el dato que hace que el producto funcione
 *
 * `resolve_scan()` (0007) no lee un campo "destino": lo arma en el momento con
 * una cascada de coalesce. Una sucursal sin ninguno de estos campos hace que el
 * expositor caiga al fallback de la organización o, si tampoco hay, al dominio
 * hardcodeado — o sea, el cliente pega el QR en la mesa y nadie llega a dejarle
 * una reseña.
 *
 * ⚠️ Esto es un ESPEJO de la cascada que vive en SQL, no la fuente de verdad.
 * Existe para poder avisarle al cliente "esta sucursal todavía no tiene destino"
 * antes de que imprima nada, que es cuando sirve saberlo. Si alguien toca el
 * orden del coalesce en resolve_scan, hay que tocarlo acá también — por eso los
 * pasos están numerados igual que en la migración.
 * ------------------------------------------------------------------------- */

export const PLACE_ID_REVIEW_URL = 'https://search.google.com/local/writereview?placeid=';

export function googleDestinationOf(location) {
  if (!location) return null;
  if (location.google_review_url) return location.google_review_url;           // 2.a
  if (location.google_place_id) return PLACE_ID_REVIEW_URL + location.google_place_id; // 2.b
  if (location.google_maps_url) return location.google_maps_url;               // 2.c
  return null;
}

export function instagramDestinationOf(location) {
  if (!location) return null;
  if (location.instagram_url) return location.instagram_url;
  if (location.instagram_handle) return `https://instagram.com/${location.instagram_handle}`;
  return null;
}

/* Qué le falta a una sucursal para que un expositor apoyado en su mesa termine
 * en algún lado. Devuelve `null` cuando está completa. */
export function missingDestination(location) {
  const google = googleDestinationOf(location);
  const instagram = instagramDestinationOf(location);
  if (google && instagram) return null;
  if (!google && !instagram) return 'both';
  return google ? 'instagram' : 'google';
}

/* ---------------------------------------------------------------------------
 * Sucursales
 * ------------------------------------------------------------------------- */

const LOCATION_FIELDS = `
  id, organization_id, name, address, city, province, postal_code, phone,
  google_place_id, google_review_url, google_maps_url,
  instagram_handle, instagram_url, is_active, created_at
`;

/* Se leen las FILAS, no v_location_performance: esta lectura alimenta el
 * formulario de edición, y la vista no expone address, teléfono ni ninguno de
 * los campos de Google. La vista sigue siendo la que alimenta las métricas
 * (invariante 2: las MÉTRICAS salen de las vistas; esto no es una métrica). */
export async function fetchLocationRows() {
  const { data, error } = await supabase
    .from('locations')
    .select(LOCATION_FIELDS)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

function locationPayload(form) {
  return {
    name: String(form.name ?? '').trim(),
    address: blankToNull(form.address),
    city: blankToNull(form.city),
    province: blankToNull(form.province),
    postal_code: blankToNull(form.postal_code),
    phone: blankToNull(form.phone),
    google_place_id: blankToNull(form.google_place_id),
    google_review_url: blankToNull(form.google_review_url),
    google_maps_url: blankToNull(form.google_maps_url),
    instagram_handle: normalizeInstagramHandle(form.instagram_handle),
    instagram_url: blankToNull(form.instagram_url),
  };
}

/* `organization_id` lo manda el cliente porque la columna es NOT NULL y no tiene
 * default. No es un agujero: la política `locations_insert` del 0014 exige que
 * ese id esté en `orgs_rw_with_access()`, así que mandar el de otra organización
 * hace que la fila se rechace.
 *
 * ⚠️ Sin `.select()` a propósito, y no es un descuido.
 *
 * Pedir la fila de vuelta hace que PostgREST agregue un RETURNING, y eso obliga
 * a Postgres a evaluar la política de SELECT sobre la fila recién insertada.
 * `locations_select` (0014) exige `id = any(private.visible_location_ids())`, y
 * esa función es `stable`: consulta `public.locations` con el snapshot de la
 * sentencia en curso, donde la fila que se está insertando todavía no existe.
 * El insert se guardaría bien y el cliente recibiría "no rows", que se lee como
 * si hubiera fallado — y alguien "arreglaría" eso reintentando, duplicando la
 * sucursal.
 *
 * No hace falta la fila igual: quien llama recarga la lista después de guardar,
 * porque una sucursal nueva tampoco tiene fila en v_location_performance hasta
 * que se la vuelve a pedir.
 *
 * Los UPDATE sí usan `.select()`: ahí la fila ya existe en el snapshot, así que
 * visible_location_ids() la encuentra y el RETURNING vuelve completo. */
export async function createLocation(organizationId, form) {
  const { error } = await supabase
    .from('locations')
    .insert({ organization_id: organizationId, ...locationPayload(form) });

  if (error) throw error;
}

export async function updateLocation(id, form) {
  const { data, error } = await supabase
    .from('locations')
    .update(locationPayload(form))
    .eq('id', id)
    .select(LOCATION_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

/* Borrado lógico, nunca físico. `locations_select` ya filtra `deleted_at is
 * null`, así que la fila desaparece del panel sola — y los escaneos históricos
 * que la referencian siguen teniendo a quién apuntar. Un DELETE real dispararía
 * el `on delete set null` de devices.location_id y dejaría los expositores
 * huérfanos sin que nadie se entere. */
export async function deleteLocation(id) {
  const { error } = await supabase
    .from('locations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) throw error;
}

/* ---------------------------------------------------------------------------
 * Empleados
 *
 * Ojo: NO son los miembros del equipo. Estos no inician sesión — existen para
 * poder atribuirle un escaneo a alguien. Ver teamApi.js.
 * ------------------------------------------------------------------------- */

const EMPLOYEE_FIELDS = `
  id, organization_id, location_id, full_name, employee_code, role_title,
  email, phone, is_active, started_at, created_at
`;

export async function fetchEmployeeRows() {
  const { data, error } = await supabase
    .from('employees')
    .select(EMPLOYEE_FIELDS)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

function employeePayload(form) {
  return {
    full_name: String(form.full_name ?? '').trim(),
    location_id: blankToNull(form.location_id),
    role_title: blankToNull(form.role_title),
    employee_code: blankToNull(form.employee_code),
    email: blankToNull(form.email),
    phone: blankToNull(form.phone),
    is_active: form.is_active ?? true,
  };
}

/* Sin `.select()` por el mismo motivo que createLocation: `employees_select`
 * filtra por `visible_location_ids()` y la fila nueva no está en el snapshot de
 * la sentencia que la inserta. */
export async function createEmployee(organizationId, form) {
  const { error } = await supabase
    .from('employees')
    .insert({ organization_id: organizationId, ...employeePayload(form) });

  if (error) throw error;
}

export async function updateEmployee(id, form) {
  const { data, error } = await supabase
    .from('employees')
    .update(employeePayload(form))
    .eq('id', id)
    .select(EMPLOYEE_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEmployee(id) {
  const { error } = await supabase
    .from('employees')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) throw error;
}

/* ---------------------------------------------------------------------------
 * Dispositivos — sólo update
 * ------------------------------------------------------------------------- */

/* Lo que el cliente puede cambiar de un expositor ya vinculado. Deliberadamente
 * corto: `public_id`, `claim_code`, `organization_id` y los contadores no están
 * y no deben estar — el primero es lo que está grabado en el chip NFC y lo que
 * lleva impreso el QR, así que cambiarlo desde el panel deja la pieza física
 * apuntando a un id que ya no existe. */
export async function updateDevice(id, patch) {
  const payload = {};
  if ('label' in patch) payload.label = String(patch.label ?? '').trim();
  if ('location_id' in patch) payload.location_id = blankToNull(patch.location_id);
  if ('employee_id' in patch) payload.employee_id = blankToNull(patch.employee_id);
  if ('kind' in patch) payload.kind = patch.kind;
  if ('status' in patch) payload.status = patch.status;
  if ('destination_url' in patch) payload.destination_url = blankToNull(patch.destination_url);

  const { data, error } = await supabase
    .from('devices')
    .update(payload)
    .eq('id', id)
    .select('id, label, location_id, employee_id, kind, status, destination_url')
    .single();

  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------------------
 * Errores
 *
 * Mismo criterio que invitationErrorMessage(): se mira el `hint` y el `code`,
 * no el texto del mensaje, que cambia con cualquier edición de la migración.
 * ------------------------------------------------------------------------- */
export function catalogErrorMessage(error, what = 'el registro') {
  if (!error) return null;

  // El trigger de límite de plan ya arma un mensaje pensado para leerse
  // ("Alcanzaste el límite de tu plan (1 de 1)..."), así que se muestra tal cual.
  if (error.hint === 'plan_limit_reached') return error.message;

  const code = error.code || '';

  // 42501 es RLS: la fila existe pero esta persona no tiene el rol para tocarla.
  // Pasa de verdad — un `manager` puede editar empleados y no sucursales.
  if (code === '42501') {
    return 'Tu rol no te permite hacer este cambio. Pedíselo al propietario o a un administrador de la cuenta.';
  }
  if (code === '23514') {
    return 'Hay un dato con un formato que no podemos guardar. Revisá el nombre y los enlaces.';
  }
  if (code === '23505') {
    return 'Ya existe un registro con ese dato.';
  }
  // La levanta private.check_same_org() (0003, corregida en la 0019).
  if (code === '23503') {
    return 'La sucursal o el empleado que elegiste pertenece a otra organización.';
  }

  return error.message || `No pudimos guardar ${what}. Probá de nuevo.`;
}
