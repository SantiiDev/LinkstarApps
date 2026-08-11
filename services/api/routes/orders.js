import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Preference, Payment } from 'mercadopago';
import { supabase } from '../lib/supabase.js';
import { mpClient } from '../lib/mercadopago.js';
import { FRONTEND_URL } from '../lib/config.js';
import { generateOrderNumber, createOrder } from '../lib/orders.js';
import { sendEmailNotification } from '../lib/email.js';
import {
  validateBody,
  createPreferenceSchema,
  orderTransferSchema,
  processPaymentSchema,
} from '../lib/validation.js';
import { assertCatalogPrices, assertMatchesCatalogTotal } from '../lib/catalog.js';

const router = Router();

// Estas tres rutas llaman a la API paga de Mercado Pago y/o mandan un email
// por Web3Forms — sin límite, un atacante puede generar tráfico de pago o
// vaciar la cuota de notificaciones. Un comprador real hace como mucho un
// puñado de intentos en unos minutos.
const paymentLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/orders/:orderNumber ahora exige el email del comprador como
// segundo factor (ver más abajo) — el rate limit es la segunda barrera
// contra fuerza bruta del número de orden.
const orderLookupLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ──────────────────────────────────────────────────────────
// POST /api/create-preference
// Creates a Mercado Pago preference + order in Supabase
// Used for: Card & Mercado Pago payments
// ──────────────────────────────────────────────────────────
router.post('/api/create-preference', paymentLimiter, validateBody(createPreferenceSchema), async (req, res) => {
  try {
    const { items, customer, payMethod } = req.body;
    assertCatalogPrices(items);

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
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Error creating preference:', err);
    res.status(500).json({ error: 'Error al crear la preferencia de pago' });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/orders/transfer
// Creates an order for bank transfer payment
// ──────────────────────────────────────────────────────────
router.post('/api/orders/transfer', paymentLimiter, validateBody(orderTransferSchema), async (req, res) => {
  try {
    const { items, customer } = req.body;
    assertCatalogPrices(items);

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
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Error creating transfer order:', err);
    res.status(500).json({ error: 'Error al crear la orden' });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/process-payment
// Process a card payment using the token from CardPayment Brick
// ──────────────────────────────────────────────────────────
router.post('/api/process-payment', paymentLimiter, validateBody(processPaymentSchema), async (req, res) => {
  try {
    const { formData, customer, cartItems } = req.body;

    // El monto que se le cobra en MP tiene que salir del catálogo, no del
    // transaction_amount que manda el cliente — si no hay cartItems no hay
    // con qué validarlo, así que se rechaza (mejor eso que cobrar a ciegas).
    if (!cartItems?.length) {
      return res.status(400).json({ error: 'Faltan los items del carrito' });
    }
    assertCatalogPrices(cartItems);
    assertMatchesCatalogTotal(formData.transaction_amount, cartItems);

    const orderNumber = generateOrderNumber();
    const transactionAmount = formData.transaction_amount;

    // 1. Create the payment via MP SDK
    const payment = new Payment(mpClient);
    const paymentResult = await payment.create({
      body: {
        token: formData.token,
        transaction_amount: transactionAmount,
        installments: formData.installments,
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
    if (err.status === 400) return res.status(400).json({ error: err.message });
    // El detalle completo del error (puede incluir texto del SDK de MP o de
    // Postgres) sólo va al log del servidor — nunca al cliente. Ver CWE-209.
    console.error('Error processing payment:', err);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

// ──────────────────────────────────────────────────────────
// GET /api/orders/:orderNumber?email=<buyer_email>
// Get order status (used for success page). Este cliente usa service_role,
// que bypassea el RLS de 0006_rls.sql (orders_select exige
// buyer_email = auth.jwt()->>'email' o pertenencia a la organización) — así
// que replicamos esa misma condición acá a mano exigiendo el email del
// comprador como segundo factor. Sin esto, el order_number solo (aunque hoy
// tenga entropía real, ver lib/orders.js) sería la única barrera.
// ──────────────────────────────────────────────────────────
router.get('/api/orders/:orderNumber', orderLookupLimiter, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Falta el email del comprador' });
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('order_number', req.params.orderNumber)
      .ilike('buyer_email', email)
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

export default router;
