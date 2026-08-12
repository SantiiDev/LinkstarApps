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

  'reports-nps': `${DASHBOARD_BASE}/reportes/nps`,
  'reports-sentiment': `${DASHBOARD_BASE}/reportes/sentimiento`,
  'reports-keywords': `${DASHBOARD_BASE}/reportes/palabras-clave`,

  'monthly-reports': `${DASHBOARD_BASE}/informes-mensuales`,
  automations: `${DASHBOARD_BASE}/automatizaciones`,
  settings: `${DASHBOARD_BASE}/configuracion`,
  profile: `${DASHBOARD_BASE}/perfil`,
};

/* Sección a la que se entra después de iniciar sesión. */
export const DEFAULT_SECTION = 'company';

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
