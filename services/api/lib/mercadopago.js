import crypto from 'node:crypto';
import { MercadoPagoConfig } from 'mercadopago';

if (!process.env.MP_ACCESS_TOKEN) {
  console.warn(
    '⚠️  Falta MP_ACCESS_TOKEN en .env — crear preferencias y procesar pagos de ' +
    'Mercado Pago va a fallar. Buscalo en el panel de Mercado Pago: Tus integraciones → Credenciales.'
  );
}

export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// La SDK de Mercado Pago no siempre falla rápido ante un token inválido o un
// problema de red — puede quedarse esperando. Como el webhook ya respondió
// 200 antes de esto, un colgado silencioso dejaría el evento sin marcar como
// procesado para siempre. Este timeout garantiza que siempre se llegue al
// catch y se registre el error.
//
// Desde la v3 (oct 2026) la SDK trae su propio timeout por intento (10 s) y
// reintenta 429/5xx hasta 3 veces con la MISMA clave de idempotencia (un
// reintento de payment.create no cobra dos veces). Este tope sigue haciendo
// falta: acota el total, reintentos incluidos. Sus errores son subclases de
// Error (MercadoPagoError) con `status`, `message` y `causes`, que es lo que
// leen los catch de las rutas.
export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout de ${ms}ms esperando ${label}`)), ms)),
  ]);
}

// Valida la firma x-signature de Mercado Pago.
// Manifiesto: "id:{data.id};request-id:{x-request-id};ts:{ts};" firmado con
// HMAC-SHA256 usando el secreto del webhook (panel de MP → Webhooks → Firma secreta).
// Sin esto, cualquiera puede hacer un curl a este endpoint y marcar una orden
// como pagada. Ver packages/database/supabase/README.md, regla 1 del webhook.
export function isValidMpSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false; // fail-closed: sin secreto configurado, no se confía en nada

  const signatureHeader = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const dataId = req.query['data.id'];
  if (!signatureHeader || !requestId || !dataId) return false;

  const parts = {};
  for (const part of String(signatureHeader).split(',')) {
    const [key, value] = part.split('=').map((s) => s?.trim());
    if (key && value) parts[key] = value;
  }
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const gotBuf = Buffer.from(v1, 'hex');
  return expectedBuf.length === gotBuf.length && crypto.timingSafeEqual(expectedBuf, gotBuf);
}
