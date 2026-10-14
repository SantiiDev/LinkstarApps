import { apiFetch, authHeaders } from './googleApi';
import { requireOrg } from './dashboardApi';

/*
 * Respuestas con IA (0037/0038): el borrador de una reseña, el tono de marca, el mail
 * para reseñas negativas, la respuesta automática, responder reseñas anteriores
 * y su contador. Las rutas viven en services/api/routes/automations.js; este
 * archivo es el contrato entre ellas y la pantalla. Todas con Bearer, y la
 * organización siempre explícita, como el resto del panel.
 *
 *   POST /api/google/reviews/:id/reply/ai   ← { instructions?, previous? } → { text }
 *        Un borrador. Nunca publica: va al cuadro de respuesta, y se publica con
 *        replyToReview(id, texto, 'ai_draft') (lib/googleApi.js). `previous` es
 *        el borrador anterior («Generar otra»); el API le saca el nombre antes
 *        de mandárselo a la IA.
 *
 *   GET    /api/automations/brand-tones?org=<uuid>
 *          → { tones: [{ id, kind: 'positive' | 'critical', applies_to_all,
 *                        location_ids, instructions, signature, emojis,
 *                        updated_at, editable }] }
 *          Un encargado ve los de «todos» y los que nombran alguno de sus
 *          locales; `editable` dice si además lo puede cambiar.
 *   PUT    /api/automations/brand-tones  ← EMPTY_TONE + { org } → { tone }
 *          Sin `id` crea; con `id` reemplaza. Un tipo tiene a lo sumo un tono
 *          de «todos los locales», y un local a lo sumo uno de cada tipo (409).
 *   DELETE /api/automations/brand-tones/:id?org=<uuid>
 *
 *        Qué tono usa la IA (0038): el de su tipo (positivas 4–5★, críticas
 *        1–3★) que nombra al local, si no el de su tipo para todos; una crítica
 *        sin tono crítico usa el positivo.
 *
 *   GET  /api/automations/negative-contact?org=<uuid>[&location=<uuid>] → { location_id, email }
 *   PUT  /api/automations/negative-contact  ← { org, location_id, email }  (vacío lo borra)
 *        Público: la IA lo cita en las respuestas a reseñas de 1 a 3 estrellas.
 *
 *   GET  /api/automations/auto-reply?org=<uuid>[&location=<uuid>]
 *        → { enabled: boolean, stars: number[] (1..5), delay: 'now' | '1-3h' | '3-6h',
 *            location_id: uuid | null }
 *        La regla de ese local; sin `location`, la global («Todos los locales»).
 *        Sin regla guardada devuelve los valores por defecto (AUTO_REPLY_DEFAULTS).
 *
 *   PUT  /api/automations/auto-reply
 *        ← { org, location_id: uuid | null, enabled, stars, delay }
 *        → la regla guardada (misma forma que el GET)
 *
 *   GET  /api/automations/auto-reply/stats?org=<uuid>[&location=<uuid>]
 *        → { replied: number, minutes_saved: number }
 *        Reseñas que respondió la automatización y el tiempo que ahorró.
 *
 *   POST /api/automations/reply-past
 *        ← { org, location_id: uuid | null, count: 1..200, stars: 'all' | '4-5' | '5' | '1-3' }
 *        → { queued: number, publishing: boolean }
 *        Responde con IA las últimas `count` reseñas SIN responder de ese
 *        filtro. Publica en Google: la pantalla pide confirmación antes.
 *        `publishing: false` = el servidor tiene apagada la publicación
 *        automática (AI_AUTO_REPLY_PUBLISH, hasta la verificación de Google):
 *        quedan en cola y salen cuando se encienda.
 *
 * Reglas que la pantalla da por hechas y el backend tiene que cumplir:
 *   - `location_id: null` es la regla de «Todos los locales»; la de un local la
 *     pisa (mismo criterio que el tono de marca de BrandToneModal).
 *   - Las respuestas usan el tono de marca del local, o el global si no tiene.
 *   - Es Business: en gratis la pantalla ni lo pide (BusinessLock), pero el
 *     corte de verdad va en el backend (private.org_has_business).
 *   - Quién puede: owner/admin en toda la organización, manager sólo en sus
 *     sucursales (puede LEER «Todos los locales», no cambiarlo), nunca un
 *     viewer — la misma regla que responder una reseña (google_review_reply_target,
 *     0026). La pantalla no muestra estas tarjetas a un viewer.
 *   - Errores como el resto del API: `{ error: 'mensaje para mostrar' }`.
 */

export const AUTO_REPLY_DEFAULTS = Object.freeze({
  enabled: false,
  stars: [4, 5],
  delay: 'now',
  location_id: null,
});

export const AUTO_REPLY_DELAYS = [
  { value: 'now', label: 'Inmediata' },
  { value: '1-3h', label: 'Entre 1 y 3 horas' },
  { value: '3-6h', label: 'Entre 3 y 6 horas' },
];

export const PAST_REPLY_STARS = [
  { value: 'all', label: 'Todas' },
  { value: '4-5', label: 'Sólo 4 y 5★' },
  { value: '5', label: 'Sólo 5★' },
  { value: '1-3', label: 'Sólo 1 a 3★' },
];

export const PAST_REPLY_MAX = 200;

export const TONE_INSTRUCTIONS_MAX = 500;
export const TONE_SIGNATURE_MAX = 120;
export const TONE_MAX_CUSTOM_EMOJIS = 10;

