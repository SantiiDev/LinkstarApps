import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { API_URL } from './config';
import { requireOrg } from './dashboardApi';

/* Conexión con Google Business Profile (migración 0024 + services/api/routes/google.js).
 *
 * El panel nunca toca credenciales ni tokens de Google. Hace tres cosas:
 *
 *   - Lee el ESTADO de la conexión de `google_connections`, que es una tabla
 *     sin secretos con RLS (el refresh token vive cifrado en `private`).
 *   - Pide al API la URL de Google y navega a ella. El fetch lleva
 *     `credentials: 'include'` por una razón concreta: el API setea en esa
 *     respuesta la cookie con el `state` anti-CSRF, y el callback exige que el
 *     navegador que vuelve de Google la traiga. Sin `include` el navegador la
 *     descarta y la conexión falla SIEMPRE en el último paso, con "error_estado".
 *   - Pide al API que desconecte (revoca en Google y borra).
 *
 * Desde la fase 4.5 además lee las fichas y las reseñas (tablas con RLS, sin
 * pasar por el API), vincula fichas con sucursales (RPC link_google_location) y,
 * vía API, responde reseñas y pide "Actualizar ahora".
 */

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión vencida');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

/* fetch al API propio. Un fallo de red se traduce a un texto que se pueda
 * mostrar: el panel publicado puede estar arriba mientras el API todavía no
 * (el API se despliega después), y "TypeError: Failed to fetch" en pantalla no
 * le dice nada a nadie. */
async function apiFetch(path, options, fallbackMessage) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, options);
  } catch {
    // En desarrollo casi siempre es el API local apagado (`node server.js`
    // desde services/api): decirlo ahorra buscar una caída que no existe.
    throw new Error(import.meta.env.DEV
      ? `No hay respuesta del API en ${API_URL}. ¿Está corriendo services/api?`
      : 'El servicio no está disponible en este momento. Probá de nuevo más tarde.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallbackMessage);
  return body;
}

export async function fetchGoogleConnection(organizationId) {
  const { data, error } = await supabase
    .from('google_connections')
    .select('status, connected_at, last_synced_at, last_error, last_error_at')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* No devuelve: si sale bien, el navegador ya se fue a Google. */
export async function startGoogleConnect() {
  const body = await apiFetch(
    '/api/google/oauth/start',
    { method: 'POST', credentials: 'include', headers: await authHeaders() },
    'No se pudo iniciar la conexión con Google'
  );
  if (!body.url) throw new Error('No se pudo iniciar la conexión con Google');
  window.location.assign(body.url);
}

export async function disconnectGoogle() {
  await apiFetch(
    '/api/google/disconnect',
    { method: 'POST', headers: await authHeaders() },
    'No se pudo desconectar Google'
  );
}

/* "Actualizar ahora": el API relee la cuenta en segundo plano (202). Lo que
 * cambia se ve recargando la conexión: last_synced_at avanza al terminar. */
export async function requestGoogleSync() {
  return apiFetch(
    '/api/google/sync',
    { method: 'POST', headers: await authHeaders() },
    'No se pudo actualizar la conexión con Google'
  );
}

/* Publica (o reemplaza) la respuesta a una reseña. Devuelve lo que Google
 * guardó, que es lo que hay que mostrar. */
export async function replyToReview(reviewId, comment) {
  return apiFetch(
    `/api/google/reviews/${encodeURIComponent(reviewId)}/reply`,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ comment }) },
    'No se pudo publicar la respuesta'
  );
}

/* ─── Fichas ──────────────────────────────────────────────────────────────── */

/* Las fichas de Google que ve la cuenta conectada (google_locations, RLS:
 * owner/admin/viewer ven todas; un manager, sólo las vinculadas a sus
 * sucursales). */
