import { Router } from 'express';
import { Payment } from 'mercadopago';
import { supabase } from '../lib/supabase.js';
import { mpClient, withTimeout, isValidMpSignature } from '../lib/mercadopago.js';
import { getPreapproval, getAuthorizedPayment, fromMpReference } from '../lib/subscriptions.js';

const router = Router();

// ──────────────────────────────────────────────────────────
// Suscripciones del dashboard
//
// Mercado Pago manda dos topics distintos y hacen falta los dos:
//
//   subscription_preapproval          — cambió el estado de la suscripción
//                                       (la autorizó, la pausó, la canceló).
//   subscription_authorized_payment   — se ejecutó un cobro del ciclo.
//
// El primero abre la puerta del panel; el segundo es el que mantiene viva la
// suscripción mes a mes. Los dos terminan en una RPC que hace toda la
// escritura de una sola vez, porque a esta altura ya respondimos 200 y nadie
// va a reintentar si esto se cae por la mitad.
// ──────────────────────────────────────────────────────────
/**
 * A qué organización pertenece una suscripción de Mercado Pago.
 *
 * Se pregunta PRIMERO a nuestra propia tabla: el id del preapproval se guarda
 * al crear el checkout, así que no dependemos de que MP nos devuelva nada.
 * external_reference queda como respaldo, para una suscripción creada por
 * fuera de nuestro checkout (a mano desde el panel de MP, por ejemplo).
 */
async function resolveOrgId(preapprovalId, externalReference) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('organization_id')
    .eq('mp_preapproval_id', String(preapprovalId))
    .maybeSingle();
  if (error) throw error;
  if (data?.organization_id) return data.organization_id;

  return fromMpReference(externalReference);
}

async function handlePreapprovalEvent(preapprovalId) {
  const pre = await getPreapproval(preapprovalId);
  const orgId = await resolveOrgId(preapprovalId, pre?.external_reference);

  if (!orgId) {
    // Ni en nuestra tabla ni en external_reference: no hay forma de saber de
    // quién es. Se registra y se sigue — nunca se adivina un tenant.
    console.warn(`Preapproval ${preapprovalId} sin organización asociada: se ignora`);
    return;
  }

  const { error } = await supabase.rpc('apply_preapproval_event', {
    p_preapproval_id: String(preapprovalId),
    p_org: orgId,
    p_plan_code: await planCodeFor(orgId),
    p_mp_status: pre.status,
    p_payer_email: pre.payer_email ?? null,
    p_payer_id: pre.payer_id != null ? String(pre.payer_id) : null,
    p_amount: pre.auto_recurring?.transaction_amount ?? null,
    p_next_payment_date: pre.next_payment_date ?? null,
  });
  if (error) throw error;

  console.log(`✅ Webhook MP: suscripción ${preapprovalId} → ${pre.status} (org ${orgId})`);
}

// El plan que la organización estaba contratando quedó anotado en
// pending_plan_code cuando se creó el preapproval. Mercado Pago no nos
// devuelve nuestro código de plan, sólo el importe, así que la fuente es
// nuestra propia fila. Si no hay ninguno pendiente (por ejemplo, un cambio de
// estado de una suscripción que ya estaba activa) se conserva el actual.
async function planCodeFor(orgId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_code, pending_plan_code')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data?.pending_plan_code ?? data?.plan_code ?? 'free';
}