export const TONE_KINDS = [
  { value: 'positive', label: 'Positivas (4★ y 5★)', short: 'Positivas' },
  { value: 'critical', label: 'Críticas (1★ a 3★)', short: 'Críticas' },
];

/* Un tono nuevo. `emojis`: auto = la IA elige (`amount` moderate = 2–4, few =
 * 1–2); custom = sólo los de `custom`. */
export const EMPTY_TONE = Object.freeze({
  id: null,
  kind: 'positive',
  applies_to_all: true,
  location_ids: [],
  instructions: '',
  signature: '',
  emojis: { enabled: false, mode: 'auto', amount: 'moderate', custom: [] },
});

function query(organizationId, locationId) {
  const params = new URLSearchParams({ org: requireOrg(organizationId) });
  if (locationId) params.set('location', locationId);
  return params.toString();
}

export async function fetchAutoReplyRule(organizationId, locationId = null) {
  const body = await apiFetch(
    `/api/automations/auto-reply?${query(organizationId, locationId)}`,
    { headers: await authHeaders() },
    'No pudimos leer la respuesta automática.'
  );
  return { ...AUTO_REPLY_DEFAULTS, ...body };
}

export async function saveAutoReplyRule(organizationId, locationId, rule) {
  return apiFetch(
    '/api/automations/auto-reply',
    {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify({
        org: requireOrg(organizationId),
        location_id: locationId ?? null,
        enabled: Boolean(rule.enabled),
        stars: [...new Set(rule.stars)].sort(),
        delay: rule.delay,
      }),
    },
    'No pudimos guardar la respuesta automática.'
  );
}

export async function fetchAutoReplyStats(organizationId, locationId = null) {
  return apiFetch(
    `/api/automations/auto-reply/stats?${query(organizationId, locationId)}`,
    { headers: await authHeaders() },
    'No pudimos leer las reseñas respondidas.'
  );
}

export async function replyPastReviews(organizationId, locationId, { count, stars }) {
  return apiFetch(
    '/api/automations/reply-past',
    {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        org: requireOrg(organizationId),
        location_id: locationId ?? null,
        count: Math.max(1, Math.min(PAST_REPLY_MAX, Math.round(Number(count) || 0))),
        stars,
      }),
    },
    'No pudimos responder las reseñas.'
  );
}

/* ─── Borrador de una reseña ──────────────────────────────────────────────── */

/* Un borrador de respuesta escrito por la IA con el tono de marca del local.
 * Nunca publica: devuelve el texto para el cuadro de respuesta. `previous`: el
 * borrador anterior, para que «Generar otra» no repita el mismo. */
export async function generateReplyDraft(reviewId, { instructions, previous } = {}) {
  const body = await apiFetch(
    `/api/google/reviews/${encodeURIComponent(reviewId)}/reply/ai`,
    {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ instructions: instructions || undefined, previous: previous || undefined }),
    },
    'No pudimos escribir la respuesta con IA.'
  );
  return body.text ?? '';
}

/* ─── Tono de marca ───────────────────────────────────────────────────────── */

export async function fetchBrandTones(organizationId) {
  const body = await apiFetch(
    `/api/automations/brand-tones?${query(organizationId)}`,
    { headers: await authHeaders() },
    'No pudimos leer los tonos de marca.'
  );
  return body.tones ?? [];
}

/* `tone` tiene la forma de EMPTY_TONE. */
export async function saveBrandTone(organizationId, tone) {
  const body = await apiFetch(
    '/api/automations/brand-tones',
    {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify({
        org: requireOrg(organizationId),
        id: tone.id ?? null,
        kind: tone.kind,
        applies_to_all: Boolean(tone.applies_to_all),
        location_ids: tone.applies_to_all ? [] : tone.location_ids ?? [],
        instructions: (tone.instructions ?? '').trim(),
        signature: (tone.signature ?? '').trim(),
        emojis: {
          enabled: Boolean(tone.emojis?.enabled),
          mode: tone.emojis?.mode ?? 'auto',
          amount: tone.emojis?.amount ?? 'moderate',
          custom: tone.emojis?.custom ?? [],
        },
      }),
    },
    'No pudimos guardar el tono de marca.'
  );
  return body.tone;
}

export async function deleteBrandTone(organizationId, toneId) {
  await apiFetch(
    `/api/automations/brand-tones/${encodeURIComponent(toneId)}?${query(organizationId)}`,
    { method: 'DELETE', headers: await authHeaders() },
    'No pudimos borrar el tono de marca.'
  );
}

/* ─── Mail de contacto para reseñas negativas ─────────────────────────────── */

export async function fetchNegativeContact(organizationId, locationId = null) {
  const body = await apiFetch(
    `/api/automations/negative-contact?${query(organizationId, locationId)}`,
    { headers: await authHeaders() },
    'No pudimos leer el mail de contacto.'
  );
  return body.email ?? '';
}

/* `email` vacío borra el de ese alcance (y se usa el de «Todos los locales»). */
export async function saveNegativeContact(organizationId, locationId, email) {
  const body = await apiFetch(
    '/api/automations/negative-contact',
    {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify({ org: requireOrg(organizationId), location_id: locationId ?? null, email: email.trim() }),
    },
    'No pudimos guardar el mail de contacto.'
  );
  return body.email ?? '';
}
