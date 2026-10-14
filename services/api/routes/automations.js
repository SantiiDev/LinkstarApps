import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { isClaudeConfigured } from '../lib/claude.js';
import { writeReply } from '../lib/replyWriter.js';
import { isPublishEnabled, runOrgInBackground } from '../lib/autoReplies.js';
import {
  validateBody,
  brandToneSchema,
  negativeContactSchema,
  autoReplyRuleSchema,
  replyPastSchema,
  reviewReplyAiSchema,
} from '../lib/validation.js';

const router = Router();

/* Respuestas con IA (0037). El contrato lo fijó el panel antes que esto:
 * apps/dashboard/src/lib/automationsApi.js.
 *
 *   POST   /api/google/reviews/:id/reply/ai              borrador para una reseña → { text }
 *   GET    /api/automations/brand-tones?org=             tonos guardados → { tones }
 *   PUT    /api/automations/brand-tones                  crear o reemplazar un tono → { tone }
 *   DELETE /api/automations/brand-tones/:id?org=         borrar un tono
 *   GET    /api/automations/negative-contact?org=&location=  mail para reseñas negativas
 *   PUT    /api/automations/negative-contact             guardarlo (vacío lo borra)
 *   GET    /api/automations/auto-reply?org=&location=    regla automática
 *   PUT    /api/automations/auto-reply                   guardarla
 *   GET    /api/automations/auto-reply/stats?org=&location=  { replied, minutes_saved }
 *   POST   /api/automations/reply-past                   encolar reseñas anteriores → { queued }
 *
 * Alcance: `location` es un id de `locations` (sucursal). Sin él (o null), es
 * «Todos los locales», y el de un local pisa al global. Un tono (0038) es para
 * reseñas positivas (4–5★) o críticas (1–3★) y para todos los locales o una
 * lista; la IA usa el de su tipo y su local, si no el de todos, y en una crítica
 * sin tono crítico, el positivo (review_reply_writer_context).
 *
 * Quién puede lo decide la base: review_ai_target() para una reseña,
 * review_ai_scope_target() para un alcance, y para un tono, ese mismo permiso en
 * cada uno de sus locales (save_reply_tone). Owner/admin en todo, un encargado
 * sólo en sus sucursales (puede leer el global, no escribirlo), nunca un viewer,
 * y sólo Business. El API corre como service_role, así que estas funciones son
 * el único control: ninguna ruta toca las tablas directo.
 *
 * El borrador nunca publica. Lo que se publica solo (automática, anteriores)
 * pasa por lib/autoReplies.js, que no publica sin AI_AUTO_REPLY_PUBLISH=on.
 */

// Cada borrador es una llamada paga a Claude.
const aiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Pediste muchas respuestas con IA seguidas. Esperá unos minutos y volvé a intentar.' },
});
const readLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
// Encolar cientos de respuestas que se publican en Google: pocas veces seguidas.
const pastLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ya pediste responder reseñas anteriores varias veces seguidas. Probá de nuevo en unos minutos.' },
});

// Los mismos valores que AUTO_REPLY_DEFAULTS en el panel.
const AUTO_REPLY_DEFAULTS = Object.freeze({ enabled: false, stars: [4, 5], delay: 'now' });

const RPC_ERRORS = {
  rol_insuficiente: [403, 'Tu rol no te permite cambiar esto en este local'],
  local_inexistente: [404, 'No encontramos ese local'],
  resena_inexistente: [404, 'No encontramos esa reseña. Puede que su ficha ya no esté vinculada'],
  sin_acceso: [402, 'Tu plan no está activo'],
  solo_business: [402, 'Las respuestas con IA son parte del plan Business'],
  filtro_invalido: [400, 'Filtro de estrellas inválido'],
  tipo_invalido: [400, 'Tipo de tono inválido'],
  sin_locales: [400, 'Elegí al menos un local, o «Todos los locales»'],
  tono_inexistente: [404, 'Ese tono ya no existe. Recargá la página'],
  tono_global_existente: [409, 'Ya hay un tono de este tipo para todos los locales. Editá ese, o elegí locales'],
  local_con_tono: [409, 'Alguno de los locales elegidos ya tiene un tono de este tipo'],
};

function rpcError(error, overrides = {}) {
  const map = { ...RPC_ERRORS, ...overrides };
  const known = Object.entries(map).find(([code]) => error?.message?.includes(code));
  if (!known) return error;
  const err = new Error(known[1][1]);
  err.status = known[1][0];
  return err;
}

