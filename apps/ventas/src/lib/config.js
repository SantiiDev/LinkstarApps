// Backend propio (services/api). En producción todavía apunta al placeholder
// de .env.production porque el API no está desplegado — por eso las dos
// pantallas que lo usan (Contacto y Checkout) tienen camino de respaldo.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ⚠️ Único lugar donde vive la access_key de Web3Forms en el front.
//
// Está a la vista de cualquiera que abra el bundle: eso es lo que permite que
// un tercero la use para llenarnos la casilla de mensajes. La solución real es
// que los dos formularios manden por services/api (POST /api/contact y
// POST /api/orders/manual), donde la key vive en el .env del servidor; ya lo
// hacen, y esto quedó sólo como respaldo mientras el API no esté desplegado.
//
// EL DÍA QUE EL API ESTÉ ARRIBA: borrar esta constante y los dos caminos de
// respaldo que la usan. Mientras tanto, mitigaciones que se activan desde el
// panel de Web3Forms y no desde acá: restringir los dominios permitidos y
// exigir captcha.
export const WEB3FORMS_KEY = '32d006c0-18f0-411b-989f-19a34a6963c2';
