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
    throw new Error('El servicio no está disponible en este momento. Probá de nuevo más tarde.');
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

/* Los filtros son por ESTRELLAS, no por sentimiento: decir "positiva" de una
 * reseña de 4★ es leer el puntaje que puso el cliente, no adivinar. El
 * sentimiento del texto existe desde la fase 5 (0033), pero es de Business y
 * vive en Reportes; esta pantalla es de todos los planes. */
export const REVIEW_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'positive', label: 'Positivas (4–5★)' },
  { id: 'neutral', label: 'Neutras (3★)' },
  { id: 'negative', label: 'Negativas (1–2★)' },
  { id: 'pending', label: 'Sin responder' },
];

/* Una página de reseñas, filtrada del lado de la base: con paginación, filtrar
 * en el cliente sólo filtraría lo que ya se cargó. */
export async function fetchReviews(organizationId, { filter = 'all', locationId = null, search = '', from = 0 } = {}) {
  // `!inner` sobre google_locations: el filtro por sucursal va sobre la tabla
  // embebida, y sin inner PostgREST devolvería las reseñas con el embed en null
  // en vez de excluirlas.
  let query = supabase
    .from('google_reviews')
    .select(
      'id, reviewer_name, is_anonymous, star_rating, comment, created_time, updated_time, reply_comment, reply_updated_time, ' +
      'google_locations!inner(id, title, maps_uri, location_id, locations(name))'
    )
    .eq('organization_id', requireOrg(organizationId))
    .order('created_time', { ascending: false })
    .range(from, from + REVIEWS_PAGE_SIZE - 1);

  if (filter === 'positive') query = query.gte('star_rating', 4);
  if (filter === 'neutral') query = query.eq('star_rating', 3);
  if (filter === 'negative') query = query.lte('star_rating', 2);
  if (filter === 'pending') query = query.is('reply_comment', null);
  if (locationId) query = query.eq('google_locations.location_id', locationId);

  const term = search.trim().replace(/[%,()]/g, ' ');
  if (term) query = query.or(`reviewer_name.ilike.%${term}%,comment.ilike.%${term}%`);

  const { data, error } = await query;
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

/* Cambios que Google hizo por su cuenta y siguen pendientes. Business: en
 * gratis el RLS devuelve vacío. */
export async function fetchProfileChanges(organizationId, googleLocationId) {
  const { data, error } = await supabase
    .from('google_profile_changes')
    .select('id, google_location_id, detected_at, fields, google_values, owner_values')
    .eq('organization_id', requireOrg(organizationId))
    .eq('google_location_id', googleLocationId)
    .eq('status', 'pending')
    .order('detected_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
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
 * los 2 minutos: si para entonces no terminó, lo va a resolver el job diario. */
export function useGoogleConnection(organizationId) {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(Boolean(organizationId));
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!organizationId) return;
    try {
      setConnection(await fetchGoogleConnection(organizationId));
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
