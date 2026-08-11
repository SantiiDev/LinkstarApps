if (!process.env.WEB3FORMS_KEY) {
  console.warn(
    '⚠️  Falta WEB3FORMS_KEY en .env — las notificaciones de nuevas órdenes por email no se van a enviar.'
  );
}

export async function sendEmailNotification(orderData) {
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
