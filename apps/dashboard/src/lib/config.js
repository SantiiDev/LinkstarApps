// Dominio corto grabado en el NFC / impreso en el QR: https://<REDIRECT_DOMAIN>/d/<public_id>
// Mismo valor que services/api/lib/config.js REDIRECT_DOMAIN — cada app lo
// define por separado porque son deploys independientes (ver CLAUDE.md).
// Subdominio de linkstarapp.com, la única zona propia.
export const REDIRECT_DOMAIN = import.meta.env.VITE_REDIRECT_DOMAIN || 'l.linkstarapp.com';

// Backend propio (services/api). Lo usan el alta de la suscripción y el
// registro de logins.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// TODO: canal de contacto real para el plan Enterprise. Hoy el único que
// existe en el repo es el Instagram del footer del sitio de ventas; cuando
// haya un mail o un WhatsApp de ventas, cambiar esto por ese. Vive acá y no
// en Landing.jsx porque ahora lo usan dos pantallas (la landing y el selector
// de planes del alta).
export const SALES_CONTACT_URL =
  'https://www.instagram.com/santisiena?igsh=MWwyeW5lYmlsNWRtNQ==';