async function rpc(name, args, overrides) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw rpcError(error, overrides);
  return data;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const UUID = /^[0-9a-f-]{36}$/i;

function requireUuid(value, what) {
  if (!UUID.test(String(value ?? ''))) throw badRequest(`${what} inválido`);
}

/* org y location de la query string. location vacío o ausente = global. */
function scopeFromQuery(query) {
  const org = String(query.org || '');
  requireUuid(org, 'Organización');
  const location = query.location ? String(query.location) : null;
  if (location) requireUuid(location, 'Local');
  return { org, location };
}

/* El detalle de la base o de Claude sólo va al log (CWE-209). */
function sendError(res, err, fallback, logLabel) {
  if ((err.status && err.status < 500) || err.status === 503) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`${logLabel}:`, err);
  return res.status(500).json({ error: `${fallback}. Probá de nuevo en unos minutos.` });
}

// ──────────────────────────────────────────────────────────
// POST /api/google/reviews/:id/reply/ai   { instructions?, previous? }
// Un borrador de respuesta: vuelve al panel, que lo pone en el cuadro de
// respuesta. Nunca publica: la persona lo revisa y lo publica con la ruta de
// siempre (POST /api/google/reviews/:id/reply, con source 'ai_draft').
// `previous` es el borrador anterior («Generar otra»), para que no repita.
// ──────────────────────────────────────────────────────────
router.post(
  '/api/google/reviews/:id/reply/ai',
  aiLimiter,
  requireAuth(supabase),
  validateBody(reviewReplyAiSchema),
  async (req, res) => {
    try {
      if (!isClaudeConfigured()) {
        return res.status(503).json({ error: 'La IA no está disponible en este momento' });
      }
      requireUuid(req.params.id, 'Reseña');

      const rows = await rpc(
        'review_ai_target',
        { p_user: req.user.id, p_review: req.params.id },
        { rol_insuficiente: [403, 'No tenés permiso para responder reseñas de esta sucursal'] }
      );
      const review = rows?.[0];
      const contextRows = await rpc('review_reply_writer_context', {
        p_org: review.organization_id,
        p_location: review.location_id,
        p_stars: review.star_rating,
      });

      let text;
      try {
        text = await writeReply({
          review,
          context: contextRows?.[0] ?? {},
          instructions: req.body.instructions,
          previous: req.body.previous,
        });
      } catch (err) {
        // Sin `status`: un 400 o 429 de Claude no tiene que llegarle al panel
        // como si fuera un error del pedido.
        throw new Error(`Claude no pudo escribir la respuesta: ${err.message}`, { cause: err });
      }

      res.json({ text });
    } catch (err) {
      sendError(res, err, 'No pudimos escribir la respuesta con IA', 'Error en el borrador de respuesta con IA');
    }
  }
);

// ──────────────────────────────────────────────────────────
// Tono de marca
// ──────────────────────────────────────────────────────────
router.get('/api/automations/brand-tones', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { org } = scopeFromQuery(req.query);
    const tones = await rpc('list_reply_tones', { p_user: req.user.id, p_org: org });
    res.json({ tones: tones ?? [] });
  } catch (err) {
    sendError(res, err, 'No pudimos leer los tonos de marca', 'Error leyendo tonos de marca');
  }
});

router.put('/api/automations/brand-tones', writeLimiter, requireAuth(supabase), validateBody(brandToneSchema), async (req, res) => {
  try {
    const { org, id, kind, applies_to_all, location_ids, instructions, signature, emojis } = req.body;
    // En «custom» los emojis elegidos se guardan; en «auto», la lista no se usa.
    const cleanEmojis = { ...emojis, custom: emojis.mode === 'custom' ? [...new Set(emojis.custom)] : [] };
    const locations = applies_to_all ? [] : [...new Set(location_ids)];
    const savedId = await rpc('save_reply_tone', {
      p_user: req.user.id,
      p_org: org,
      p_id: id,
      p_kind: kind,
      p_applies_to_all: applies_to_all,
      p_location_ids: locations,
      p_instructions: instructions,
      p_signature: signature,
      p_emojis: cleanEmojis,
    });
    res.json({
      tone: { id: savedId, kind, applies_to_all, location_ids: locations, instructions, signature, emojis: cleanEmojis },
    });
  } catch (err) {
    sendError(res, err, 'No pudimos guardar el tono de marca', 'Error guardando tono de marca');
  }
});

