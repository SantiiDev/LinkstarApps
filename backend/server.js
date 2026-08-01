import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// ─── Mercado Pago SDK ─────────────────────────────────────
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ─── Supabase ─────────────────────────────────────────────
// El schema en supabase/migrations/0006_rls.sql niega insert/update/delete
// sobre `orders` y ejecución de `resolve_scan` a `anon`/`authenticated` a
// propósito: sólo un cliente de confianza (este backend) puede escribir ahí.
// Por eso este cliente usa la service_role key, no la publishable/anon.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️  Falta SUPABASE_SERVICE_ROLE_KEY en .env — las escrituras a `orders` y ' +
    'las funciones resolve_scan/record_webhook_event van a fallar por RLS. ' +
    'Buscala en el dashboard de Supabase: Project Settings → API → service_role secret.'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ─── Helpers ──────────────────────────────────────────────
function generateOrderNumber() {
  return `LS-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

// La SDK de Mercado Pago no siempre falla rápido ante un token inválido o un
// problema de red — puede quedarse esperando. Como el webhook ya respondió
// 200 antes de esto, un colgado silencioso dejaría el evento sin marcar como
// procesado para siempre. Este timeout garantiza que siempre se llegue al
// catch y se registre el error.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout de ${ms}ms esperando ${label}`)), ms)),
  ]);
}

// Inserta la orden + sus renglones (public.orders / public.order_items,
// ver supabase/migrations/0005_billing_and_orders.sql). Lanza si algo falla:
// mejor un 500 explícito que un pedido "fantasma" sin order_items.
async function createOrder({ orderNumber, status, paymentMethod, buyer, items, total, extra = {} }) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      status,
      payment_method: paymentMethod,
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone || null,
      shipping_address: {
        address: buyer.address,
        city: buyer.city,
        zip: buyer.zip || null,
      },
      subtotal: total,
      shipping_cost: 0,
      discount: 0,
      total,
      ...extra,
    })
    .select()
    .single();

  if (orderError) throw orderError;

  const orderItems = items.map((item) => ({
    order_id: order.id,
    sku: String(item.id ?? item.key),
    product_name: `${item.name}${item.color ? ` - ${item.color === 'negro' ? 'Negro' : 'Blanco'}` : ''}`,
    quantity: item.qty,
    unit_price: item.price,
    total_price: item.price * item.qty,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
  if (itemsError) throw itemsError;

  return order;
}

async function sendEmailNotification(orderData) {
  try {
    const itemsText = orderData.items
      .map(i => `• ${i.name} (${i.color}) x${i.qty} — $${(i.price * i.qty).toLocaleString('es-AR')}`)
      .join('\n');

    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: process.env.WEB3FORMS_KEY,
        subject: `🛒 Nueva orden ${orderData.order_number} — ${orderData.payment_method === 'transfer' ? 'Transferencia' : 'Mercado Pago'}`,
        from_name: 'Linkstar Tienda',
        name: orderData.customer_name,
        email: orderData.customer_email,
        phone: orderData.customer_phone || 'No proporcionado',
        message: `
NUEVA ORDEN: ${orderData.order_number}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLIENTE
  Nombre: ${orderData.customer_name}
  Email: ${orderData.customer_email}
  Teléfono: ${orderData.customer_phone || 'No proporcionado'}

DIRECCIÓN DE ENVÍO
  ${orderData.customer_address}
  ${orderData.customer_city}${orderData.customer_zip ? ` (${orderData.customer_zip})` : ''}

PRODUCTOS
${itemsText}

TOTAL: $${orderData.total.toLocaleString('es-AR')}

MÉTODO DE PAGO: ${orderData.payment_method === 'transfer' ? '🔵 Transferencia bancaria (pendiente)' : '🟢 Mercado Pago'}
        `.trim(),
      }),
    });
  } catch (err) {
    console.error('Error al enviar email:', err);
  }
}