async function handleAuthorizedPayment(authorizedPaymentId) {
  const ap = await getAuthorizedPayment(authorizedPaymentId);

  // El cobro trae el preapproval que lo generó, que es con lo que resolvemos
  // el tenant contra nuestra propia tabla. Si ni eso alcanza, se sube al
  // preapproval en MP a buscar su external_reference.
  let orgId = await resolveOrgId(ap?.preapproval_id, ap?.external_reference);
  if (!orgId && ap?.preapproval_id) {
    const pre = await getPreapproval(ap.preapproval_id);
    orgId = fromMpReference(pre?.external_reference);
  }
  if (!orgId) {
    console.warn(`Cobro ${authorizedPaymentId} sin organización asociada: se ignora`);
    return;
  }

  const paymentStatus = ap?.payment?.status ?? ap?.status ?? 'pending';

  const { error } = await supabase.rpc('record_subscription_payment', {
    p_org: orgId,
    p_mp_authorized_payment_id: String(authorizedPaymentId),
    p_mp_payment_id: ap?.payment?.id != null ? String(ap.payment.id) : null,
    p_status: paymentStatus,
    p_amount: ap?.transaction_amount ?? null,
    p_paid_at: ap?.date_created ?? null,
    p_next_payment_date: ap?.next_payment_date ?? null,
    p_raw: ap ?? null,
  });
  if (error) throw error;

  console.log(`✅ Webhook MP: cobro ${authorizedPaymentId} → ${paymentStatus} (org ${orgId})`);
}

// ──────────────────────────────────────────────────────────
// POST /api/webhook/mercadopago
// Receives MP payment notifications (IPN). Responde 200 rápido (MP exige
// <22s) y procesa después. Idempotente vía record_webhook_event().
// ──────────────────────────────────────────────────────────
router.post('/api/webhook/mercadopago', async (req, res) => {
  const { type, data } = req.body || {};
  const externalId = String(data?.id ?? req.query['data.id'] ?? '');
  const signatureValid = isValidMpSignature(req);

  if (!signatureValid) {
    // TEMPORAL (diagnóstico): sin esto, "firma inválida" tapa tres causas muy
    // distintas — secreto equivocado, notificación legacy sin data.id, o topic
    // que ni siquiera firmamos. Sacar cuando el flujo esté verificado.
    console.warn(
      'Webhook MP rechazado: firma inválida.',
      JSON.stringify({
        query: req.query,
        bodyType: type ?? null,
        bodyAction: req.body?.action ?? null,
        tieneSignature: Boolean(req.headers['x-signature']),
        tieneRequestId: Boolean(req.headers['x-request-id']),
      })
    );
    return res.sendStatus(401);
  }

  if (!type || !externalId) {
    return res.sendStatus(400);
  }

  // Ack inmediato: lo pesado (llamar a la API de MP, actualizar la orden) va después.
  res.sendStatus(200);

  try {
    const { data: isNew, error: rpcError } = await supabase.rpc('record_webhook_event', {
      p_provider: 'mercadopago',
      p_topic: type,
      p_external_id: externalId,
      p_payload: req.body,
      p_signature_valid: signatureValid,
    });
    if (rpcError) throw rpcError;

    // Ya lo habíamos procesado (reintento de MP): no hacer nada más.
    if (!isNew) return;

    if (type === 'payment') {
      const payment = new Payment(mpClient);
      const paymentData = await withTimeout(payment.get({ id: data.id }), 8000, 'Mercado Pago payment.get');
      const orderNumber = paymentData.external_reference;
      const approved = paymentData.status === 'approved';
      const rejected = paymentData.status === 'rejected';

      await supabase
        .from('orders')
        .update({
          status: approved ? 'paid' : rejected ? 'cancelled' : 'pending',
          mp_payment_id: String(data.id),
          ...(approved ? { paid_at: new Date().toISOString() } : {}),
        })
        .eq('order_number', orderNumber);

      console.log(`✅ Webhook MP: pago ${data.id} → ${paymentData.status} (orden ${orderNumber})`);
    } else if (type === 'subscription_preapproval') {
      await handlePreapprovalEvent(externalId);
    } else if (type === 'subscription_authorized_payment') {
      await handleAuthorizedPayment(externalId);
    }

    await supabase.rpc('mark_webhook_processed', {
      p_provider: 'mercadopago',
      p_topic: type,
      p_external_id: externalId,
    });
  } catch (err) {
    console.error('Webhook MP error (post-ack):', err);
    try {
      await supabase.rpc('mark_webhook_processed', {
        p_provider: 'mercadopago',
        p_topic: type,
        p_external_id: externalId,
        p_error: err.message,
      });
    } catch {
      // Ya logueamos el error real arriba; si ni siquiera esto anda, no hay
      // mucho más que hacer que no reintentar en un bucle.
    }
  }
});

export default router;
