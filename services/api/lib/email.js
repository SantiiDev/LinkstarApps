/* Avisos a NUESTRA casilla: pedidos nuevos y consultas del formulario de
 * contacto de apps/ventas. Los mails al CLIENTE son de lib/mailer.js.
 *
 * ── Dos caminos, y por qué el principal es Resend ──────────────────────────
 * Esto nació sobre Web3Forms, pero su plan gratis rechaza los envíos que salen
 * de un servidor (el checkout de ventas lo dice, y por eso manda su respaldo
 * desde el navegador). Mientras el API corría sólo en local nadie lo notó; el
 * día que se despliega, cada aviso fallaría — y el de pedidos lo hacía en
 * silencio, porque no miraba la respuesta.
 *
 * Así que, con RESEND_API_KEY y SALES_NOTIFY_EMAIL, el aviso sale por `send()`
 * de lib/mailer.js (que sigue siendo lo único que conoce a Resend), con el mail
 * del cliente como reply-to. Sin alguna de las dos queda Web3Forms, que es lo
 * que funciona en desarrollo sin cuenta de Resend.
 */

import { send, isMailerConfigured } from './mailer.js';

const SALES_NOTIFY_EMAIL = process.env.SALES_NOTIFY_EMAIL || null;
const USE_RESEND = Boolean(SALES_NOTIFY_EMAIL && isMailerConfigured());

if (!USE_RESEND && !process.env.WEB3FORMS_KEY) {
  console.warn(
    '⚠️  Sin SALES_NOTIFY_EMAIL + RESEND_API_KEY ni WEB3FORMS_KEY — los avisos de pedidos y consultas no se van a enviar.'
  );
}

/* Manda un aviso a nuestra casilla por el camino que corresponda. Lanza si el
 * proveedor lo rechaza: cada llamador decide si eso corta la request o no. */
async function deliver({ subject, fromName, text, customer }) {
  if (USE_RESEND) {
    await send({ to: SALES_NOTIFY_EMAIL, subject, text, replyTo: customer.email });
    return;
  }

  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: process.env.WEB3FORMS_KEY,
      subject,
      from_name: fromName,
      name: customer.name,
      email: customer.email,
      phone: customer.phone || 'No proporcionado',
      message: text,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!result.success) {
    throw new Error(result.message || 'El proveedor de email rechazó el envío');
  }
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

// Consulta del formulario de contacto de apps/ventas. Sale desde el servidor:
// así la access_key de Web3Forms dejó de viajar en el bundle del navegador, que
// es lo que permitía usarla para spamear la casilla desde afuera del sitio.
export async function sendContactMessage({ name, email, phone, message }) {
  await deliver({
    subject: `✉️ Consulta de ${name}`,
    fromName: 'Linkstar Web',
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
// si el aviso salió, y el fallo queda en el log — antes no pasaba ninguna de
// las dos cosas.
export async function sendEmailNotification(orderData) {
  try {
    const method = orderData.payment_method;
    const methodLabel = PAYMENT_METHOD_LABELS[method] || method || 'Sin especificar';
    const methodSubject = PAYMENT_METHOD_SUBJECTS[method] || method || 'Sin especificar';

    await deliver({
      subject: `🛒 Nueva orden ${orderData.order_number} — ${methodSubject}`,
      fromName: 'Linkstar Tienda',
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
    return true;
  } catch (err) {
    console.error(`Error al enviar el aviso de la orden ${orderData.order_number}:`, err.message);
    return false;
  }
}