export async function fetchGoogleLocations(organizationId) {
  const { data, error } = await supabase
    .from('google_locations')
    .select('id, title, address, place_id, maps_uri, location_id, total_reviews, average_rating, reviews_synced_at, metrics_synced_at, last_seen_at, locations(name)')
    .eq('organization_id', requireOrg(organizationId))
    .order('title', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* Vincula una ficha con una sucursal, o la desvincula con `null`. Al
 * desvincular, la base borra en el acto las reseñas guardadas de esa ficha
 * (0025): la pantalla tiene que avisarlo antes. */
export async function linkGoogleLocation(googleLocationId, locationId) {
  const { error } = await supabase.rpc('link_google_location', {
    p_google_location_id: googleLocationId,
    p_location_id: locationId,
  });
  if (error) throw new Error(error.message || 'No se pudo vincular la ficha');
}

/* ─── Reseñas ─────────────────────────────────────────────────────────────── */

export const REVIEWS_PAGE_SIZE = 50;

/* Los filtros de la bandeja, combinables entre sí (formato de <Select>).
 *
 *   - Rating: las estrellas que puso el cliente.
 *   - Estado: «Resp. automáticamente» (fase 7, responder solas las de 5★) y
 *     «Retiradas» (reseñas que el autor o Google borraron: la lectura todavía no
 *     las detecta) no tienen dato. Van deshabilitadas para que se vea lo que
 *     viene, sin un filtro que devuelva siempre vacío.
 *   - Tipo: el TONO del texto según la IA (0033), no las estrellas. Es de
 *     Business: en gratis la pantalla deshabilita las opciones, y aunque no lo
 *     hiciera el RLS de google_review_analysis no devolvería nada. */
export const REVIEW_RATING_OPTIONS = [
  { value: 'all', label: 'Todas' },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} estrella${n === 1 ? '' : 's'}` })),
  // Lo que Mi Empresa llama «negativas» (pendingNegatives en companyOverview.js):
  // su «Responder ahora» abre la bandeja con este filtro.
  { value: 'low', label: '1 y 2 estrellas' },
];

export const REVIEW_STATUS_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'answered', label: 'Respondidas' },
  { value: 'pending', label: 'Sin responder' },
  { value: 'auto', label: 'Resp. automáticamente', disabled: true, soon: true },
  { value: 'withdrawn', label: 'Retiradas', disabled: true, soon: true },
];

export const REVIEW_SORT_OPTIONS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'oldest', label: 'Más antiguas' },
];

export const REVIEW_TYPE_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'positive', label: 'Positivas' },
  { value: 'neutral', label: 'Neutras' },
  { value: 'negative', label: 'Negativas' },
];

export const DEFAULT_REVIEW_FILTERS = {
  locationId: 'all', rating: 'all', status: 'all', sort: 'recent', sentiment: 'all',
};

/* Una página de reseñas, filtrada del lado de la base: con paginación, filtrar
 * en el cliente sólo filtraría lo que ya se cargó. */
export async function fetchReviews(organizationId, args = {}) {
  const { data, error } = await reviewsQuery(organizationId, args);
  if (error) throw error;
  return data ?? [];
}

/* El texto tal como lo escribió el cliente. Cuando la reseña está en otro
 * idioma que la cuenta de Google, la API devuelve las dos versiones juntas:
 *
 *   (Translated by Google) Excellent service…\n\n(Original)\nExcelente atención…
 *
 * (o al revés: el original primero y la traducción después del marcador). Se
 * guarda tal cual llega —el análisis y la búsqueda lo leen así—, y se limpia al
 * mostrarlo. */
const TRANSLATED_MARK = /\((?:Translated by Google|Traducido por Google)\)/i;
const ORIGINAL_MARK = /\(Original\)/i;

export function originalReviewText(comment) {
  if (!comment) return comment;
  const original = comment.search(ORIGINAL_MARK);
  if (original !== -1) {
    const rest = comment.slice(original).replace(ORIGINAL_MARK, '');
    const cut = rest.search(TRANSLATED_MARK);
    return (cut === -1 ? rest : rest.slice(0, cut)).trim();
  }
  const translated = comment.search(TRANSLATED_MARK);
  if (translated > 0) return comment.slice(0, translated).trim();
  return comment.replace(TRANSLATED_MARK, '').trim();
}

/* La bandeja de Reseñas pagina de a 15, con «Anterior» / «Siguiente». */
export const REVIEWS_INBOX_PAGE_SIZE = 15;

/* Una página de la bandeja (`page` desde 0), más cuántas reseñas coinciden con
 * los filtros en total: el «N reseñas» y el «Mostrando 16–30 de N». */
export async function fetchReviewPage(organizationId, { page = 0, ...args } = {}) {
  const { data, error, count } = await reviewsQuery(
    organizationId,
    { ...args, from: page * REVIEWS_INBOX_PAGE_SIZE, pageSize: REVIEWS_INBOX_PAGE_SIZE },
    true
  );
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

function reviewsQuery(organizationId, {
  rating = 'all', status = 'all', sentiment = 'all', sort = 'recent', locationId = null, search = '',
  from = 0, pageSize = REVIEWS_PAGE_SIZE,
} = {}, withCount = false) {
  // `!inner` sobre google_locations: el filtro por sucursal va sobre la tabla
  // embebida, y sin inner PostgREST devolvería las reseñas con el embed en null
  // en vez de excluirlas. Lo mismo con el análisis cuando se filtra por tono.
  // Sin ese filtro el análisis NO se embebe: es de la 0033, y un entorno sin
  // ella (el proyecto de pruebas, a 7 oct 2026) rechazaría la consulta entera y
  // dejaría sin lista a Reseñas y a Mi Empresa. La etiqueta del detalle se lee
  // aparte, con fetchReviewSentiments.
  const analysis = sentiment === 'all' ? '' : ', google_review_analysis!inner(sentiment)';
  let query = supabase
    .from('google_reviews')
    .select(
      'id, reviewer_name, is_anonymous, star_rating, comment, created_time, updated_time, reply_comment, reply_updated_time, ' +
      `google_locations!inner(id, title, maps_uri, location_id, locations(name))${analysis}`,
      withCount ? { count: 'exact' } : undefined
    )
    .eq('organization_id', requireOrg(organizationId))
    .order('created_time', { ascending: sort === 'oldest' })
    .order('id', { ascending: true })
    .range(from, from + pageSize - 1);

  if (rating === 'low') query = query.lte('star_rating', 2);
  else if (rating !== 'all') query = query.eq('star_rating', Number(rating));
  if (status === 'answered') query = query.not('reply_comment', 'is', null);
  if (status === 'pending') query = query.is('reply_comment', null);
  if (sentiment !== 'all') query = query.eq('google_review_analysis.sentiment', sentiment);
  if (locationId) query = query.eq('google_locations.location_id', locationId);

  const term = search.trim().replace(/[%,()]/g, ' ');
  if (term) query = query.or(`reviewer_name.ilike.%${term}%,comment.ilike.%${term}%`);

  return query;
}

/* El tono (0033) de un grupo de reseñas: Map<review_id, sentiment>. Es la
 * etiqueta «Positiva / Neutra / Negativa» del detalle de la bandeja. Sólo
 * Business: en gratis el RLS no devuelve filas. Va aparte de la lista para que
 * un fallo acá (o un entorno sin la 0033) deje la lista sin etiquetas, no sin
 * reseñas. */
export async function fetchReviewSentiments(organizationId, reviewIds) {
  if (!reviewIds.length) return new Map();
  const { data, error } = await supabase
    .from('google_review_analysis')
    .select('review_id, sentiment')
    .eq('organization_id', requireOrg(organizationId))
    .in('review_id', reviewIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.review_id, row.sentiment]));
}

/* Unas reseñas puntuales, por id, de la más nueva a la más vieja: las que se
 * ven al desplegar un aspecto en NPS (el análisis trae los ids, no el texto). */
export async function fetchReviewsByIds(organizationId, reviewIds) {
  if (!reviewIds.length) return [];
  const { data, error } = await supabase
    .from('google_reviews')
    .select('id, reviewer_name, is_anonymous, star_rating, comment, created_time, google_locations(location_id, locations(name))')
    .eq('organization_id', requireOrg(organizationId))
    .in('id', reviewIds)
    .order('created_time', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* Respondidas y sin responder, sobre todas las reseñas leídas de las fichas
 * visibles. Va aparte de la página: los números del encabezado no pueden
 * depender de cuántas se cargaron. */
export async function fetchReviewCounts(organizationId) {
  const org = requireOrg(organizationId);
  const [all, unanswered] = await Promise.all([
    supabase.from('google_reviews').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    supabase.from('google_reviews').select('id', { count: 'exact', head: true }).eq('organization_id', org).is('reply_comment', null),
  ]);
  if (all.error) throw all.error;
  if (unanswered.error) throw unanswered.error;
  return {
    answered: (all.count ?? 0) - (unanswered.count ?? 0),
    unanswered: unanswered.count ?? 0,
  };
}

/* Todas las reseñas leídas de la organización, sin el texto: { id, star_rating,
 * created_time, reply_comment, google_locations: { location_id } }. Es lo que
 * cuenta Mi Empresa (totales, respondidas, distribución, serie y media exacta)
 * filtrando por sucursal y período en el cliente. Se pagina como el análisis:
 * PostgREST corta en 1000 filas. */
const REVIEW_ROWS_PAGE = 1000;
const REVIEW_ROWS_MAX_PAGES = 20;

export async function fetchReviewRows(organizationId) {
  const org = requireOrg(organizationId);
  const rows = [];
  for (let page = 0; page < REVIEW_ROWS_MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('google_reviews')
      .select('id, star_rating, created_time, reply_comment, google_locations!inner(location_id)')
      .eq('organization_id', org)
      .order('created_time', { ascending: false })
      .order('id', { ascending: true })
      .range(page * REVIEW_ROWS_PAGE, (page + 1) * REVIEW_ROWS_PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < REVIEW_ROWS_PAGE) break;
  }
  return rows;
}

/* ─── Análisis de reseñas (fase 5, 0033) ──────────────────────────────────── */

/* Temas de la lista cerrada de la 0033, con su nombre en pantalla. El orden es
 * el de la leyenda cuando no hay datos para ordenar por menciones. */
export const REVIEW_TOPICS = [
  { id: 'atencion', label: 'Atención' },
  { id: 'calidad', label: 'Calidad' },
  { id: 'precio', label: 'Precio' },
  { id: 'espera', label: 'Tiempo de espera' },
  { id: 'ambiente', label: 'Ambiente' },
  { id: 'limpieza', label: 'Limpieza' },
];

const ANALYSIS_PAGE = 1000;
const ANALYSIS_MAX_PAGES = 20;

/* Todos los análisis visibles de la organización, de la reseña más nueva a la
 * más vieja: { review_id, location_id, created_time, star_rating, sentiment,
 * topics, keywords }. Es una función Business: en gratis el RLS devuelve
 * vacío (0033). Se pagina porque PostgREST corta en 1000 filas; 20 páginas
 * son 20.000 reseñas, de sobra para las pantallas de Reportes. */
export async function fetchReviewAnalysis(organizationId) {
  const org = requireOrg(organizationId);
  const rows = [];
  for (let page = 0; page < ANALYSIS_MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('v_review_analysis')
      .select('review_id, location_id, created_time, star_rating, sentiment, topics, keywords')
      .eq('organization_id', org)
      .order('created_time', { ascending: false })
      .order('review_id', { ascending: true })
      .range(page * ANALYSIS_PAGE, (page + 1) * ANALYSIS_PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < ANALYSIS_PAGE) break;
  }
  return rows;
}

/* Cuántas reseñas leídas tienen texto y cuántas no: lo que dice «N de M
 * analizadas» y explica por qué una reseña de sólo estrellas no tiene tono.
 * Sale de google_reviews, que ven todos los planes. */
export async function fetchReviewTextCounts(organizationId) {
  const org = requireOrg(organizationId);
  const [all, withText] = await Promise.all([
    supabase.from('google_reviews').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    supabase.from('google_reviews').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .not('comment', 'is', null).neq('comment', ''),
  ]);
  if (all.error) throw all.error;
  if (withText.error) throw withText.error;
  return { total: all.count ?? 0, withText: withText.count ?? 0 };
}

/* ─── Métricas (fase 4.6, 0029) ───────────────────────────────────────────── */

/* Una fila por (día, ficha vinculada) entre dos días 'YYYY-MM-DD'. Pasa por la
 * RPC y no por la tabla: google_daily_metrics no tiene select directo, y la RPC
 * devuelve el desglose por plataforma en null si la organización no es Business. */
export async function fetchGoogleMetrics(organizationId, from, to) {
  const { data, error } = await supabase.rpc('google_metrics_daily', {
    p_org: requireOrg(organizationId),
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

/* Los últimos 12 meses cerrados ('YYYY-MM-01'), del más nuevo al más viejo: el
 * mes en curso Google todavía no lo publica. La primera lectura de una ficha
 * trae 12. */
export function closedMonthOptions(now = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i - 1, 1));
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { value: d.toISOString().slice(0, 10), label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

/* El mes anterior a 'YYYY-MM-01'. */
export function previousMonth(month) {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/* Palabras de búsqueda de un mes ('YYYY-MM-01'), de mayor a menor. Business: en
 * gratis el RLS devuelve vacío (0029). Con `locationId`, sólo esa sucursal; sin
 * él, se suman las de todas las fichas por término. */
export async function fetchSearchKeywords(organizationId, month, locationId = null) {
  let query = supabase
    .from('google_search_keywords')
    .select('keyword, impressions, threshold, google_locations!inner(location_id)')
    .eq('organization_id', requireOrg(organizationId))
    .eq('month', month);
  if (locationId) query = query.eq('google_locations.location_id', locationId);

  const { data, error } = await query;
  if (error) throw error;

  // El mismo término en dos fichas se suma. Si alguna parte es un «menos de N»,
  // el total también lo es: la suma de las cotas es una cota, no un número.
  const byKeyword = new Map();
  for (const row of data ?? []) {
    const prev = byKeyword.get(row.keyword);
    if (!prev) {
      byKeyword.set(row.keyword, { keyword: row.keyword, impressions: row.impressions, threshold: row.threshold });
    } else if (prev.impressions != null && row.impressions != null) {
      prev.impressions += row.impressions;
    } else {
      prev.threshold = (prev.impressions ?? prev.threshold) + (row.impressions ?? row.threshold);
      prev.impressions = null;
    }
  }
  return [...byKeyword.values()].sort(
    (a, b) => (b.impressions ?? b.threshold ?? 0) - (a.impressions ?? a.threshold ?? 0)
  );
}

/* ─── SEO Local: Análisis SEO (fase 4.8) ──────────────────────────────────── */

/* El análisis de cada ficha vinculada que el usuario puede ver, calculado en el
 * API sobre la ficha en vivo (services/api/lib/seoAudit.js):
 * { isBusiness, locations: [{ googleLocationId, locationId, name, mapsUri,
 *   audit: { score, level, best, worst, categories }, missingSearchTerms }] }.
 * El API guarda la lectura de Google 10 minutos; `fresh` la vuelve a pedir. */
export async function fetchSeoAudit(organizationId, { fresh = false } = {}) {
  const params = new URLSearchParams({ org: requireOrg(organizationId) });
  if (fresh) params.set('fresh', '1');
  return apiFetch(
    `/api/google/seo?${params}`,
    { headers: await authHeaders() },
    'No pudimos analizar tu ficha'
  );
}

/* ─── Perfil y protección de ficha (fase 4.7, 0030) ───────────────────────── */

/* La ficha en vivo desde Google, vía API: { canEdit, profile, attributes }.
 * `googleLocationId` es el id de google_locations, no el de Google. */
export async function fetchGoogleProfile(googleLocationId) {
  return apiFetch(
    `/api/google/locations/${encodeURIComponent(googleLocationId)}/profile`,
    { headers: await authHeaders() },
    'No pudimos leer tu ficha de Google'
  );
}

/* Escribe en Google sólo lo que viene en `changes` (ver googleProfileUpdateSchema
 * en services/api/lib/validation.js). */
export async function updateGoogleProfile(googleLocationId, changes) {
  return apiFetch(
    `/api/google/locations/${encodeURIComponent(googleLocationId)}/profile`,
    { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify(changes) },
    'No pudimos guardar los cambios en Google'
  );
}

/* Cambios que Google hizo por su cuenta: todos los pendientes y, como historial,
 * los últimos `historySize` ya resueltos (revertidos, aceptados o que Google
 * retiró). Business: en gratis el RLS devuelve vacío. */
export async function fetchProfileChanges(organizationId, googleLocationId, { historySize = 10 } = {}) {
  const base = () => supabase
    .from('google_profile_changes')
    .select('id, status, detected_at, resolved_at, fields, google_values, owner_values')
    .eq('organization_id', requireOrg(organizationId))
    .eq('google_location_id', googleLocationId);

  const [pending, resolved] = await Promise.all([
    base().eq('status', 'pending').order('detected_at', { ascending: false }),
    base().neq('status', 'pending').order('resolved_at', { ascending: false, nullsFirst: false }).limit(historySize),
  ]);
  if (pending.error) throw pending.error;
  if (resolved.error) throw resolved.error;
  return { pending: pending.data ?? [], resolved: resolved.data ?? [] };
}

export async function resolveProfileChange(changeId, action) {
  return apiFetch(
    `/api/google/profile/changes/${encodeURIComponent(changeId)}/${action === 'revert' ? 'revert' : 'accept'}`,
    { method: 'POST', headers: await authHeaders() },
    action === 'revert' ? 'No pudimos deshacer el cambio' : 'No pudimos guardar tu respuesta'
  );
}

/* ─── Publicaciones (fase 4.7, 0031) ──────────────────────────────────────── */

export async function fetchGooglePosts(googleLocationId) {
  return apiFetch(
    `/api/google/locations/${encodeURIComponent(googleLocationId)}/posts`,
    { headers: await authHeaders() },
    'No pudimos leer tus publicaciones'
  );
}

export async function createGooglePost(googleLocationId, post) {
  return apiFetch(
    `/api/google/locations/${encodeURIComponent(googleLocationId)}/posts`,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify(post) },
    'Google no aceptó la publicación'
  );
}

export async function deleteGooglePost(googleLocationId, postName) {
  const params = new URLSearchParams({ name: postName });
  return apiFetch(
    `/api/google/locations/${encodeURIComponent(googleLocationId)}/posts?${params}`,
    { method: 'DELETE', headers: await authHeaders() },
    'No pudimos borrar la publicación'
  );
}

/* { usadas, limite } del mes. `limite` null = sin límite (Business). */
export async function fetchPostQuota(organizationId) {
  const { data, error } = await supabase.rpc('google_post_quota', { p_org: requireOrg(organizationId) });
  if (error) throw error;
  return data?.[0] ?? { usadas: 0, limite: 1 };
}

export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_IMAGE_TYPES = ['image/jpeg', 'image/png'];

/* Sube la foto a Storage (bucket público: Google la baja desde esa URL) y
 * devuelve la URL pública. Va a la carpeta de la organización, que es lo único
 * que el RLS del bucket deja escribir (0031). */
export async function uploadPostImage(organizationId, file) {
  const org = requireOrg(organizationId);
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${org}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('google-post-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('No pudimos subir la foto. Probá con otra.');
  return supabase.storage.from('google-post-media').getPublicUrl(path).data.publicUrl;
}

/* Lo que vuelve en ?google= después de pasar por Google (backToDashboard en
 * routes/google.js). Un código desconocido cae en `error`. */
export const GOOGLE_RESULT_MESSAGES = {
  conectado: { tone: 'ok', text: 'Listo, tu ficha de Google quedó conectada. Estamos leyendo tus reseñas.' },
  cancelado: { tone: 'info', text: 'Cancelaste la conexión con Google. Podés intentarlo de nuevo cuando quieras.' },
  sin_permiso: {
    tone: 'error',
    text: 'Google no nos dio permiso para leer tu ficha. Volvé a intentarlo y dejá marcada la casilla de Google Business Profile.',
  },
  sin_rol: { tone: 'error', text: 'Sólo un propietario o administrador de la cuenta puede conectar Google.' },
  error_estado: {
    tone: 'error',
    text: 'La conexión venció o se abrió en otro navegador. Volvé a tocar “Conectar” desde acá.',
  },
  error: { tone: 'error', text: 'No pudimos conectar tu ficha de Google. Probá de nuevo en unos minutos.' },
};

/* Estado de la conexión de la organización activa.
 *
 * Mientras la primera lectura corre en segundo plano (el callback la dispara
 * apenas se conecta), consulta cada 5 segundos hasta que termine — así la
 * pantalla pasa de "leyendo tu ficha" a "última lectura" sin recargar. Corta a
 * los 2 minutos: si para entonces no terminó, lo va a resolver el job diario.
 *
 * El último estado leído se recuerda por organización mientras la pestaña esté
 * abierta. Las secciones de Google deciden entre el modal y la pantalla real con
 * esto, y sin el recuerdo cada vez que se entraba a una se veía el modal medio
 * segundo antes de la pantalla. Se sigue releyendo al montar; lo recordado sólo
 * evita arrancar en blanco. */
const connectionCache = new Map();

export function useGoogleConnection(organizationId) {
  const cached = organizationId ? connectionCache.get(organizationId) : undefined;
  const [connection, setConnection] = useState(cached ?? null);
  const [loading, setLoading] = useState(Boolean(organizationId) && cached === undefined);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!organizationId) return;
    try {
      const next = await fetchGoogleConnection(organizationId);
      connectionCache.set(organizationId, next);
      setConnection(next);
      setFailed(false);
    } catch (err) {
      console.error('No se pudo leer el estado de la conexión con Google:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const firstSyncPending =
    connection?.status === 'active' && !connection.last_synced_at && !connection.last_error;

  useEffect(() => {
    if (!firstSyncPending) return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > 120_000) clearInterval(timer);
      else reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [firstSyncPending, reload]);

  return { connection, loading, failed, reload, firstSyncPending };
}

/* «Actualizar ahora» y la espera hasta que la lectura termine, sobre el
 * `google` que devuelve useGoogleConnection. Lo usan Gestión local (Fichas de
 * Google) y Reseñas.
 *
 * El API contesta 202 y lee en segundo plano; terminó cuando `last_synced_at`
 * avanza. Mientras tanto se relee la conexión cada 4 s, con un tope de un
 * minuto. `result` queda en 'done' o 'slow' para que cada pantalla diga lo suyo.
 *
 * `syncNow` tira el error del API (rol insuficiente, límite de pedidos, API
 * caído): lo muestra quien llama. */
export function useGoogleSyncRequest(google) {
  const { connection, reload } = google;
  const [waitingFrom, setWaitingFrom] = useState(null); // last_synced_at al pedir
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (waitingFrom === null) return undefined;
    if (connection?.last_synced_at && connection.last_synced_at !== waitingFrom) {
      setWaitingFrom(null);
      setResult('done');
      return undefined;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > 60_000) {
        clearInterval(timer);
        setWaitingFrom(null);
        setResult('slow');
      } else {
        reload();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [waitingFrom, connection?.last_synced_at, reload]);

  const syncNow = useCallback(async () => {
    setResult(null);
    await requestGoogleSync();
    setWaitingFrom(connection?.last_synced_at ?? '');
  }, [connection?.last_synced_at]);

  return { syncing: waitingFrom !== null, result, syncNow };
}
