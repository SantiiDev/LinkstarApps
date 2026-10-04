// Dominio corto grabado en el NFC / impreso en el QR: https://<REDIRECT_DOMAIN>/d/<public_id>
// Mismo valor que services/api/lib/config.js REDIRECT_DOMAIN — cada app lo
// define por separado porque son deploys independientes (ver CLAUDE.md).
// Subdominio de linkstarapp.com, la única zona propia.
export const REDIRECT_DOMAIN = import.meta.env.VITE_REDIRECT_DOMAIN || 'l.linkstarapp.com';

// Backend propio (services/api). Lo usan el alta de la suscripción y el
// registro de logins.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/* ─── TEMPORAL — borrar cuando llegue el OAuth de Google ──────────────────
 *
 * Habilita la carga manual de ubicaciones (pages/Locations/NewLocationModal.jsx).
 *
 * Las ubicaciones definitivas se van a cargar conectando la ficha de Google:
 * el scope `business.manage` devuelve los locales del cliente y los importamos.
 * Pero ese permiso se aprueba a mano a nivel del proyecto de Google Cloud y
 * todavía está en trámite, así que hasta que llegue no hay forma de crear una
 * `locations` desde ningún lado — y sin local, un escaneo no tiene a dónde ir y
 * cae al fallback de resolve_scan(). O sea: no se puede probar el circuito
 * completo ni siquiera en desarrollo.
 *
 * Este flag levanta un formulario manual que escribe por el MISMO camino que
 * va a usar el OAuth (insert sobre `locations`, misma policy locations_insert
 * de la 0014, mismo trigger de límite de plan), así que lo que se prueba con él
 * es lo que va a correr después.
 *
 * Sólo se define en el .env local. Para sacarlo: borrar NewLocationModal.jsx y
 * su CSS, este export, los dos bloques condicionales de Locations.jsx y la
 * línea de .env.example. El flag es grepeable.
 * ------------------------------------------------------------------------- */
export const MANUAL_LOCATION_ENABLED =
  import.meta.env.VITE_ENABLE_MANUAL_LOCATION === 'true';

// TODO: canal de contacto real para el plan Enterprise. Hoy el único que
// existe en el repo es el Instagram del footer del sitio de ventas; cuando
// haya un mail o un WhatsApp de ventas, cambiar esto por ese. Vive acá y no
// en Landing.jsx porque ahora lo usan dos pantallas (la landing y el selector
// de planes del alta).
export const SALES_CONTACT_URL =
  'https://www.instagram.com/santisiena?igsh=MWwyeW5lYmlsNWRtNQ==';
