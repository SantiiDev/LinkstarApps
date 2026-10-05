import crypto from 'node:crypto';
import { PORT } from './config.js';
import { hasTokenKey } from './tokenCrypto.js';

/* OAuth 2.0 con Google para la Business Profile API.
 *
 * Sin SDK a propósito: son tres POST a endpoints estables (token, refresh,
 * revoke) y una URL armada a mano. googleapis pesa decenas de megas para eso.
 *
 * Las credenciales salen SÓLO de variables de entorno de este servicio. El
 * frontend nunca ve el client_secret ni los tokens: recibe una URL de Google
 * para navegar y, al volver, un ?google=conectado.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// Único scope que hace falta: lee cuentas, fichas y reseñas (y en el futuro
// permite responderlas). Es el que está cargado en la pantalla de
// consentimiento; pedir otro que no esté ahí hace que Google rechace el flujo.
export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || null;
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || null;

export function isGoogleConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI && hasTokenKey());
}

if (!isGoogleConfigured()) {
  console.warn(
    '⚠️  Integración con Google deshabilitada: faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ' +
    'GOOGLE_REDIRECT_URI o GOOGLE_TOKEN_ENC_KEY. /api/google/* va a responder 503. ' +
    'Ver services/api/.env.example.'
  );
} else {
  // El redirect URI se registra en la consola de Google con puerto y todo. Si
  // apunta a localhost en un puerto donde este servicio no escucha, Google
  // devuelve el código a la nada y el error que se ve es "no se puede acceder
  // al sitio", que no dice nada de OAuth.
  const local = GOOGLE_REDIRECT_URI.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d+))?\//i);
  if (local && String(local[1] || '80') !== String(PORT)) {
    console.warn(
      `⚠️  GOOGLE_REDIRECT_URI usa el puerto ${local[1] || '80'} pero este servicio escucha en ${PORT}. ` +
      'El callback de Google no va a llegar. Igualá los dos (y la URI registrada en la consola de Google).'
    );
  }
}

export function assertGoogleConfigured() {
  if (!isGoogleConfigured()) {
    const err = new Error('La integración con Google no está configurada en el servidor');
    err.status = 503;
    throw err;
  }
}

// La cookie del state sólo puede ser Secure si el callback es https. En
// http://localhost un navegador que no trate localhost como seguro la
// descartaría y el flujo fallaría siempre en el paso final.
export function isSecureCallback() {
  return /^https:\/\//i.test(GOOGLE_REDIRECT_URI || '');
}

/* PKCE (RFC 7636). Con client_secret no es obligatorio, pero Google lo acepta
 * en clientes web y cierra la inyección de un código robado: sin el verifier,
 * que nunca sale del servidor, el código no se puede canjear. */
export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthUrl({ state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GBP_SCOPE,
    // offline: sin esto no hay refresh token y el job diario no puede leer nada
    // cuando el cliente no está mirando.
    access_type: 'offline',
    // consent: Google sólo emite refresh token la PRIMERA vez que alguien
    // autoriza. Si se reconecta (porque venció, o porque lo desconectó y vuelve)
    // sin forzar el consentimiento, vuelve sin refresh token.
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params}`;
}

async function postForm(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

/* Errores de Google con `code` y sin el cuerpo crudo en el mensaje: el mensaje
 * puede terminar en un log o en google_connections.last_error. */
function googleOAuthError(step, response, data) {
  const err = new Error(`Google OAuth (${step}) respondió ${response.status}: ${data.error || 'error'}`);
  err.code = data.error || null;
  err.httpStatus = response.status;
  return err;
}

export async function exchangeCode({ code, codeVerifier }) {
  const { response, data } = await postForm(TOKEN_URL, {
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  if (!response.ok) throw googleOAuthError('token', response, data);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    scopes: String(data.scope || '').split(' ').filter(Boolean),
    expiresIn: data.expires_in,
  };
}

/* Un access token nuevo a partir del refresh token guardado. Duran una hora;
 * el job pide uno por organización por corrida y no los guarda.
 *
 * `invalid_grant` es el error que importa: el refresh token ya no sirve
 * (revocado, contraseña cambiada, o los 7 días del modo Testing). Quien llama
 * lo distingue por err.code para marcar la conexión como 'needs_reauth'. */
export async function refreshAccessToken(refreshToken) {
  const { response, data } = await postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  if (!response.ok) throw googleOAuthError('refresh', response, data);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/* Revoca el token en Google. Best-effort: si falla (ya estaba revocado, Google
 * no responde), la desconexión local sigue igual — lo que el cliente pidió es
 * que dejemos de leer su ficha, y borrar el token ya lo garantiza. */
export async function revokeToken(token) {
  try {
    const { response } = await postForm(REVOKE_URL, { token });
    return response.ok;
  } catch {
    return false;
  }
}
