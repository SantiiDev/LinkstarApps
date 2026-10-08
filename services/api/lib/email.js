/* Avisos a NUESTRA casilla: pedidos nuevos y consultas del formulario de
 * contacto (ventas y panel). Los mails al CLIENTE son de lib/mailer.js.
 *
 * ── Sólo Resend ───────────────────────────────────────────────────────────
 * Todo mail del sistema sale por `send()` de lib/mailer.js, la única función
 * que conoce a Resend; acá va con el mail del cliente como reply-to, para
 * contestarle con «Responder».
 *
 * SALES_NOTIFY_EMAIL es obligatoria: es el único lugar donde está la casilla de
 * destino. Sin RESEND_API_KEY, `send()` simula el mail en consola, como el resto
 * de los mails en desarrollo; un aviso simulado NO cuenta como enviado.
 */

import { send } from './mailer.js';

const SALES_NOTIFY_EMAIL = process.env.SALES_NOTIFY_EMAIL || null;

if (!SALES_NOTIFY_EMAIL) {
  console.warn(
    '⚠️  Falta SALES_NOTIFY_EMAIL en .env — los avisos de pedidos y consultas no tienen a dónde ir y van a fallar.'
  );
}

/* Manda un aviso a nuestra casilla. Lanza si falta el destino o si Resend lo
 * rechaza: cada llamador decide si eso corta la request o no. Devuelve el
 * resultado de `send()` ({ sent, simulated, id }). */
async function deliver({ subject, text, customer }) {
  if (!SALES_NOTIFY_EMAIL) throw new Error('Falta SALES_NOTIFY_EMAIL: el aviso no tiene destinatario');
  return send({ to: SALES_NOTIFY_EMAIL, subject, text, replyTo: customer.email });
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

// Consulta del formulario de contacto. Sale desde el servidor, con rate limit
// (routes/contact.js): ninguna clave de envío viaja en el bundle del navegador.
export async function sendContactMessage({ name, email, phone, message }) {
  await deliver({
    subject: `✉️ Consulta de ${name}`,
    customer: { name, email, phone },
    text: `
CONSULTA DESDE LA WEB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Nombre: ${name}
  Email: ${email}
  Teléfono: ${phone || 'No proporcionado'}

${message}
    `.trim(),
  });
}

// No lanza: el pedido ya está guardado cuando se llama, y un mail que falla no
// puede convertir eso en un 500 (ver /api/orders/manual en CLAUDE.md). Devuelve
// si el aviso salió de verdad (un aviso simulado, sin RESEND_API_KEY, no), y
// el fallo queda en el log.
export async function sendEmailNotification(orderData) {
  try {
    const method = orderData.payment_method;
    const methodLabel = PAYMENT_METHOD_LABELS[method] || method || 'Sin especificar';
    const methodSubject = PAYMENT_METHOD_SUBJECTS[method] || method || 'Sin especificar';

    const result = await deliver({
      subject: `🛒 Nueva orden ${orderData.order_number} — ${methodSubject}`,
      customer: {
        name: orderData.customer_name,
        email: orderData.customer_email,
        phone: orderData.customer_phone,
      },
      text: `
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
    });
    return result.sent;
  } catch (err) {
    console.error(`Error al enviar el aviso de la orden ${orderData.order_number}:`, err.message);
    return false;
  }
}
