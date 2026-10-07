/* Lectura de la Google Business Profile API. Tres APIs distintas, cada una
 * con su host, porque así las partió Google cuando deprecó la v4 monolítica:
 *
 *   Account Management   qué cuentas administra el usuario conectado
 *   Business Information qué fichas (locations) tiene cada cuenta
 *   My Business v4       las reseñas — la única parte de la v4 que sigue viva
 *                        y que no tiene reemplazo en las APIs nuevas
 *
 *   Performance          métricas diarias de la ficha y palabras de búsqueda
 *                        mensuales (fase 4.6)
 *
 * Todas tienen que estar habilitadas en el proyecto de Google Cloud y cubiertas
 * por el acceso aprobado a la Business Profile API.
 *
 * Funciones con un access token de corta vida; quién lo consigue es de
 * lib/googleSync.js, y qué se hace con lo leído, de lib/reviewSync.js y
 * lib/metricsSync.js.
 */

const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const BUSINESS_INFO_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const V4_BASE = 'https://mybusiness.googleapis.com/v4';
const PERFORMANCE_BASE = 'https://businessprofileperformance.googleapis.com/v1';

// readMask es obligatorio en Business Information: sin él la API responde 400.
// Sólo lo que se guarda en google_locations.
const LOCATION_READ_MASK = 'name,title,storefrontAddress,metadata';

const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Pedido con reintento en 429 y 5xx. La cuota por defecto de estas APIs es por
 * minuto y por proyecto, compartida entre TODOS los clientes: un 429 no es un
 * error de este cliente sino del job entero yendo demasiado rápido, y esperar
 * es la respuesta correcta.
 *
 * Un PUT también se reintenta: publicar una respuesta es idempotente (la
 * reseña tiene una sola respuesta, y volver a mandarla la pisa con el mismo
 * texto). PATCH y DELETE, igual. Un POST NO: crear una publicación dos veces
 * porque Google tardó en contestar la primera la duplicaría en la ficha. */
async function googleRequest(accessToken, url, { method = 'GET', body } = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });

    if (response.ok) return response.status === 204 ? {} : response.json().catch(() => ({}));

    const retryable = method !== 'POST' && (response.status === 429 || response.status >= 500);
    if (retryable && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt);
      continue;
    }

    // El estado solo (PERMISSION_DENIED) no alcanza para diagnosticar: el mismo
    // 403 lo devuelve Google por una API no habilitada en el proyecto
    // (SERVICE_DISABLED), por un permiso que falta o por una ficha a la que la
    // cuenta no tiene acceso. El `reason` de ErrorInfo y el mensaje son los que
    // dicen cuál. Este error va al log del job, nunca al panel: las RPC de sync
    // guardan un texto propio en google_connections.last_error.
    // `errorBody` y no `body`: un `const body` acá, en el mismo bloque que el
    // fetch de arriba, tapa al parámetro `body` y el fetch lo lee antes de que
    // exista ("Cannot access 'body' before initialization") — rompía TODOS los
    // pedidos, no sólo los que fallaban.
    const errorBody = await response.json().catch(() => ({}));
    const reason = errorBody?.error?.details?.find((d) => d?.reason)?.reason || null;
    const message = String(errorBody?.error?.message || '').slice(0, 300);
    const err = new Error(
      `Google API ${response.status} en ${new URL(url).pathname}: ` +
      [errorBody?.error?.status || 'error', reason, message].filter(Boolean).join(' · ')
    );
    err.httpStatus = response.status;
    err.googleStatus = errorBody?.error?.status || null;
    err.googleReason = reason;
    throw err;
  }
}

async function* paginate(accessToken, buildUrl, itemsKey) {
  let pageToken = null;
  do {
    const data = await googleRequest(accessToken, buildUrl(pageToken));
    for (const item of data[itemsKey] ?? []) yield item;
    pageToken = data.nextPageToken || null;
  } while (pageToken);
}

