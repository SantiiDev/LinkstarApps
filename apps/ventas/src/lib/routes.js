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
};
