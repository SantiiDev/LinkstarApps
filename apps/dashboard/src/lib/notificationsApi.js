import { supabase } from './supabaseClient';
import { requireOrg } from './dashboardApi';
import { blankToNull } from './catalogApi';

/* Avisos por mail (migración 0023): las preferencias de cada organización y el
 * registro de lo que ya se mandó. Lo lee y lo escribe la pantalla de
 * Automatizaciones.
 *
 * Va directo por PostgREST, sin RPC: las dos tablas tienen RLS
 * (orgs_rw_with_access, owner/admin con plan vigente) y no hay nada de
 * auth.users en juego, que es lo único que obliga a teamApi.js a usar RPC.
 *
 * Quién manda los mails NO es el panel: es services/api/scripts/send-alerts.js,
 * una vez por día, sobre private.pending_notifications(). Esta pantalla sólo
 * decide qué se manda y a quién. */

/* Los mismos valores por defecto que usa pending_notifications() con un
 * coalesce cuando la organización no tiene fila. Si cambian en la SQL, cambian
 * acá: lo que la pantalla muestra sin fila tiene que ser lo que de verdad se
 * aplica. */
export const DEFAULT_PREFERENCES = Object.freeze({
  device_idle_enabled: true,
  device_idle_hours: 48,
  weekly_summary_enabled: true,
  recipient_email: null,
});

/* El check de la tabla: device_idle_hours between 6 and 720. */
export const IDLE_HOURS_MIN = 6;
export const IDLE_HOURS_MAX = 720;

const PREFERENCE_FIELDS = 'device_idle_enabled, device_idle_hours, weekly_summary_enabled, recipient_email, updated_at';

/* Devuelve { prefs, saved }. `saved` es false cuando la organización nunca
 * guardó nada: no es un error, es el estado de toda cuenta nueva, y los
 * avisos ya corren con los valores por defecto.
 *
 * OJO: para un manager o un viewer esto también devuelve "sin fila", porque el
 * RLS no les deja leer la tabla. La pantalla no llama a esta función para esos
 * roles; mostrarles los valores por defecto como si fueran los guardados sería
 * mentirles. */
export async function fetchNotificationPreferences(organizationId) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(PREFERENCE_FIELDS)
    .eq('organization_id', requireOrg(organizationId))
    .maybeSingle();

  if (error) throw error;
  if (!data) return { prefs: { ...DEFAULT_PREFERENCES }, saved: false };
  return { prefs: data, saved: true };
}

/* Upsert: la primera vez crea la fila, después la actualiza. Con `.select()`
 * sin problema — a diferencia de createLocation en catalogApi.js, la policy de
 * esta tabla no depende de la fila que se está escribiendo sino de
 * memberships, así que el RETURNING ve lo que acaba de insertarse. */
export async function saveNotificationPreferences(organizationId, prefs) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        organization_id: requireOrg(organizationId),
        device_idle_enabled: Boolean(prefs.device_idle_enabled),
        device_idle_hours: Number(prefs.device_idle_hours),
        weekly_summary_enabled: Boolean(prefs.weekly_summary_enabled),
        // Vacío = NULL = "al mail de quien creó la cuenta". Una cadena vacía
        // pasaría el coalesce de pending_notifications() como destinatario.
        recipient_email: blankToNull(prefs.recipient_email),
      },
      { onConflict: 'organization_id' }
    )
    .select(PREFERENCE_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

/* Lo último que se mandó de verdad. send-alerts.js registra DESPUÉS de que el
 * proveedor acepta, y nunca un envío simulado, así que cada fila es un mail que
 * salió. */
export async function fetchNotificationLog(organizationId, limit = 10) {
  const { data, error } = await supabase
    .from('notification_log')
    .select('id, kind, recipient_email, sent_at, metadata')
    .eq('organization_id', requireOrg(organizationId))
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/* Una línea legible por envío, a partir del payload que guardó send-alerts.js. */
export function describeNotification(row) {
  const meta = row.metadata ?? {};
  if (row.kind === 'device_idle') {
    const label = meta.device_label || 'Un expositor';
    const hours = meta.idle_hours ? ` (${meta.idle_hours} h)` : '';
    return `${label} sin escaneos${hours}`;
  }
  if (row.kind === 'weekly_summary') {
    const scans = meta.scans_7d ?? 0;
    return `Resumen semanal: ${scans} escaneo${scans === 1 ? '' : 's'}`;
  }
  return row.kind;
}

/* Mismo criterio que catalogErrorMessage(): se mira el código, no el texto. */
export function notificationsErrorMessage(error) {
  if (!error) return null;
  const code = error.code || '';
  if (code === '42501') {
    return 'Sólo el propietario o un administrador de la cuenta pueden cambiar los avisos.';
  }
  if (code === '23514') {
    return `Las horas tienen que estar entre ${IDLE_HOURS_MIN} y ${IDLE_HOURS_MAX}.`;
  }
  return error.message || 'No pudimos guardar los avisos. Probá de nuevo.';
}
