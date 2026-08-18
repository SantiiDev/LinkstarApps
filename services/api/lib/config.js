export const PORT = process.env.PORT || 3001;

// FRONTEND_URL acepta varias URLs separadas por coma. Desde que este servicio
// es el único backend, atiende a los dos frontends (ventas en 5174, dashboard
// en 5173) y CORS necesita los dos orígenes. Formato heredado del backend de
// Ventas, que ya venía haciendo el split.
//
// La primera de la lista es la principal: es la que se usa para las back_urls
// de Mercado Pago, que tienen que apuntar al checkout del sitio de ventas, no
// al dashboard.
const FRONTEND_URLS_RAW =
  process.env.FRONTEND_URL || 'http://localhost:5174,http://localhost:5173';

export const FRONTEND_URLS = FRONTEND_URLS_RAW
  .split(',')
  .map(u => u.trim())
  .filter(Boolean);

export const FRONTEND_URL = FRONTEND_URLS[0];

// La suscripción al dashboard vuelve de Mercado Pago al DASHBOARD, no al sitio
// de ventas — así que no puede usar FRONTEND_URL. Por default toma la segunda
// entrada de la lista, que es la convención que ya siguen los .env de este
// repo (ventas primero, dashboard después).
export const DASHBOARD_URL =
  process.env.DASHBOARD_URL || FRONTEND_URLS[1] || FRONTEND_URLS[0];

// Mercado Pago valida el back_url al crear el preapproval y rechaza localhost
// con un escueto 400 "Invalid value for back_url, must be a valid URL" — que
// desde el dashboard se ve como "no se pudo iniciar la suscripción" y no dice
// nada. El aviso al arrancar convierte media tarde de debug en una línea.
if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(DASHBOARD_URL)) {
  console.warn(
    `⚠️  DASHBOARD_URL apunta a ${DASHBOARD_URL}. Mercado Pago rechaza back_urls en localhost, ` +
    'así que POST /api/subscriptions/checkout va a fallar con 400. Para probar en local, exponé ' +
    'el dashboard con un túnel (cloudflared) y poné esa URL acá.'
  );
}

// URL pública a la que Mercado Pago manda las notificaciones. Se adjunta a
// cada preapproval como notification_url, además de lo que esté configurado en
// el panel de MP. Vale la redundancia: en desarrollo la URL es un túnel que
// cambia en cada reinicio, y mandarla en el request evita tener que reconfigurar
// el panel cada vez. Si no está definida, MP usa sólo la del panel.
export const WEBHOOK_URL = process.env.WEBHOOK_URL || null;

// Dominio corto grabado en el NFC / impreso en el QR: https://<REDIRECT_DOMAIN>/d/<public_id>
// (ver comentario de devices.public_id en packages/database/supabase/migrations/0003_catalog.sql).
// Subdominio de linkstarapp.com, que es la única zona propia (l.linkstar.com.ar
// nunca se registró: apuntaba a un dominio de nadie).
export const REDIRECT_DOMAIN = process.env.REDIRECT_DOMAIN || 'l.linkstarapp.com';
