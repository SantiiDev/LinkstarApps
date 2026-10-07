import { refreshAccessToken } from './googleOAuth.js';
import { decryptToken } from './tokenCrypto.js';
import { syncReviews } from './reviewSync.js';
import { syncMetrics } from './metricsSync.js';
import { checkProfileChanges } from './profileProtection.js';

/* La lectura de Google de una organización, entera: lo que corre el job diario
 * (scripts/sync-google.js) y lo que dispara el panel al conectar o con
 * «Actualizar ahora» (routes/google.js).
 *
 *   1. refresh token → access token, UNA vez (dura una hora; no se guarda)
 *   2. fichas y reseñas          lib/reviewSync.js
 *   3. métricas y búsquedas      lib/metricsSync.js
 *   4. protección de ficha       lib/profileProtection.js (sólo Business)
 *
 * Los pasos 3 y 4 trabajan sobre las fichas vinculadas que devolvió el paso 2,
 * así nunca discrepan sobre qué fichas son de esta organización.
 *
 * Errores: si no hay access token (invalid_grant y compañía) se propaga — sin eso
 * no hay nada que leer, y quien llama marca la conexión. Una ficha que falla en
 * reseñas o en métricas se cuenta en `failures` y no frena al resto.
 */
export async function syncGoogleOrganization(target, { dryRun = false, log = console.log } = {}) {
  const { organization_id: organizationId, refresh_token_enc: refreshTokenEnc, key_id: keyId } = target;

  const refreshToken = decryptToken(refreshTokenEnc, keyId, organizationId);
  const { accessToken } = await refreshAccessToken(refreshToken);

  const reviews = await syncReviews(accessToken, organizationId, { dryRun, log });
  const metrics = await syncMetrics(accessToken, organizationId, reviews.linkedLocations, { dryRun, log });
  const protection = await checkProfileChanges(accessToken, organizationId, reviews.linkedLocations, { dryRun, log });

  return {
    ...reviews,
    metricDays: metrics.days,
    keywords: metrics.keywords,
    profileChanges: protection.changes,
    failures: reviews.failures + metrics.failures + protection.failures,
  };
}