router.delete('/api/automations/brand-tones/:id', writeLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { org } = scopeFromQuery(req.query);
    requireUuid(req.params.id, 'Tono');
    await rpc('delete_reply_tone', { p_user: req.user.id, p_org: org, p_id: req.params.id });
    res.status(204).end();
  } catch (err) {
    sendError(res, err, 'No pudimos borrar el tono de marca', 'Error borrando tono de marca');
  }
});

// ──────────────────────────────────────────────────────────
// Mail de contacto para reseñas negativas
// ──────────────────────────────────────────────────────────
router.get('/api/automations/negative-contact', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { org, location } = scopeFromQuery(req.query);
    const email = await rpc('get_negative_contact', { p_user: req.user.id, p_org: org, p_location: location });
    res.json({ location_id: location, email: email ?? null });
  } catch (err) {
    sendError(res, err, 'No pudimos leer el mail de contacto', 'Error leyendo el mail para reseñas negativas');
  }
});

router.put(
  '/api/automations/negative-contact',
  writeLimiter,
  requireAuth(supabase),
  validateBody(negativeContactSchema),
  async (req, res) => {
    try {
      const { org, location_id, email } = req.body;
      await rpc('save_negative_contact', { p_user: req.user.id, p_org: org, p_location: location_id, p_email: email || null });
      res.json({ location_id, email: email || null });
    } catch (err) {
      sendError(res, err, 'No pudimos guardar el mail de contacto', 'Error guardando el mail para reseñas negativas');
    }
  }
);

// ──────────────────────────────────────────────────────────
// Respuesta automática
// ──────────────────────────────────────────────────────────
router.get('/api/automations/auto-reply', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { org, location } = scopeFromQuery(req.query);
    const rows = await rpc('get_auto_reply_rule', { p_user: req.user.id, p_org: org, p_location: location });
    // Sin regla guardada en ESE alcance, los valores por defecto (no los del
    // global): la pantalla muestra la regla del local que eligió.
    res.json(rows?.[0] ?? { ...AUTO_REPLY_DEFAULTS, location_id: location });
  } catch (err) {
    sendError(res, err, 'No pudimos leer la respuesta automática', 'Error leyendo la regla de respuesta automática');
  }
});

router.put('/api/automations/auto-reply', writeLimiter, requireAuth(supabase), validateBody(autoReplyRuleSchema), async (req, res) => {
  try {
    const { org, location_id, enabled, stars, delay } = req.body;
    const rows = await rpc('save_auto_reply_rule', {
      p_user: req.user.id,
      p_org: org,
      p_location: location_id,
      p_enabled: enabled,
      p_stars: stars,
      p_delay: delay,
    });
    res.json(rows?.[0]);
  } catch (err) {
    sendError(res, err, 'No pudimos guardar la respuesta automática', 'Error guardando la regla de respuesta automática');
  }
});

router.get('/api/automations/auto-reply/stats', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { org, location } = scopeFromQuery(req.query);
    const rows = await rpc('auto_reply_stats', { p_user: req.user.id, p_org: org, p_location: location });
    res.json(rows?.[0] ?? { replied: 0, minutes_saved: 0 });
  } catch (err) {
    sendError(res, err, 'No pudimos leer el contador', 'Error leyendo el contador de respuestas automáticas');
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/automations/reply-past   { org, location_id, count, stars }
// Encola las `count` reseñas más nuevas sin responder de ese filtro y, si
// publicar está encendido, las publica en segundo plano. La pantalla ya pidió
// confirmación: esto publica en la ficha de Google del cliente.
// ──────────────────────────────────────────────────────────
router.post('/api/automations/reply-past', pastLimiter, requireAuth(supabase), validateBody(replyPastSchema), async (req, res) => {
  try {
    if (!isClaudeConfigured()) {
      return res.status(503).json({ error: 'La IA no está disponible en este momento' });
    }
    const { org, location_id, count, stars } = req.body;
    const queued = await rpc('enqueue_past_replies', {
      p_user: req.user.id,
      p_org: org,
      p_location: location_id,
      p_count: count,
      p_stars: stars,
    });

    if (queued > 0) runOrgInBackground(org);
    res.json({ queued, publishing: isPublishEnabled() });
  } catch (err) {
    sendError(res, err, 'No pudimos encolar las respuestas', 'Error encolando respuestas a reseñas anteriores');
  }
});

export default router;
