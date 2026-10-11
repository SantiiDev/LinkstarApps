import { apiFetch, authHeaders } from './googleApi';
import { requireOrg } from './dashboardApi';

/*
 * Automatizaciones con IA: responder reseñas anteriores, la respuesta automática
 * y su contador. El backend lo hace el socio (respuestas con IA y tono de marca,
 * resto de la fase 5); este archivo es el contrato entre la pantalla
 * (pages/Automations) y sus rutas en services/api. Todas con Bearer, y la
 * organización siempre explícita, como el resto del panel.
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
 *        → { queued: number }
 *        Responde con IA las últimas `count` reseñas SIN responder de ese
 *        filtro. Publica en Google: la pantalla pide confirmación antes.
 *
 * Reglas que la pantalla da por hechas y el backend tiene que cumplir:
 *   - `location_id: null` es la regla de «Todos los locales»; la de un local la
 *     pisa (mismo criterio que el tono de marca de BrandToneModal).
 *   - Las respuestas usan el tono de marca del local, o el global si no tiene.
 *   - Es Business: en gratis la pantalla ni lo pide (BusinessLock), pero el
 *     corte de verdad va en el backend (private.org_has_business).
 *   - Quién puede: owner/admin en toda la organización, manager sólo en sus
 *     sucursales, nunca un viewer — la misma regla que responder una reseña
 *     (google_review_reply_target, 0026). La pantalla no muestra estas tarjetas
 *     a un viewer.
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
