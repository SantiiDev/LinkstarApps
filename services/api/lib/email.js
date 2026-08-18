if (!process.env.WEB3FORMS_KEY) {
  console.warn(
    '⚠️  Falta WEB3FORMS_KEY en .env — las notificaciones de nuevas órdenes por email no se van a enviar.'
  );
}

// Cómo se cobra cada pedido, en texto. 'manual' es el modo de los primeros
// meses: el comprador confirma en el sitio y el cobro se arregla por fuera.
const PAYMENT_METHOD_LABELS = {
  manual: '🟠 A coordinar con el cliente (el pedido NO está pago)',
  transfer: '🔵 Transferencia bancaria (pendiente)',
  mercadopago: '🟢 Mercado Pago',
  card: '🟢 Tarjeta (Mercado Pago)',
};

const PAYMENT_METHOD_SUBJECTS = {
  manual: 'A coordinar',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
  card: 'Tarjeta',
};

function formatColor(color) {
  if (!color) return null;
  if (color === 'negro') return 'Negro';
  if (color === 'blanco') return 'Blanco';
  return color;
}

// Un combo llega como un item con `isBundle` y sus partes en `items`, cada una
// con su propio color. Sin desplegarlas, el mail no dice qué hay que despachar.
function formatItems(items) {
  return items
    .map((item) => {
      const color = formatColor(item.color);
      const line = `• ${item.name}${color ? ` (${color})` : ''} x${item.qty} — $${(item.price * item.qty).toLocaleString('es-AR')}`;

      if (!item.isBundle || !Array.isArray(item.items)) return line;

      const parts = item.items
        .map((sub) => `    - ${sub.label || sub.name || 'Unidad'}: ${formatColor(sub.color) || 'sin color'}`)
        .join('\n');

      return `${line}\n${parts}`;
    })
    .join('\n');
}

// Consulta del formulario de contacto de apps/ventas. Va por el mismo proveedor
// que las órdenes, pero desde el servidor: así la access_key deja de viajar en
// el bundle del navegador, que es lo que permitía usarla para spamear la
// casilla desde afuera del sitio.
export async function sendContactMessage({ name, email, phone, message }) {
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: process.env.WEB3FORMS_KEY,
      subject: `✉️ Consulta de ${name}`,
      from_name: 'Linkstar Web',
      name,
      email,
      phone: phone || 'No proporcionado',
      message,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!result.success) {
    throw new Error(result.message || 'El proveedor de email rechazó el envío');
  }
}

export async function sendEmailNotification(orderData) {
  try {
    const method = orderData.payment_method;
    const methodLabel = PAYMENT_METHOD_LABELS[method] || method || 'Sin especificar';
    const methodSubject = PAYMENT_METHOD_SUBJECTS[method] || method || 'Sin especificar';

    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: process.env.WEB3FORMS_KEY,
        subject: `🛒 Nueva orden ${orderData.order_number} — ${methodSubject}`,
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
${formatItems(orderData.items)}

TOTAL: $${orderData.total.toLocaleString('es-AR')}

MÉTODO DE PAGO: ${methodLabel}
        `.trim(),
      }),
    });
  } catch (err) {
    console.error('Error al enviar email:', err);
  }
}
