import { supabase } from './supabaseClient';
import { requireOrg } from './dashboardApi';
import { blankToNull } from './catalogApi';

/* Avisos por mail (migraciones 0023 y 0036): las preferencias de cada
 * organización. Las lee y las escribe la pantalla de Automatizaciones, tarjeta
 * por tarjeta. (El registro de lo enviado, notification_log, no se muestra: lo
 * escribe y lo usa send-alerts.js para no repetir avisos.)
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
  // Alertas de reseñas (0036): apagadas hasta que alguien las activa.
  low_rating_enabled: false,
  low_rating_stars: [1, 2],
  low_rating_recipients: [],
  keyword_alert_enabled: false,
  keyword_alert_terms: [],
  keyword_alert_recipients: [],
});

/* El check de la tabla: device_idle_hours between 6 and 720. */
export const IDLE_HOURS_MIN = 6;
export const IDLE_HOURS_MAX = 720;

/* El mismo criterio que el check de destinatarios de la 0036. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value) => EMAIL_RE.test(value);

/* Los checks de la 0036. */
export const ALERT_MAX_TERMS = 20;
export const ALERT_MAX_RECIPIENTS = 10;
export const ALERT_TERM_MIN = 2;
export const ALERT_TERM_MAX = 40;

const PREFERENCE_FIELDS = [
  'device_idle_enabled', 'device_idle_hours', 'weekly_summary_enabled', 'recipient_email',
  'low_rating_enabled', 'low_rating_stars', 'low_rating_recipients', 'low_rating_enabled_at',
  'keyword_alert_enabled', 'keyword_alert_terms', 'keyword_alert_recipients', 'keyword_alert_enabled_at',
  'updated_at',
].join(', ');

/* Lo que se puede mandar desde la pantalla, normalizado. `*_enabled_at` NO está:
 * lo pone el trigger de la 0036 al activar, y cualquier valor del cliente se
 * ignora. */
const NORMALIZE = {
  device_idle_enabled: Boolean,
  device_idle_hours: Number,
  weekly_summary_enabled: Boolean,
  // Vacío = NULL = "al mail de quien creó la cuenta". Una cadena vacía pasaría
  // el coalesce de pending_notifications() como destinatario.
  recipient_email: blankToNull,
  low_rating_enabled: Boolean,
  low_rating_stars: (v) => [...new Set(v ?? [])].map(Number).sort(),
  low_rating_recipients: (v) => [...new Set((v ?? []).map((e) => e.trim()).filter(Boolean))],
  keyword_alert_enabled: Boolean,
  keyword_alert_terms: (v) => [...new Set((v ?? []).map((t) => t.trim()).filter(Boolean))],
  keyword_alert_recipients: (v) => [...new Set((v ?? []).map((e) => e.trim()).filter(Boolean))],
};

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

/* Upsert PARCIAL: cada tarjeta manda sólo sus campos (`patch`), y el resto de
 * la fila queda como estaba (o con sus defaults, si es la primera vez). Con
 * `.select()` sin problema — a diferencia de createLocation en catalogApi.js, la
 * policy de esta tabla no depende de la fila que se está escribiendo sino de
 * memberships, así que el RETURNING ve lo que acaba de insertarse. */
export async function saveNotificationPreferences(organizationId, patch) {
  const row = { organization_id: requireOrg(organizationId) };
  for (const [key, value] of Object.entries(patch)) {
    if (NORMALIZE[key]) row[key] = NORMALIZE[key](value);
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(row, { onConflict: 'organization_id' })
    .select(PREFERENCE_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

/* Mismo criterio que catalogErrorMessage(): se mira el código, no el texto. */
export function notificationsErrorMessage(error) {
  if (!error) return null;
  const code = error.code || '';
  if (code === '42501') {
    return 'Sólo el propietario o un administrador de la cuenta pueden cambiar los avisos.';
  }
  if (code === '23514') {
    const constraint = `${error.message ?? ''} ${error.details ?? ''}`;
    if (constraint.includes('low_rating_stars')) return 'Elegí al menos una estrella entre 1 y 3.';
    if (constraint.includes('keyword_terms')) {
      return `Hasta ${ALERT_MAX_TERMS} palabras, de ${ALERT_TERM_MIN} a ${ALERT_TERM_MAX} letras cada una.`;
    }
    if (constraint.includes('recipients')) return `Hasta ${ALERT_MAX_RECIPIENTS} mails, todos válidos.`;
    return `Las horas tienen que estar entre ${IDLE_HOURS_MIN} y ${IDLE_HOURS_MAX}.`;
  }
  return error.message || 'No pudimos guardar los avisos. Probá de nuevo.';
}
