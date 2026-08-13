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

// Dominio corto grabado en el NFC / impreso en el QR: https://<REDIRECT_DOMAIN>/d/<public_id>
// (ver comentario de devices.public_id en packages/database/supabase/migrations/0003_catalog.sql).
export const REDIRECT_DOMAIN = process.env.REDIRECT_DOMAIN || 'l.linkstar.com.ar';
