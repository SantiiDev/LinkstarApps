/* Lectura de la Google Business Profile API. Tres APIs distintas, cada una
 * con su host, porque así las partió Google cuando deprecó la v4 monolítica:
 *
 *   Account Management   qué cuentas administra el usuario conectado
 *   Business Information qué fichas (locations) tiene cada cuenta
 *   My Business v4       las reseñas — la única parte de la v4 que sigue viva
 *                        y que no tiene reemplazo en las APIs nuevas
 *
 * Las tres tienen que estar habilitadas en el proyecto de Google Cloud y
 * cubiertas por el acceso aprobado a la Business Profile API. La Performance
 * API (métricas de la ficha) no se usa todavía.
 *
 * Todo es lectura con un access token de corta vida; quién lo consigue y qué se
 * hace con lo leído es de lib/reviewSync.js.
 */

const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const BUSINESS_INFO_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const V4_BASE = 'https://mybusiness.googleapis.com/v4';

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
 * texto). */
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

    const retryable = response.status === 429 || response.status >= 500;
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
