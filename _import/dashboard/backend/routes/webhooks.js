import { Router } from 'express';
import { Payment } from 'mercadopago';
import { supabase } from '../lib/supabase.js';
import { mpClient, withTimeout, isValidMpSignature } from '../lib/mercadopago.js';

const router = Router();

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
    console.warn('Webhook MP rechazado: firma inválida (o MP_WEBHOOK_SECRET sin configurar)');
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
