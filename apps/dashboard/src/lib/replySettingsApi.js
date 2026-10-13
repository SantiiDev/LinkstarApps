import { supabase } from './supabaseClient';
import { requireOrg } from './dashboardApi';
import { blankToNull } from './catalogApi';

/* Lo que la IA usa para responder reseñas (0037), editable desde Configuración
 * → Gestión local y desde el detalle de una reseña:
 *
 *   - Tonos de marca (review_reply_tones): uno por tipo —Positivas 4–5★ /
 *     Críticas 1–3★— y ámbito —«todos los locales» o una lista—. Se leen por
 *     PostgREST y se escriben SÓLO con las RPC save/delete_review_reply_tone,
 *     que validan los locales en una transacción (un local no puede tener dos
 *     tonos del mismo tipo).
 *   - Datos para las respuestas (review_reply_settings): el email de contacto
 *     que la IA cita en las críticas, global (location_id null) o por local. Va
 *     directo por PostgREST, como notificationsApi.js.
 *
 * Las dos tablas son de owner/admin (orgs_rw_with_access): para un manager o un
 * viewer el RLS devuelve vacío, y la pantalla muestra un aviso en lugar de
 * pretender que no hay nada configurado.
 */

export const TONE_INSTRUCTIONS_MAX = 500;
export const TONE_SIGNATURE_MAX = 120;
export const TONE_MAX_CUSTOM_EMOJIS = 10;

export const TONE_KINDS = [
  { value: 'positive', label: 'Positivas (4★ y 5★)', short: 'Positivas' },
  { value: 'critical', label: 'Críticas (1★ a 3★)', short: 'Críticas' },
];

export const EMPTY_TONE = Object.freeze({
  id: null,
  kind: 'positive',
  applies_to_all: true,
  location_ids: [],
  instructions: '',
  signature: '',
  emojis: { enabled: false, mode: 'auto', amount: 'moderate', custom: [] },
});

/* El mismo criterio que el check de la 0037. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value) => EMAIL_RE.test(value);

function toneFromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    applies_to_all: row.applies_to_all,
    location_ids: (row.review_reply_tone_locations ?? []).map((l) => l.location_id),
    instructions: row.instructions ?? '',
    signature: row.signature ?? '',
    emojis: {
      enabled: Boolean(row.emojis_enabled),
      mode: row.emojis_mode ?? 'auto',
      amount: row.emojis_amount ?? 'moderate',
      custom: row.emojis_custom ?? [],
    },
  };
}

export async function fetchReplyTones(organizationId) {
  const { data, error } = await supabase
    .from('review_reply_tones')
    .select('id, kind, applies_to_all, instructions, signature, emojis_enabled, emojis_mode, emojis_amount, emojis_custom, created_at, review_reply_tone_locations(location_id)')
    .eq('organization_id', requireOrg(organizationId))
    .order('kind', { ascending: false }) // positive antes que critical
    .order('applies_to_all', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toneFromRow);
}

export async function saveReplyTone(organizationId, tone) {
  const { data, error } = await supabase.rpc('save_review_reply_tone', {
    p_tone: {
      id: tone.id ?? null,
      organization_id: requireOrg(organizationId),
      kind: tone.kind,
      applies_to_all: Boolean(tone.applies_to_all),
      location_ids: tone.applies_to_all ? [] : tone.location_ids,
      instructions: (tone.instructions ?? '').trim(),
      signature: (tone.signature ?? '').trim(),
      emojis: {
        enabled: Boolean(tone.emojis?.enabled),
        mode: tone.emojis?.mode ?? 'auto',
        amount: tone.emojis?.amount ?? 'moderate',
        custom: tone.emojis?.custom ?? [],
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function deleteReplyTone(toneId) {
  const { error } = await supabase.rpc('delete_review_reply_tone', { p_id: toneId });
  if (error) throw error;
}

/* Map<location_id | null, contact_email>, sólo los que tienen email. */
export async function fetchReplySettings(organizationId) {
  const { data, error } = await supabase
    .from('review_reply_settings')
    .select('location_id, contact_email')
    .eq('organization_id', requireOrg(organizationId));
  if (error) throw error;
  return new Map((data ?? []).filter((r) => r.contact_email).map((r) => [r.location_id ?? null, r.contact_email]));
}

/* Vacío = sin email propio para ese ámbito (el local pasa a usar el global). */
export async function saveReplySettings(organizationId, locationId, { contactEmail }) {
  const { error } = await supabase
    .from('review_reply_settings')
    .upsert(
      {
        organization_id: requireOrg(organizationId),
        location_id: locationId ?? null,
        contact_email: blankToNull(contactEmail),
      },
      { onConflict: 'organization_id,location_id' }
    );
  if (error) throw error;
}

/* Los errores de las RPC llegan con `hint`; los del RLS y los checks, con código. */
const TONE_HINTS = {
  rol_insuficiente: 'Sólo el propietario o un administrador de la cuenta pueden cambiar los tonos.',
  solo_business: 'Los tonos de marca son parte del plan Business.',
  tono_inexistente: 'Ese tono ya no existe. Recargá la página.',
  local_invalido: 'Alguno de los locales elegidos ya no existe.',
  sin_locales: 'Elegí al menos un local, o «Todos los locales».',
  tono_global_existente: 'Ya hay un tono para todos los locales de este tipo. Editá ese, o elegí locales concretos.',
  local_con_tono: 'Alguno de los locales elegidos ya tiene un tono de este tipo.',
};

export function replySettingsErrorMessage(error) {
  if (!error) return null;
  if (error.hint && TONE_HINTS[error.hint]) return TONE_HINTS[error.hint];
  if (error.code === '42501') return 'Sólo el propietario o un administrador de la cuenta pueden cambiar esto.';
  if (error.code === '23514') return 'Revisá los datos: el email tiene que ser válido y la consigna, de hasta 500 letras.';
  return 'No pudimos guardar. Probá de nuevo.';
}
