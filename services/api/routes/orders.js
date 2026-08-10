import { Router } from 'express';
import { Preference, Payment } from 'mercadopago';
import { supabase } from '../lib/supabase.js';
import { mpClient } from '../lib/mercadopago.js';
import { FRONTEND_URL } from '../lib/config.js';
import { generateOrderNumber, createOrder } from '../lib/orders.js';
import { sendEmailNotification } from '../lib/email.js';

const router = Router();

// ──────────────────────────────────────────────────────────
// POST /api/create-preference
// Creates a Mercado Pago preference + order in Supabase
// Used for: Card & Mercado Pago payments
// ──────────────────────────────────────────────────────────
router.post('/api/create-preference', async (req, res) => {
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
// POST /api/orders/transfer
// Creates an order for bank transfer payment
// ──────────────────────────────────────────────────────────
router.post('/api/orders/transfer', async (req, res) => {
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
router.post('/api/process-payment', async (req, res) => {
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
router.get('/api/orders/:orderNumber', async (req, res) => {
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

export default router;
