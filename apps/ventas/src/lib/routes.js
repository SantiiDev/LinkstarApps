/* Rutas del sitio de ventas.
 *
 * Fuente única de las URLs públicas: Navbar, Footer, App y cualquier
 * navegación programática las leen de acá, así renombrar una ruta es un solo
 * cambio. Las URLs van en español (el público del sitio lo es) y sin acentos
 * ni ñ, para que no haya que percent-encodear al compartirlas.
 *
 * Ojo al agregar rutas: el sitio se sirve como SPA desde Cloudflare Workers
 * (`not_found_handling: "single-page-application"` en wrangler.jsonc), así que
 * cualquier path nuevo ya funciona como deep link sin tocar el Worker.
 */
export const ROUTES = {
  home: '/',
  shop: '/tienda',
  linkstarapp: '/linkstarapp',
  contact: '/contacto',
  checkout: '/finalizar-compra',
  about: '/nosotros',
  warranty: '/garantia',
  legal: '/legal',
  privacy: '/privacidad',
  terms: '/terminos',
  /* Botón de arrepentimiento (Res. 424/2020 de la Secretaría de Comercio
   * Interior): toda tienda online tiene que ofrecer un acceso directo y
   * fácilmente visible desde la home para revocar una compra. Por eso es una
   * página propia enlazada en el footer y no un párrafo adentro de Términos. */
  withdrawal: '/arrepentimiento',
};

/* Portal oficial de Defensa de las y los Consumidores. La Res. 1033/2021 pide
 * un enlace visible en el sitio, así que vive con las rutas para que no se
 * pierda en el medio del JSX del footer. */
export const CONSUMER_DEFENSE_URL = 'https://autogestion.produccion.gob.ar/consumidores';
