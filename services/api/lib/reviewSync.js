import { supabase } from './supabase.js';
import {
  listAccounts,
  listLocations,
  listReviewsPage,
  starRatingToNumber,
  formatAddress,
} from './googleBusiness.js';

/* Fichas y reseñas: la parte de la lectura diaria que viene desde la fase 4.3.
 * El access token lo consigue lib/googleSync.js, que además lee las métricas.
 *
 *   1. (googleSync) refresh token → access token
 *   2. Account Management: qué cuentas administra quien conectó
 *   3. Business Information: qué fichas tiene cada cuenta → google_locations
 *   4. Poda + vinculación automática ficha → sucursal por place_id
 *   5. My Business v4: reseñas, incrementales → google_reviews
 *   6. Snapshot del total de la ficha → location_review_snapshots, que es lo
 *      que alimenta review_deltas
 *
 * Los pasos 5 y 6 corren SÓLO para las fichas vinculadas a una sucursal (0025).
 * El usuario de Google que conecta puede administrar fichas que no son de esta
 * organización —el caso real fue la ficha de un cliente en la misma cuenta—, y
 * de esas no tenemos por qué guardar reseñas con nombre y texto de terceros. De
 * una ficha sin vincular queda nombre, dirección y place_id: lo justo para
 * ofrecerla cuando el cliente elige cuál es suya.
 *
 * Lo llama lib/googleSync.js, que usan scripts/sync-google.js (todas las
 * organizaciones) y routes/google.js (la que acaba de conectar, o «Actualizar
 * ahora», para que el panel no espere a mañana).
 *
 * Una ficha que falla no frena a las demás: se anota y se sigue.
 */

const UPSERT_CHUNK = 200;

function toRating(value) {
  const n = Number(value);
  // average_rating tiene check between 1 and 5; una ficha sin reseñas viene
  // con 0 o sin el campo, y eso es "sin puntaje", no un puntaje de 0.
  return Number.isFinite(n) && n >= 1 ? Math.round(n * 10) / 10 : null;
}

async function upsertInChunks(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict });
    if (error) throw error;
  }
}

/* Reseñas nuevas o editadas desde la última corrida. La API las devuelve de la
 * más recientemente actualizada para atrás, así que se pagina hasta cruzar la
 * más nueva que ya está guardada. La primera vez no hay marca de agua y se trae
 * todo el historial (50 por página): una ficha con 2.000 reseñas son 40
 * llamadas, una sola vez. */
async function syncLocationReviews(accessToken, organizationId, gl, watermark) {
  let pageToken = null;
  let first = null;
  const rows = [];

  pages: do {
    const page = await listReviewsPage(accessToken, gl.google_account, gl.google_location, pageToken);
    first ??= page;

    for (const review of page.reviews ?? []) {
      // `<` y no `<=`: una reseña editada en el mismo instante que la marca se
      // vuelve a escribir (upsert, inofensivo) en vez de perderse.
      if (watermark && new Date(review.updateTime) < watermark) break pages;

      rows.push({
        organization_id: organizationId,
        google_location_id: gl.id,
        review_id: review.reviewId,
        reviewer_name: review.reviewer?.isAnonymous ? null : review.reviewer?.displayName ?? null,
        is_anonymous: Boolean(review.reviewer?.isAnonymous),
        star_rating: starRatingToNumber(review.starRating),
        comment: review.comment ?? null,
        created_time: review.createTime,
        updated_time: review.updateTime,
        reply_comment: review.reviewReply?.comment ?? null,
        reply_updated_time: review.reviewReply?.updateTime ?? null,
        fetched_at: new Date().toISOString(),
      });
    }
    pageToken = page.nextPageToken || null;
  } while (pageToken);

  const total = Number(first?.totalReviewCount ?? 0);
  const rating = toRating(first?.averageRating);

  if (rows.length) await upsertInChunks('google_reviews', rows, 'google_location_id,review_id');

  const { error } = await supabase
    .from('google_locations')
    .update({ total_reviews: total, average_rating: rating, reviews_synced_at: new Date().toISOString() })
    .eq('id', gl.id);
  if (error) throw error;

  // Sólo llegan acá fichas vinculadas; el RPC igual vuelve a comprobar que la
  // sucursal siga viva y devuelve false si no.
  const { data: snapshot, error: snapshotError } = await supabase.rpc('record_google_review_snapshot', {
    p_google_location_id: gl.id,
    p_total_reviews: total,
    p_average_rating: rating,
    p_raw: { totalReviewCount: first?.totalReviewCount ?? null, averageRating: first?.averageRating ?? null },
  });
  if (snapshotError) throw snapshotError;

  return { newOrUpdated: rows.length, total, rating, snapshot: Boolean(snapshot) };
}

/* Devuelve el resumen y, en `linkedLocations`, las fichas vinculadas de esta
 * corrida ({ id, google_account, google_location, title, location_id }): son
 * las mismas sobre las que googleSync lee las métricas. */
