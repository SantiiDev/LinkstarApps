// Backend propio (services/api, en Railway desde el 6 de octubre de 2026).
// Contacto y Checkout mandan todo por acá; ya no hay camino de respaldo desde
// el navegador.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// La casilla que se ofrece cuando el API no contesta, la misma que usan las
// políticas de privacidad y el formulario del panel. NUNCA
// soporte@linkstar.com.ar: ese dominio nunca se registró (ver la 0021).
export const SUPPORT_EMAIL = 'linkstar.app1@gmail.com';

// Ninguna clave de un servicio de mail va en este bundle: lo puede leer
// cualquiera. Los avisos salen del API, por Resend.
