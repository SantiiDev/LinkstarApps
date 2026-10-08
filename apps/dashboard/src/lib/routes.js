/* Rutas del dashboard.
 *
 * Hasta acá la navegación era un string `activeSection` en App.jsx: no había
 * URL por sección, así que no se podía compartir un enlace, recargar sin
 * volver al inicio, ni usar atrás/adelante del navegador. Este archivo es el
 * puente entre las dos cosas: las páginas y el Sidebar siguen hablando en
 * ids de sección ('devices', 'gb-metrics', …) y el router habla en paths.
 *
 * Al agregar una sección hay que tocar tres lugares: SECTION_PATHS acá, la
 * <Route> en App.jsx y el ítem en Sidebar.jsx.
 *
 * URLs en español y sin acentos ni ñ ('resenas'), para que no haya que
 * percent-encodear al compartirlas.
 */

export const PUBLIC_ROUTES = {
  landing: '/',
  login: '/iniciar-sesion',
  register: '/registro',
  /* Aceptar una invitación al equipo. Es pública en el sentido de que el
   * invitado llega sin sesión y con el token en la URL, pero no se puede
   * resolver sin iniciar sesión: accept_invitation() compara el email de la
   * invitación contra el del JWT, así que la pantalla manda a registrarse y
   * vuelve acá. Fuera de /panel a propósito — el invitado todavía no es
   * miembro de ninguna organización y el guard del panel lo expulsaría. */
  invitation: '/invitacion/:token',
  /* La política de privacidad es pública y sin sesión por obligación, no por
   * comodidad: la pantalla de consentimiento de Google exige una URL accesible
   * sin iniciar sesión, en un dominio propio, para aprobar el acceso a las
   * Business Profile APIs. Sin esto la fase 4 no arranca. */
  privacy: '/privacidad',
};

/* El path concreto, para armar el link que se copia. */
export function invitationPath(token) {
  return `/invitacion/${encodeURIComponent(token)}`;
}

/* Alta: los pasos previos al panel. Se llega con sesión iniciada pero sin
 * organización o sin plan elegido, así que no son públicas ni cuelgan de
 * /panel — el guard del panel justamente redirige acá. */
export const ONBOARDING_BASE = '/alta';

export const ONBOARDING_ROUTES = {
  org: `${ONBOARDING_BASE}/empresa`,
  plan: `${ONBOARDING_BASE}/plan`,
  payment: `${ONBOARDING_BASE}/pago`,
  paymentResult: `${ONBOARDING_BASE}/pago/resultado`,
  // Vincular el expositor. Era el último paso OBLIGATORIO del plan gratis
  // (0015), hasta que la 0022 sacó esa exigencia: el expositor llega días
  // después del alta y la regla dejaba afuera del panel justo al que ya había
  // comprado. Hoy es opcional y también se llega desde Dispositivos.
  device: `${ONBOARDING_BASE}/dispositivo`,
};

export const DASHBOARD_BASE = '/panel';

/* id de sección -> path. El orden es el del Sidebar. */
export const SECTION_PATHS = {
  company: `${DASHBOARD_BASE}/empresa`,
  devices: `${DASHBOARD_BASE}/dispositivos`,
  reviews: `${DASHBOARD_BASE}/resenas`,

  'gb-metrics': `${DASHBOARD_BASE}/google/metricas`,
  'gb-profile': `${DASHBOARD_BASE}/google/perfil`,
  'gb-posts': `${DASHBOARD_BASE}/google/publicaciones`,
  'gb-seo': `${DASHBOARD_BASE}/google/seo-local`,
  'gb-seo-map': `${DASHBOARD_BASE}/google/mapa-seo`,

  'reports-nps': `${DASHBOARD_BASE}/reportes/nps`,
  'reports-sentiment': `${DASHBOARD_BASE}/reportes/sentimiento`,
  'reports-keywords': `${DASHBOARD_BASE}/reportes/palabras-clave`,

  'monthly-reports': `${DASHBOARD_BASE}/informes-mensuales`,
  automations: `${DASHBOARD_BASE}/automatizaciones`,
  settings: `${DASHBOARD_BASE}/configuracion`,
  contact: `${DASHBOARD_BASE}/contacto`,
  profile: `${DASHBOARD_BASE}/perfil`,
};

/* Sección a la que se entra después de iniciar sesión. */
export const DEFAULT_SECTION = 'company';

/* Secciones bloqueadas por el modal de "conectá tu ficha de Google"
 * (components/GoogleGate). No se les muestra el aviso de suscripción: quedaría
 * detrás del modal, desenfocado y sin poder tocarse, y encima le corre el alto
 * a la pantalla. El aviso vuelve solo en cuanto la sección deje de estar
 * bloqueada.
 *
 * Es una lista fija aunque la conexión se registra (google_connections, 0024):
 * todas estas secciones muestran el modal SIN conexión y la pantalla real con
 * ella, y con la lista fija AppShell no tiene que consultar a Google en cada
 * sección. El costo es que, conectada la ficha, el aviso de suscripción tampoco
 * aparece en ellas. Mi Empresa entró en octubre de 2026, cuando se rehízo sobre
 * reseñas. */
export const GOOGLE_GATED_SECTIONS = new Set([
  'company',
  'reviews',
  'gb-metrics',
  'gb-profile',
  'gb-posts',
  'gb-seo',
  'reports-sentiment',
  'reports-keywords',
]);

/* Pestañas de Configuración: van en la URL para poder enlazar directo a una
 * (Dispositivos enlaza a la de ubicaciones, por ejemplo). Los alias son los
 * nombres viejos, de cuando Equipo y Gestión local eran secciones propias. */
export const SETTINGS_TABS = ['local', 'equipo', 'facturacion', 'legal'];
export const SETTINGS_TAB_ALIASES = {
  general: 'local',
  locations: 'local',
  employees: 'equipo',
  team: 'equipo',
  billing: 'facturacion',
};

export function settingsTabPath(tab) {
  const resolved = SETTINGS_TAB_ALIASES[tab] || tab;
  return SETTINGS_TABS.includes(resolved)
    ? `${SECTION_PATHS.settings}/${resolved}`
    : SECTION_PATHS.settings;
}

/* path -> id de sección. Se resuelve por prefijo para que
 * /panel/configuracion/facturacion siga contando como 'settings' y el ítem
 * del Sidebar quede marcado. */
export function sectionFromPath(pathname) {
  const entries = Object.entries(SECTION_PATHS);
  const match = entries
    .filter(([, path]) => pathname === path || pathname.startsWith(`${path}/`))
    // El más largo gana: /panel/google/perfil no debe matchear con un padre.
    .sort((a, b) => b[1].length - a[1].length)[0];
  return match ? match[0] : null;
}

/* id de sección -> path, tolerando los ids viejos de Configuración. */
export function pathForSection(section) {
  if (SETTINGS_TAB_ALIASES[section]) return settingsTabPath(section);
  return SECTION_PATHS[section] || SECTION_PATHS[DEFAULT_SECTION];
}