/* Cuentas: la personal del usuario más los grupos de ubicaciones / cuentas de
 * organización a los que tiene acceso. Una cadena suele tener sus sucursales en
 * un grupo, no en la cuenta personal. */
export async function listAccounts(accessToken) {
  const accounts = [];
  for await (const account of paginate(
    accessToken,
    (pageToken) => {
      const params = new URLSearchParams({ pageSize: '20' });
      if (pageToken) params.set('pageToken', pageToken);
      return `${ACCOUNTS_URL}?${params}`;
    },
    'accounts'
  )) {
    accounts.push(account);
  }
  return accounts;
}

/* Fichas de una cuenta ('accounts/123'). Devuelve objetos con `name`
 * ('locations/456'), `title`, `storefrontAddress` y `metadata` (placeId,
 * mapsUri, newReviewUri…). */
export async function listLocations(accessToken, accountName) {
  const locations = [];
  for await (const location of paginate(
    accessToken,
    (pageToken) => {
      const params = new URLSearchParams({ readMask: LOCATION_READ_MASK, pageSize: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      return `${BUSINESS_INFO_BASE}/${accountName}/locations?${params}`;
    },
    'locations'
  )) {
    locations.push(location);
  }
  return locations;
}

/* Una página de reseñas, de la más recientemente actualizada para atrás. La v4
 * necesita la ruta completa cuenta + ficha:
 *   accounts/{accountId}/locations/{locationId}/reviews
 * La respuesta trae además `totalReviewCount` y `averageRating` de la ficha —
 * eso es lo que va al snapshot diario, así que la primera página siempre se
 * pide aunque no haya reseñas nuevas. */
export async function listReviewsPage(accessToken, accountName, locationName, pageToken = null) {
  const params = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
  if (pageToken) params.set('pageToken', pageToken);
  return googleRequest(accessToken, `${V4_BASE}/${accountName}/${locationName}/reviews?${params}`);
}

const STAR_RATING = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/* Publica (o reemplaza) la respuesta del dueño a una reseña. Google devuelve el
 * ReviewReply guardado, con su `updateTime`: eso es lo que se registra, no la
 * hora de nuestro servidor. Límite de Google: 4096 caracteres. */
export async function putReviewReply(accessToken, accountName, locationName, reviewId, comment) {
  const url = `${V4_BASE}/${accountName}/${locationName}/reviews/${encodeURIComponent(reviewId)}/reply`;
  const reply = await googleRequest(accessToken, url, { method: 'PUT', body: { comment } });
  return { comment: reply.comment ?? comment, updateTime: reply.updateTime ?? null };
}

/* ─── Perfil de la ficha (fase 4.7) ───────────────────────────────────────── */

/* Lo que muestra y edita la pantalla Perfil. Es también lo que vigila la
 * protección de ficha: un cambio de Google en cualquiera de estos campos se
 * avisa. */
export const PROFILE_READ_MASK =
  'name,title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,profile,openInfo,metadata';
export const PROTECTED_FIELDS = [
  'title', 'phoneNumbers', 'categories', 'storefrontAddress', 'websiteUri', 'regularHours', 'profile', 'openInfo',
];

export async function getLocationProfile(accessToken, locationName) {
  const params = new URLSearchParams({ readMask: PROFILE_READ_MASK });
  return googleRequest(accessToken, `${BUSINESS_INFO_BASE}/${locationName}?${params}`);
}

/* La versión de la ficha que Google muestra, y qué campos cambió por su cuenta
 * (diffMask) respecto de lo que cargó el negocio. Devuelve { location,
 * diffFields: string[] } con los campos de primer nivel. */
export async function getGoogleUpdated(accessToken, locationName) {
  const params = new URLSearchParams({ readMask: PROTECTED_FIELDS.join(',') });
  const data = await googleRequest(accessToken, `${BUSINESS_INFO_BASE}/${locationName}:getGoogleUpdated?${params}`);
  const diffFields = [...new Set(
    String(data.diffMask || '')
      .split(',')
      .map((f) => f.trim().split('.')[0])
      .filter((f) => PROTECTED_FIELDS.includes(f))
  )];
  return { location: data.location ?? {}, diffFields };
}

/* Escribe campos de la ficha. `fields` es un objeto Location parcial y
 * `updateMask` la lista de campos que se tocan: un campo fuera de la máscara no
 * se escribe, aunque venga en el cuerpo. */
export async function patchLocation(accessToken, locationName, fields, updateMask) {
  const params = new URLSearchParams({ updateMask: updateMask.join(',') });
  return googleRequest(accessToken, `${BUSINESS_INFO_BASE}/${locationName}?${params}`, {
    method: 'PATCH',
    body: fields,
  });
}

/* Atributos de la ficha (accesibilidad, comodidades, pagos, redes). */
export async function getAttributes(accessToken, locationName) {
  const data = await googleRequest(accessToken, `${BUSINESS_INFO_BASE}/${locationName}/attributes`);
  return data.attributes ?? [];
}

/* Qué atributos admite esta ficha (dependen de su categoría y país), con el
 * nombre y el grupo en castellano. */
export async function listAttributeMetadata(accessToken, locationName) {
  const items = [];
  for await (const item of paginate(
    accessToken,
    (pageToken) => {
      const params = new URLSearchParams({ parent: locationName, languageCode: 'es', pageSize: '200' });
      if (pageToken) params.set('pageToken', pageToken);
      return `${BUSINESS_INFO_BASE}/attributes?${params}`;
    },
    'attributeMetadata'
  )) {
    items.push(item);
  }
  return items;
}

/* `attributes`: [{ name: 'attributes/…', valueType, values | uriValues }]. Sólo
 * se escriben los de la máscara; uno en la máscara sin valores se borra. */
export async function updateAttributes(accessToken, locationName, attributes) {
  const params = new URLSearchParams({ attributeMask: attributes.map((a) => a.name).join(',') });
  return googleRequest(accessToken, `${BUSINESS_INFO_BASE}/${locationName}/attributes?${params}`, {
    method: 'PATCH',
    body: { name: `${locationName}/attributes`, attributes },
  });
}

/* ─── Publicaciones (Local Posts, My Business v4) ─────────────────────────── */

/* Las publicaciones de una ficha, de la más nueva a la más vieja. Google ya no
 * da vistas ni clics por publicación (reportInsights se discontinuó en 2023). */
export async function listLocalPosts(accessToken, accountName, locationName) {
  const posts = [];
  for await (const post of paginate(
    accessToken,
    (pageToken) => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      return `${V4_BASE}/${accountName}/${locationName}/localPosts?${params}`;
    },
    'localPosts'
  )) {
    posts.push(post);
  }
  return posts;
}

/* Crea una publicación. `post` es un LocalPost (topicType, summary,
 * callToAction, media, event, offer). Devuelve el LocalPost creado, con su
 * `name` y su `state` (PROCESSING mientras Google la revisa). */
export async function createLocalPost(accessToken, accountName, locationName, post) {
  return googleRequest(accessToken, `${V4_BASE}/${accountName}/${locationName}/localPosts`, {
    method: 'POST',
    body: { languageCode: 'es', ...post },
  });
}

/* `postName` es el nombre completo: 'accounts/1/locations/2/localPosts/3'. */
export async function deleteLocalPost(accessToken, postName) {
  return googleRequest(accessToken, `${V4_BASE}/${postName}`, { method: 'DELETE' });
}

/* ─── Performance API ─────────────────────────────────────────────────────── */

/* Métrica de Google → columna de google_daily_metrics (0029). Quedan afuera las
 * dos que Google deprecó (BUSINESS_CONVERSATIONS, BUSINESS_FOOD_ORDERS). */
export const DAILY_METRIC_COLUMNS = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'impressions_desktop_maps',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'impressions_desktop_search',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'impressions_mobile_maps',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'impressions_mobile_search',
  BUSINESS_DIRECTION_REQUESTS: 'direction_requests',
  CALL_CLICKS: 'call_clicks',
  WEBSITE_CLICKS: 'website_clicks',
  BUSINESS_BOOKINGS: 'bookings',
  BUSINESS_FOOD_MENU_CLICKS: 'food_menu_clicks',
};

