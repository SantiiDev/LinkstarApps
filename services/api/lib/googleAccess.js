import { supabase } from './supabase.js';
import { refreshAccessToken } from './googleOAuth.js';
import { decryptToken } from './tokenCrypto.js';

/* Access token de Google para una organización, para las rutas que escriben en
 * su ficha (Perfil, Publicaciones). Sale de la misma RPC que usa el job
 * (google_sync_targets, 0024): una conexión en needs_reauth o sin plan vigente
 * no aparece, y eso es lo correcto — su token no sirve.
 *
 * Errores con `status`, para que la ruta los devuelva tal cual:
 *   409 no hay conexión utilizable, o Google la revocó (invalid_grant). */
export async function accessTokenForOrg(organizationId) {
  const { data, error } = await supabase.rpc('google_sync_targets');
  if (error) throw error;
  const target = (data ?? []).find((t) => t.organization_id === organizationId);
  if (!target) {
    const err = new Error('Hay que volver a conectar tu ficha de Google');
    err.status = 409;
    throw err;
  }

  try {
    const refreshToken = decryptToken(target.refresh_token_enc, target.key_id, target.organization_id);
    const { accessToken } = await refreshAccessToken(refreshToken);
    return accessToken;
  } catch (err) {
    if (err.code === 'invalid_grant') {
      const reauth = new Error('Google revocó el acceso. Volvé a conectar tu ficha.');
      reauth.status = 409;
      throw reauth;
    }
    throw err;
  }
}
