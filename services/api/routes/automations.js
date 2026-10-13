import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { autoReplyRuleSchema, replyPastSchema, validateBody } from '../lib/validation.js';
import { processReplyJobs } from '../lib/replyJobs.js';

const router = Router();

/* Automatizaciones con IA (0037): la regla de respuesta automática, su
 * contador y «Responder reseñas anteriores». Es el contrato que escribió la
 * pantalla en apps/dashboard/src/lib/automationsApi.js:
 *
 *   GET  /api/automations/auto-reply?org=&location=        → la regla de ese ámbito
 *   PUT  /api/automations/auto-reply                       → guardarla
 *   GET  /api/automations/auto-reply/stats?org=&location=  → { replied, minutes_saved }
 *   POST /api/automations/reply-past                       → { queued }
 *
 * Quién puede lo decide review_automation_target() (0037): owner/admin en
 * toda la organización, manager sólo en sus locales (nunca en «Todos los
 * locales»), viewer nunca, y sólo Business. La regla de un local pisa a la
 * global.
 *
 * Errores: el detalle de la base sólo va al log (CWE-209).
 */

const readLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hiciste muchos cambios seguidos. Esperá unos minutos y volvé a intentar.' },
});
// Cada pedido puede publicar hasta 200 respuestas en Google.
const pastLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ya pediste varias tandas de respuestas. Esperá un rato antes de pedir otra.' },
});

const RPC_ERRORS = {
  rol_insuficiente: [403, 'Tu rol no te permite cambiar las automatizaciones de este ámbito'],
  local_inexistente: [404, 'No encontramos ese local'],
  sin_acceso: [402, 'Tu plan no está activo'],
  solo_business: [402, 'Las respuestas con IA son parte del plan Business'],
  filtro_invalido: [400, 'Filtro de estrellas inválido'],
};

function rpcError(error) {
  const known = Object.entries(RPC_ERRORS).find(([code]) => error?.message?.includes(code));
  if (!known) return error;
  const err = new Error(known[1][1]);
  err.status = known[1][0];
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const UUID = /^[0-9a-f-]{36}$/i;

/* org y location de la query (los GET). location vacío = «Todos los locales». */
function scopeFromQuery(query) {
  const org = String(query.org ?? '');
  const location = query.location ? String(query.location) : null;
  if (!UUID.test(org)) throw badRequest('Organización inválida');
  if (location && !UUID.test(location)) throw badRequest('Local inválido');
  return { org, location };
}

async function assertTarget(userId, org, location) {
  const { error } = await supabase.rpc('review_automation_target', {
    p_user: userId,
    p_org: org,
    p_location: location,
  });
  if (error) throw rpcError(error);
}

function sendError(res, err, fallback, logLabel) {
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`${logLabel}:`, err);
  res.status(500).json({ error: fallback });
}

router.get('/api/automations/auto-reply', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { org, location } = scopeFromQuery(req.query);
    await assertTarget(req.user.id, org, location);
    const { data, error } = await supabase.rpc('review_auto_reply_rule_get', { p_org: org, p_location: location });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    sendError(res, err, 'No pudimos leer la respuesta automática', 'Error leyendo la regla automática');
  }
});

router.put(
  '/api/automations/auto-reply',
  writeLimiter,
  requireAuth(supabase),
  validateBody(autoReplyRuleSchema),
  async (req, res) => {
    try {
      const { org, location_id: location, enabled, stars, delay } = req.body;
      const { data, error } = await supabase.rpc('review_auto_reply_rule_save', {
        p_user: req.user.id,
        p_org: org,
        p_location: location,
        p_enabled: enabled,
        p_stars: stars,
        p_delay: delay,
      });
      if (error) throw rpcError(error);
      res.json(data);
    } catch (err) {
      sendError(res, err, 'No pudimos guardar la respuesta automática', 'Error guardando la regla automática');
    }
  }
);

router.get('/api/automations/auto-reply/stats', readLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { org, location } = scopeFromQuery(req.query);
    await assertTarget(req.user.id, org, location);
    const { data, error } = await supabase.rpc('review_auto_reply_stats', { p_org: org, p_location: location });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    sendError(res, err, 'No pudimos leer las reseñas respondidas', 'Error leyendo el contador automático');
  }
});

/* Organizaciones con una tanda de «anteriores» corriendo en este proceso. El
   candado de verdad está en la base (la cola); esto sólo evita lanzar dos
   procesadores para la misma organización desde el mismo servidor. */
const processing = new Set();

function processInBackground(organizationId) {
  if (processing.has(organizationId)) return;
  processing.add(organizationId);
  const log = (line) => console.log(`[respuestas ${organizationId}] ${line.trim()}`);
  processReplyJobs({ organizationId, limit: 200, log })
    .catch((err) => console.error(`Respuestas anteriores: falló el proceso de ${organizationId}:`, err.message))
    .finally(() => processing.delete(organizationId));
}

router.post(
  '/api/automations/reply-past',
  pastLimiter,
  requireAuth(supabase),
  validateBody(replyPastSchema),
  async (req, res) => {
    try {
      const { org, location_id: location, count, stars } = req.body;
      const { data: queued, error } = await supabase.rpc('review_reply_enqueue_past', {
        p_user: req.user.id,
        p_org: org,
        p_location: location,
        p_count: count,
        p_stars: stars,
      });
      if (error) throw rpcError(error);
      if (queued) processInBackground(org);
      res.status(202).json({ queued: queued ?? 0 });
    } catch (err) {
      sendError(res, err, 'No pudimos responder las reseñas', 'Error encolando respuestas anteriores');
    }
  }
);

export default router;