function setDateParams(params, prefix, isoDay) {
  const [year, month, day] = isoDay.split('-').map(Number);
  params.set(`${prefix}.year`, String(year));
  params.set(`${prefix}.month`, String(month));
  if (day !== undefined) params.set(`${prefix}.day`, String(day));
}

const pad = (n) => String(n).padStart(2, '0');

/* Métricas diarias de una ficha ('locations/456') entre dos días 'YYYY-MM-DD'
 * inclusive. Devuelve Map<'YYYY-MM-DD', { columna: número }>. Google omite el
 * `value` de los días en cero, así que lo ausente es 0, no "sin dato". */
export async function fetchDailyMetrics(accessToken, locationName, startDay, endDay) {
  const params = new URLSearchParams();
  for (const metric of Object.keys(DAILY_METRIC_COLUMNS)) params.append('dailyMetrics', metric);
  setDateParams(params, 'dailyRange.start_date', startDay);
  setDateParams(params, 'dailyRange.end_date', endDay);

  const data = await googleRequest(
    accessToken,
    `${PERFORMANCE_BASE}/${locationName}:fetchMultiDailyMetricsTimeSeries?${params}`
  );

  const byDay = new Map();
  for (const multi of data.multiDailyMetricTimeSeries ?? []) {
    for (const series of multi.dailyMetricTimeSeries ?? []) {
      const column = DAILY_METRIC_COLUMNS[series.dailyMetric];
      if (!column) continue;
      for (const point of series.timeSeries?.datedValues ?? []) {
        const { year, month, day } = point.date ?? {};
        if (!year || !month || !day) continue;
        const key = `${year}-${pad(month)}-${pad(day)}`;
        if (!byDay.has(key)) byDay.set(key, {});
        byDay.get(key)[column] = Number(point.value ?? 0) || 0;
      }
    }
  }
  return byDay;
}