export async function syncReviews(accessToken, organizationId, { dryRun = false, log = console.log } = {}) {
  // --- Cuentas y fichas -----------------------------------------------------
  const accounts = await listAccounts(accessToken);

  // Una misma ficha puede aparecer en dos cuentas (la personal y un grupo). Se
  // queda la primera: cualquiera de las dos sirve para leer las reseñas.
  const byLocation = new Map();
  for (const account of accounts) {
    for (const location of await listLocations(accessToken, account.name)) {
      if (!byLocation.has(location.name)) byLocation.set(location.name, { account: account.name, location });
    }
  }

  log(`  ${accounts.length} cuenta(s), ${byLocation.size} ficha(s) en Google`);

  const now = new Date().toISOString();
  const locationRows = [...byLocation.values()].map(({ account, location }) => ({
    organization_id: organizationId,
    google_account: account,
    google_location: location.name,
    title: location.title ?? null,
    address: formatAddress(location.storefrontAddress),
    place_id: location.metadata?.placeId ?? null,
    maps_uri: location.metadata?.mapsUri ?? null,
    new_review_uri: location.metadata?.newReviewUri ?? null,
    last_seen_at: now,
  }));

  const empty = {
    accounts: accounts.length, locations: locationRows.length, linked: 0, reviews: 0, snapshots: 0, failures: 0,
    linkedLocations: [],
  };

  if (dryRun) {
    // El conteo del resumen sale de la misma predicción que se imprime arriba;
    // si no, el simulacro decía "se leerían sus reseñas" y "0 vinculada(s)" a la vez.
    return { ...empty, linked: await logDryRunPlan(organizationId, locationRows, log) };
  }
  if (!locationRows.length) return empty;

  await upsertInChunks('google_locations', locationRows, 'organization_id,google_location');

  // Primero la poda (suelta fichas de sucursales borradas, borra reseñas de las
  // sueltas) y después el autovínculo, que puede volver a usar una ficha recién
  // soltada con una sucursal nueva del mismo place_id.
  const { error: pruneError } = await supabase.rpc('google_prune_unlinked_reviews', { p_org: organizationId });
  if (pruneError) throw pruneError;

  const { data: autolinked, error: linkError } = await supabase.rpc('google_autolink_locations', {
    p_org: organizationId,
  });
  if (linkError) throw linkError;
  if (autolinked) log(`  ${autolinked} ficha(s) vinculada(s) por place_id`);

  // Sólo las que vinieron en ESTA corrida: una ficha que la cuenta ya no
  // administra queda en la tabla con su last_seen_at viejo, pero no se lee.
  const { data: glRows, error: glError } = await supabase
    .from('google_locations')
    .select('id, google_account, google_location, title, location_id')
    .eq('organization_id', organizationId)
    .in('google_location', locationRows.map((row) => row.google_location));
  if (glError) throw glError;

  // --- Reseñas, sólo de las fichas vinculadas ------------------------------
  const linkedRows = (glRows ?? []).filter((gl) => gl.location_id);
  for (const gl of (glRows ?? []).filter((row) => !row.location_id)) {
    log(`    · ${gl.title ?? gl.google_location}: sin sucursal vinculada — no se leen sus reseñas`);
  }

  let reviews = 0;
  let snapshots = 0;
  let failures = 0;

  for (const gl of linkedRows) {
    try {
      const { data: latest, error: latestError } = await supabase
        .from('google_reviews')
        .select('updated_time')
        .eq('google_location_id', gl.id)
        .order('updated_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;

      const result = await syncLocationReviews(
        accessToken,
        organizationId,
        gl,
        latest ? new Date(latest.updated_time) : null
      );
      reviews += result.newOrUpdated;
      if (result.snapshot) snapshots++;

      log(
        `    ✓ ${gl.title ?? gl.google_location}: ${result.total} reseña(s), ` +
        `${result.rating ?? '—'}★, ${result.newOrUpdated} nueva(s)/editada(s)`
      );
    } catch (err) {
      // Pasa con fichas sin verificar o suspendidas: la v4 no deja leer sus
      // reseñas. No es motivo para frenar las demás.
      failures++;
      log(`    ✗ ${gl.title ?? gl.google_location}: ${err.message}`);
    }
  }

  return {
    accounts: accounts.length,
    locations: locationRows.length,
    linked: linkedRows.length,
    reviews,
    snapshots,
    failures,
    linkedLocations: linkedRows,
  };
}

/* En el simulacro no se escribe nada, así que el autovínculo no corre: se
 * predice con lo que ya hay en la base (vínculos existentes y place_id de las
 * sucursales vivas) para decir de qué fichas se leerían reseñas. */
async function logDryRunPlan(organizationId, locationRows, log) {
  const [{ data: existing, error: e1 }, { data: sucursales, error: e2 }] = await Promise.all([
    supabase.from('google_locations').select('google_location, location_id').eq('organization_id', organizationId),
    supabase.from('locations').select('id, name, google_place_id').eq('organization_id', organizationId).is('deleted_at', null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const live = new Map((sucursales ?? []).map((l) => [l.id, l]));
  const byPlaceId = new Map((sucursales ?? []).filter((l) => l.google_place_id).map((l) => [l.google_place_id, l]));
  const linkedTo = new Map((existing ?? []).filter((g) => live.has(g.location_id)).map((g) => [g.google_location, live.get(g.location_id)]));

  let wouldRead = 0;
  for (const row of locationRows) {
    const sucursal = linkedTo.get(row.google_location) ?? (row.place_id ? byPlaceId.get(row.place_id) : null);
    if (sucursal) wouldRead++;
    log(
      `    · ${row.title ?? row.google_location} (${row.google_location}) place_id=${row.place_id ?? '—'} → ` +
      (sucursal ? `sucursal "${sucursal.name}": se leerían sus reseñas` : 'sin sucursal: no se leerían sus reseñas')
    );
  }
  return wouldRead;
}
