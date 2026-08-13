import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, subscriptionCheckoutSchema } from '../lib/validation.js';
import { createSubscriptionPreapproval, cancelPreapproval } from '../lib/subscriptions.js';

const router = Router();

// Estas rutas hablan con la API de Mercado Pago. Sin límite, alguien puede
// generar suscripciones pendientes en loop contra nuestra cuenta. Un cliente
// real elige plan una vez, y como mucho reintenta un par de veces.
const subscriptionLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Organización del usuario + su rol, con el cliente service_role.
 *
 * En el frontend esto lo resuelve la RPC my_org_context() bajo RLS, pero acá
 * el cliente es service_role: no hay auth.uid(), así que el filtro por usuario
 * hay que escribirlo a mano. Es el mismo patrón que el ?email= obligatorio de
 * GET /api/orders/:orderNumber — cuando se saltea el RLS, la comprobación se
 * reimplementa explícitamente.
 *
 * Sólo owner/admin: quién paga la organización no es decisión de un manager.
 */
async function requireOrgAdmin(userId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role, created_at')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const err = new Error('No administrás ninguna organización');
    err.status = 403;
    throw err;
  }
  return { orgId: data.organization_id, role: data.role };
}

// ──────────────────────────────────────────────────────────
// POST /api/subscriptions/checkout   { planCode }
// Crea la suscripción en Mercado Pago y devuelve el init_point donde el
// cliente la autoriza. No activa nada: eso lo hace el webhook cuando MP
// confirma. El plan gratis no pasa por acá — se toma con la RPC
// select_free_plan() desde el propio dashboard.
// ──────────────────────────────────────────────────────────
router.post(
  '/api/subscriptions/checkout',
  subscriptionLimiter,
  requireAuth(supabase),
  validateBody(subscriptionCheckoutSchema),
  async (req, res) => {
    try {
      const { orgId } = await requireOrgAdmin(req.user.id);

      // El precio y los días de prueba salen SIEMPRE de la base. Lo único que
      // el cliente eligió es cuál de los planes públicos quiere.
      const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('code, name, price_ars, trial_days, checkout_mode, is_public')
        .eq('code', req.body.planCode)
        .maybeSingle();

      if (planError) throw planError;
      if (!plan || !plan.is_public) {
        const err = new Error('Plan inexistente');
        err.status = 400;
        throw err;
      }
      if (plan.checkout_mode !== 'subscription') {
        const err = new Error(
          plan.checkout_mode === 'contact'
            ? 'Este plan se contrata hablando con ventas'
            : 'Este plan no se cobra: activalo desde el panel'
        );
        err.status = 400;
        throw err;
      }
      if (!(Number(plan.price_ars) > 0)) {
        const err = new Error('El plan no tiene precio cargado');
        err.status = 400;
        throw err;
      }

      const { id, initPoint } = await createSubscriptionPreapproval({
        plan,
        orgId,
        payerEmail: req.user.email,
      });

      // Se guarda el intento aunque todavía no esté autorizado: si el cliente
      // cierra la pestaña, la pantalla de resultado puede reconocer que hay un
      // preapproval pendiente en vez de arrancar de cero.
      await supabase.rpc('apply_preapproval_event', {
        p_preapproval_id: id,
        p_org: orgId,
        p_plan_code: plan.code,
        p_mp_status: 'pending',
        p_payer_email: req.user.email,
      });

      res.json({ initPoint, preapprovalId: id });
    } catch (err) {
      if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
      }
      // El detalle sólo al log del servidor (CWE-209).
      console.error('Error creando la suscripción:', err);
      res.status(500).json({ error: 'No se pudo iniciar la suscripción' });
    }
  }
);

// ──────────────────────────────────────────────────────────
// POST /api/subscriptions/cancel
// Cancela en Mercado Pago. El estado local lo escribe el webhook, igual que
// en el alta: si lo escribiéramos acá y MP fallara después, quedaría una
// organización cortada que en realidad sigue pagando.
// ──────────────────────────────────────────────────────────
router.post(
  '/api/subscriptions/cancel',
  subscriptionLimiter,
  requireAuth(supabase),
  async (req, res) => {
    try {
      const { orgId } = await requireOrgAdmin(req.user.id);

      const { data: sub, error } = await supabase
        .from('subscriptions')
        .select('mp_preapproval_id, status')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) throw error;
      if (!sub?.mp_preapproval_id) {
        const err = new Error('Esta organización no tiene una suscripción paga activa');
        err.status = 400;
        throw err;
      }

      await cancelPreapproval(sub.mp_preapproval_id);
      res.json({ ok: true });
    } catch (err) {
      if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Error cancelando la suscripción:', err);
      res.status(500).json({ error: 'No se pudo cancelar la suscripción' });
    }
  }
);

export default router;