/* Palabras de búsqueda de una ficha entre dos meses 'YYYY-MM' inclusive.
 * Google no las separa por mes dentro del rango: suma el rango entero. Por eso
 * lib/metricsSync.js pide de a un mes. Devuelve [{ keyword, impressions,
 * threshold }]: uno de los dos números, el otro null. */
export async function fetchMonthlyKeywords(accessToken, locationName, startMonth, endMonth) {
  const rows = [];
  for await (const item of paginate(
    accessToken,
    (pageToken) => {
      const params = new URLSearchParams({ pageSize: '100' });
      setDateParams(params, 'monthlyRange.start_month', startMonth);
      setDateParams(params, 'monthlyRange.end_month', endMonth);
      if (pageToken) params.set('pageToken', pageToken);
      return `${PERFORMANCE_BASE}/${locationName}/searchkeywords/impressions/monthly?${params}`;
    },
    'searchKeywordsCounts'
  )) {
    const value = item.insightsValue?.value;
    const threshold = item.insightsValue?.threshold;
    if (!item.searchKeyword || (value === undefined && threshold === undefined)) continue;
    rows.push({
      keyword: item.searchKeyword,
      impressions: value !== undefined ? Number(value) : null,
      threshold: value === undefined ? Number(threshold) : null,
    });
  }
  return rows;
}

export function starRatingToNumber(value) {
  return STAR_RATING[value] ?? null;
}

export function formatAddress(address) {
  if (!address) return null;
  const parts = [
    ...(address.addressLines ?? []),
    address.locality,
    address.administrativeArea,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}
