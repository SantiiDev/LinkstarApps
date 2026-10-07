// Backend propio (services/api, en Railway desde el 6 de octubre de 2026).
// Contacto y Checkout mandan todo por acá; ya no hay camino de respaldo desde
// el navegador.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// La casilla que se ofrece cuando el API no contesta, la misma que usan las
// políticas de privacidad y el formulario del panel. NUNCA
// soporte@linkstar.com.ar: ese dominio nunca se registró (ver la 0021).
export const SUPPORT_EMAIL = 'linkstar.app1@gmail.com';

// Acá vivía WEB3FORMS_KEY, la access_key de Web3Forms a la vista de cualquiera
// que abriera el bundle. Se borró con los dos respaldos que la usaban cuando el
// API quedó en producción. La key sigue sirviendo del lado del servidor
// (services/api/.env), así que conviene rotarla desde el panel de Web3Forms:
// la vieja quedó publicada en todos los bundles anteriores.