// Valida la firma x-signature de Mercado Pago.
// Manifiesto: "id:{data.id};request-id:{x-request-id};ts:{ts};" firmado con
// HMAC-SHA256 usando el secreto del webhook (panel de MP → Webhooks → Firma secreta).
// Sin esto, cualquiera puede hacer un curl a este endpoint y marcar una orden
// como pagada. Ver supabase/README.md, regla 1 del webhook.
function isValidMpSignature(req) {
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

// ─── Routes ───────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────
// GET /d/:publicId
// Resuelve un toque de NFC/QR: llama a resolve_scan() (SECURITY DEFINER,
// sólo service_role) y redirige. SIEMPRE responde con un destino, incluso
// si algo falla — ver supabase/migrations/0007_functions_and_jobs.sql.
// ──────────────────────────────────────────────────────────
app.get('/d/:publicId', async (req, res) => {
  const fallback = 'https://linkstar.com.ar';
  try {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();

    const { data, error } = await supabase.rpc('resolve_scan', {
      p_public_id: req.params.publicId,
      p_ip: ip || null,
      p_user_agent: req.headers['user-agent'] || null,
      p_referrer: req.headers['referer'] || null,
    });

    if (error) throw error;

    return res.redirect(302, data?.destination || fallback);
  } catch (err) {
    console.error('Error resolviendo escaneo:', err);
    return res.redirect(302, fallback);
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/create-preference
// Creates a Mercado Pago preference + order in Supabase
// Used for: Card & Mercado Pago payments
// ──────────────────────────────────────────────────────────
app.post('/api/create-preference', async (req, res) => {
  try {
    const { items, customer, payMethod } = req.body;

    if (!items?.length || !customer?.name || !customer?.email) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const orderNumber = generateOrderNumber();
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // 1. Save order in Supabase as pending
    const order = await createOrder({
      orderNumber,
      status: 'pending',
      paymentMethod: payMethod === 'mp' ? 'mercadopago' : 'card',
      buyer: customer,
      items,
      total,
    });

    // 2. Create Mercado Pago preference
    const preferenceBody = {
      items: items.map(item => ({
        id: item.id || item.key,
        title: `${item.name} - ${item.color === 'negro' ? 'Negro' : 'Blanco'}`,
        quantity: item.qty,
        unit_price: item.price,
        currency_id: 'ARS',
      })),
      payer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone ? { number: customer.phone } : undefined,
      },
      back_urls: {
        success: `${FRONTEND_URL}?payment=success&order=${orderNumber}`,
        failure: `${FRONTEND_URL}?payment=failure&order=${orderNumber}`,
        pending: `${FRONTEND_URL}?payment=pending&order=${orderNumber}`,
      },
      // auto_return only works with public (non-localhost) URLs
      ...(FRONTEND_URL.startsWith('http://localhost') ? {} : { auto_return: 'approved' }),
      external_reference: orderNumber,
      ...(process.env.WEBHOOK_URL ? { notification_url: `${process.env.WEBHOOK_URL}/api/webhook/mercadopago` } : {}),
      statement_descriptor: 'LINKSTAR NFC',
    };

    const preference = new Preference(mpClient);
    const mpResult = await preference.create({ body: preferenceBody });

    // 3. Update order with MP preference ID
    await supabase
      .from('orders')
      .update({ mp_preference_id: mpResult.id })
      .eq('id', order.id);

    // 4. Send email notification
    await sendEmailNotification({
      order_number: orderNumber,
      payment_method: 'mercadopago',
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_city: customer.city,
      customer_zip: customer.zip,
      items,
      total,
    });

    res.json({
      init_point: mpResult.init_point,
      order_number: orderNumber,
    });
  } catch (err) {
    console.error('Error creating preference:', err);
    res.status(500).json({ error: 'Error al crear la preferencia de pago' });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/webhook/mercadopago
// Receives MP payment notifications (IPN). Responde 200 rápido (MP exige
// <22s) y procesa después. Idempotente vía record_webhook_event().
// ──────────────────────────────────────────────────────────
app.post('/api/webhook/mercadopago', async (req, res) => {
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

// ──────────────────────────────────────────────────────────
// POST /api/orders/transfer
// Creates an order for bank transfer payment
// ──────────────────────────────────────────────────────────
app.post('/api/orders/transfer', async (req, res) => {
  try {
    const { items, customer } = req.body;

    if (!items?.length || !customer?.name || !customer?.email) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const orderNumber = generateOrderNumber();
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // 1. Save order in Supabase
    await createOrder({
      orderNumber,
      status: 'pending',
      paymentMethod: 'transfer',
      buyer: customer,
      items,
      total,
    });

    // 2. Send email notification to admin
    await sendEmailNotification({
      order_number: orderNumber,
      payment_method: 'transfer',
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_city: customer.city,
      customer_zip: customer.zip,
      items,
      total,
    });

    res.json({
      order_number: orderNumber,
      total,
    });
  } catch (err) {
    console.error('Error creating transfer order:', err);
    res.status(500).json({ error: 'Error al crear la orden' });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/process-payment
// Process a card payment using the token from CardPayment Brick
// ──────────────────────────────────────────────────────────
app.post('/api/process-payment', async (req, res) => {
  try {
    const { formData, customer, cartItems } = req.body;

    if (!formData?.token || !customer?.name || !customer?.email) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const orderNumber = generateOrderNumber();
    const transactionAmount = Number(formData.transaction_amount);

    // 1. Create the payment via MP SDK
    const payment = new Payment(mpClient);
    const paymentResult = await payment.create({
      body: {
        token: formData.token,
        transaction_amount: transactionAmount,
        installments: Number(formData.installments),
        payment_method_id: formData.payment_method_id,
        issuer_id: formData.issuer_id,
        payer: {
          email: formData.payer.email,
          identification: formData.payer.identification,
        },
        statement_descriptor: 'LINKSTAR NFC',
        external_reference: orderNumber,
      },
      requestOptions: {
        idempotencyKey: `${orderNumber}-${Date.now()}`,
      },
    });

    // 2. Determine status
    const paymentStatus = paymentResult.status; // approved, rejected, in_process, pending
    const orderStatus = paymentStatus === 'approved' ? 'paid' : paymentStatus === 'rejected' ? 'cancelled' : 'pending';

    // 3. Save order in Supabase
    if (cartItems?.length) {
      await createOrder({
        orderNumber,
        status: orderStatus,
        paymentMethod: 'card',
        buyer: customer,
        items: cartItems,
        total: transactionAmount,
        extra: {
          mp_payment_id: String(paymentResult.id),
          ...(orderStatus === 'paid' ? { paid_at: new Date().toISOString() } : {}),
        },
      });
    }

    // 4. Send email notification if payment approved
    if (paymentStatus === 'approved' && cartItems?.length) {
      await sendEmailNotification({
        order_number: orderNumber,
        payment_method: 'card',
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_address: customer.address,
        customer_city: customer.city,
        customer_zip: customer.zip,
        items: cartItems,
        total: transactionAmount,
      });
    }

    // 5. Return result to frontend
    res.status(201).json({
      status: paymentStatus,
      status_detail: paymentResult.status_detail,
      order_number: orderNumber,
      payment_id: paymentResult.id,
    });
  } catch (err) {
    console.error('Error processing payment:', err);
    res.status(500).json({
      error: 'Error al procesar el pago',
      detail: err.message,
    });
  }
});

// ──────────────────────────────────────────────────────────
// GET /api/orders/:orderNumber
// Get order status (used for success page)
// ──────────────────────────────────────────────────────────
app.get('/api/orders/:orderNumber', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('order_number', req.params.orderNumber)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ error: 'Error al obtener la orden' });
  }
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║   🚀  Linkstar Backend running            ║
  ║   📍  http://localhost:${PORT}              ║
  ║   🔗  Frontend: ${FRONTEND_URL}    ║
  ╚════════════════════════════════════════════╝
  `);
});
