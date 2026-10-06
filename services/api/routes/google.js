import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { DASHBOARD_URL } from '../lib/config.js';
import {
  assertGoogleConfigured,
  buildAuthUrl,
  createPkcePair,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  isSecureCallback,
  GBP_SCOPE,
} from '../lib/googleOAuth.js';
import { encryptToken, decryptToken } from '../lib/tokenCrypto.js';
import { syncOrganization } from '../lib/reviewSync.js';
import { putReviewReply } from '../lib/googleBusiness.js';

const router = Router();

/* Conexión de la ficha de Google Business Profile de una organización.
 *
 *   POST /api/google/oauth/start   (con sesión) → { url } de Google + cookie
 *   GET  /auth/google/callback     (Google redirige acá) → canjea el código,
 *                                  guarda el refresh token cifrado, vuelve al
 *                                  panel con ?google=<resultado>
 *   POST /api/google/disconnect    (con sesión) → revoca y borra
 *   POST /api/google/sync          (con sesión) → vuelve a leer la cuenta (202)
 *   POST /api/google/reviews/:id/reply (con sesión) → responde una reseña
 *
 * ── Por qué el inicio es un POST que devuelve la URL ─────────────────────────
 * El panel autentica con un JWT en `Authorization: Bearer`, que una navegación
 * del navegador no puede mandar. Entonces el panel hace un fetch autenticado,
 * recibe la URL de Google y navega él (window.location.assign).
 *
 * ── El state, y por qué además hay una cookie ───────────────────────────────
 * El ataque que cierra el state es el "CSRF de login" de OAuth: alguien inicia
 * el flujo con SU organización y le hace abrir la URL de Google a la víctima;
 * la víctima autoriza con SU cuenta de Google y su ficha queda conectada a la
 * organización del atacante, que pasa a leer —y con business.manage, a
 * responder— sus reseñas. Que el state exista en la base no alcanza para
 * evitarlo: el del atacante también existe. Lo que lo evita es exigir que el
 * navegador que vuelve de Google sea el MISMO que inició el flujo. Por eso el
 * state se guarda también en una cookie HttpOnly del dominio del API, y el
 * callback exige que coincidan.
 *
 * La cookie se setea desde un fetch cross-origin (panel → API), lo que sólo
 * funciona porque panel y API son el mismo *sitio* (app.linkstarapp.com y
 * api.linkstarapp.com; en local, localhost:5173 y localhost:3001), con
 * `credentials: 'include'` del lado del panel y `credentials: true` en el CORS
 * de server.js. SameSite=Lax alcanza: la vuelta desde Google es una navegación
 * GET de nivel superior, y Lax manda la cookie en ese caso.
 *
 * Encima de eso: el state es de un solo uso y vence a los 10 minutos
 * (google_oauth_consume, 0024), y el código va atado a un PKCE verifier que
 * nunca sale del servidor.
 */

const COOKIE_NAME = 'ls_google_oauth';
const COOKIE_PATH = '/auth/google';
const COOKIE_MAX_AGE_S = 10 * 60;

// A dónde vuelve el navegador después de Google. La sección de reseñas es
// donde vive el botón de conectar.
const RETURN_PATH = '/panel/resenas';

// Iniciar el flujo es barato para nosotros pero escribe en la base; nadie
// conecta su ficha veinte veces en un cuarto de hora.
const startLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// El callback es público (lo llama el navegador del cliente, sin sesión). El
// límite es para que no sirva de oráculo de states.
const callbackLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Códigos que levantan las RPC de 0024 → status y texto para el usuario.
const RPC_ERRORS = {
  sin_organizacion: [409, 'Primero creá tu organización'],
  rol_insuficiente: [403, 'Sólo un propietario o administrador puede conectar Google'],
  sin_acceso: [402, 'Tu plan no está activo'],
  resena_inexistente: [404, 'No encontramos esa reseña. Puede que su ficha ya no esté vinculada'],
};

// `overrides` cambia el texto de un código para una ruta puntual: el mismo
// 'rol_insuficiente' significa "no podés conectar Google" en una y "no podés
// responder esta reseña" en otra.
function rpcError(error, overrides = {}) {
  const map = { ...RPC_ERRORS, ...overrides };
  const known = Object.entries(map).find(([code]) => error?.message?.includes(code));
  if (!known) return error;
  const err = new Error(known[1][1]);
  err.status = known[1][0];
  return err;
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function cookieAttributes(maxAge) {
  return [
    `Path=${COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(isSecureCallback() ? ['Secure'] : []),
  ].join('; ');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/* El callback nunca muestra un error crudo: siempre vuelve al panel con un
 * código corto que el panel traduce. El detalle va al log. */
function backToDashboard(res, result) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes(0)}`);
  const url = new URL(RETURN_PATH, DASHBOARD_URL);
  url.searchParams.set('google', result);
  res.redirect(302, url.toString());
}

// ──────────────────────────────────────────────────────────
// POST /api/google/oauth/start
// ──────────────────────────────────────────────────────────
router.post('/api/google/oauth/start', startLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();

    const state = crypto.randomBytes(32).toString('base64url');
    const { verifier, challenge } = createPkcePair();

    // Valida rol (owner/admin) y plan vigente, y registra el state. La
    // organización sale de la misma regla que usa el panel (active_org_id).
    const { error } = await supabase.rpc('google_oauth_begin', {
      p_user_id: req.user.id,
      p_state_hash: sha256(state),
      p_code_verifier: verifier,
    });
    if (error) throw rpcError(error);

    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${state}; ${cookieAttributes(COOKIE_MAX_AGE_S)}`);
    res.json({ url: buildAuthUrl({ state, codeChallenge: challenge }) });
  } catch (err) {
    // 503 también se devuelve tal cual: "no está configurado" no es un detalle
    // interno, y el panel necesita distinguirlo de una caída.
    if ((err.status && err.status < 500) || err.status === 503) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Error iniciando la conexión con Google:', err);
    res.status(500).json({ error: 'No se pudo iniciar la conexión con Google' });
  }
});

// ──────────────────────────────────────────────────────────
// GET /auth/google/callback?code=…&state=…   (o ?error=access_denied&state=…)
// ──────────────────────────────────────────────────────────
router.get('/auth/google/callback', callbackLimiter, async (req, res) => {
  const { code, state, error: googleError } = req.query;

  try {
    assertGoogleConfigured();

    const cookieState = readCookie(req, COOKIE_NAME);
    if (typeof state !== 'string' || !state || !cookieState || !safeEqual(state, cookieState)) {
      // Sin cookie: o pasaron más de 10 minutos, o el navegador que vuelve no
      // es el que inició el flujo. En los dos casos no se canjea nada.
      return backToDashboard(res, 'error_estado');
    }

    // Se consume ANTES de mirar si Google devolvió error: un state usado para
    // un "cancelar" tampoco tiene que poder reusarse.
    const { data: rows, error: consumeError } = await supabase.rpc('google_oauth_consume', {
      p_state_hash: sha256(state),
    });
    if (consumeError) throw consumeError;
    const pending = rows?.[0];
    if (!pending) return backToDashboard(res, 'error_estado');

    if (googleError) {
      // access_denied: el cliente tocó "Cancelar" en Google. No es un error
      // nuestro y no se loguea como tal.
      return backToDashboard(res, googleError === 'access_denied' ? 'cancelado' : 'error');
    }
    if (typeof code !== 'string' || !code) return backToDashboard(res, 'error');

    const tokens = await exchangeCode({ code, codeVerifier: pending.code_verifier });

    // Con consentimiento granular el cliente puede destildar el permiso. Sin
    // business.manage el token no sirve para nada de lo que lo queremos.
    if (!tokens.scopes.includes(GBP_SCOPE)) {
      if (tokens.refreshToken) await revokeToken(tokens.refreshToken);
      return backToDashboard(res, 'sin_permiso');
    }
    // Con prompt=consent siempre viene; si no vino, guardar la conexión sería
    // guardar algo que mañana no puede leer nada.
    if (!tokens.refreshToken) {
      console.error('Google no devolvió refresh_token (¿falta access_type=offline o prompt=consent?)');
      return backToDashboard(res, 'error');
    }

    const { ciphertext, keyId } = encryptToken(tokens.refreshToken, pending.organization_id);

    const { error: saveError } = await supabase.rpc('google_save_connection', {
      p_org: pending.organization_id,
      p_user_id: pending.user_id,
      p_refresh_token_enc: ciphertext,
      p_key_id: keyId,
      p_scopes: tokens.scopes,
    });
    if (saveError) {
      // A alguien le sacaron el admin entre el inicio y la vuelta: el token no
      // se guarda, y se revoca para no dejar un permiso huérfano en Google.
      await revokeToken(tokens.refreshToken);
      if (saveError.message?.includes('rol_insuficiente')) return backToDashboard(res, 'sin_rol');
      throw saveError;
    }

    console.log(`🔗 Google conectado para la organización ${pending.organization_id}`);
    backToDashboard(res, 'conectado');

    // Primera lectura en segundo plano, con la respuesta ya enviada: así el
    // panel muestra las fichas y reseñas en un minuto y no mañana. Si falla no
    // pasa nada grave — el job diario lo vuelve a intentar.
    runSync({ organization_id: pending.organization_id, refresh_token_enc: ciphertext, key_id: keyId });
  } catch (err) {
    console.error('Error en el callback de Google:', err);
    if (!res.headersSent) backToDashboard(res, 'error');
  }
});

/* Organizaciones con un sync corriendo en este proceso. Sin esto, tocar
 * "Actualizar ahora" dos veces —o vincular dos fichas seguidas— lanza dos
 * lecturas en paralelo de la misma cuenta: no rompen nada (todo es upsert), pero
 * gastan el doble de cuota de Google para el mismo resultado. Es en memoria a
 * propósito: el job diario corre en otro proceso y no compite con esto. */
const syncing = new Set();

/* Lectura en segundo plano, con la respuesta HTTP ya enviada. La usan el
 * callback (primera lectura al conectar) y POST /api/google/sync. Si falla no
 * pasa nada grave: queda anotado en google_connections y el job diario lo
 * vuelve a intentar. Devuelve false si ya había una corriendo. */
function runSync(target) {
  const organizationId = target.organization_id;
  if (syncing.has(organizationId)) return false;
  syncing.add(organizationId);

  (async () => {
    const log = (line) => console.log(`[google ${organizationId}] ${line.trim()}`);
    try {
      const summary = await syncOrganization(target, { log });
      await supabase.rpc('google_record_sync_result', {
        p_org: organizationId,
        p_ok: summary.failures === 0,
        p_error: summary.failures
          ? `No pudimos leer ${summary.failures} de tus fichas. Suele pasar con fichas sin verificar.`
          : null,
      });
      await supabase.rpc('compute_review_deltas', {});
      log(`sincronización: ${summary.locations} ficha(s), ${summary.linked} vinculada(s), ${summary.reviews} reseña(s)`);
    } catch (err) {
      console.error(`Sincronización de Google falló para ${organizationId}:`, err.message);
      const needsReauth = err.code === 'invalid_grant';
      await supabase.rpc('google_record_sync_result', {
        p_org: organizationId,
        p_ok: false,
        p_error: needsReauth
          ? 'Google revocó el acceso. Volvé a conectar tu ficha.'
          : 'No pudimos leer tu ficha todavía. Lo volvemos a intentar automáticamente.',
        p_needs_reauth: needsReauth,
      });
    } finally {
      syncing.delete(organizationId);
    }
  })();

  return true;
}

/* La conexión activa de una organización, con su token cifrado. Sale de la
 * misma RPC que usa el job diario: una conexión en needs_reauth o sin plan
 * vigente no aparece, y eso es lo correcto — su token no sirve. */
async function activeTarget(organizationId) {
  const { data, error } = await supabase.rpc('google_sync_targets');
  if (error) throw error;
  return (data ?? []).find((t) => t.organization_id === organizationId) ?? null;
}

// ──────────────────────────────────────────────────────────
// POST /api/google/disconnect
// Revoca el token en Google y borra la conexión. En cascada se van las fichas y
// las reseñas leídas; los snapshots diarios se quedan (son agregados nuestros).
// No exige plan vigente: alguien con el plan vencido tiene que poder cortarnos
// el acceso a su Google.
// ──────────────────────────────────────────────────────────
router.post('/api/google/disconnect', startLimiter, requireAuth(supabase), async (req, res) => {
  try {
    const { data: rows, error } = await supabase.rpc('google_connection_for_admin', {
      p_user_id: req.user.id,
    });
    if (error) throw rpcError(error);
    const connection = rows?.[0];

    if (connection?.refresh_token_enc) {
      try {
        const token = decryptToken(connection.refresh_token_enc, connection.key_id, connection.organization_id);
        await revokeToken(token);
      } catch (err) {
        // Sin la clave no se puede revocar en Google, pero borrar igual es lo
        // correcto: el cliente pidió que dejemos de leer, y sin token no leemos.
        console.error('No se pudo descifrar el token para revocarlo:', err.message);
      }
    }

    const { data: deleted, error: deleteError } = await supabase.rpc('google_delete_connection', {
      p_org: connection.organization_id,
      p_user_id: req.user.id,
    });
    if (deleteError) throw rpcError(deleteError);

    res.json({ disconnected: Boolean(deleted) });
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Error desconectando Google:', err);
    res.status(500).json({ error: 'No se pudo desconectar Google' });
  }
});

// Los dos que siguen hablan con Google en nombre del cliente: el límite cuida
// la cuota del proyecto, que es compartida entre todas las organizaciones.
const syncLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const replyLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ──────────────────────────────────────────────────────────
// POST /api/google/sync
// "Actualizar ahora": vuelve a leer la cuenta de Google de la organización en
// segundo plano y responde 202 de inmediato. Lo llama el panel al tocar el
// botón y después de cada cambio de vínculo ficha ↔ sucursal, para que las
// reseñas de una ficha recién vinculada aparezcan sin esperar al job diario.
// ──────────────────────────────────────────────────────────
router.post('/api/google/sync', syncLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();

    const { data: rows, error } = await supabase.rpc('google_connection_for_admin', {
      p_user_id: req.user.id,
    });
    if (error) throw rpcError(error, { rol_insuficiente: [403, 'Sólo un propietario o administrador puede actualizar la conexión'] });

    const organizationId = rows?.[0]?.organization_id;
    const target = organizationId ? await activeTarget(organizationId) : null;
    if (!target) {
      const err = new Error('No hay una ficha de Google conectada, o hay que volver a conectarla');
      err.status = 409;
      throw err;
    }

    const started = runSync(target);
    res.status(202).json({ started, alreadyRunning: !started });
  } catch (err) {
    if ((err.status && err.status < 500) || err.status === 503) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Error lanzando la sincronización de Google:', err);
    res.status(500).json({ error: 'No se pudo actualizar la conexión con Google' });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/google/reviews/:id/reply   { comment }
// Publica (o reemplaza) la respuesta del dueño en Google y, recién cuando Google
// la acepta, la registra en la base. Quién puede responder qué lo decide
// google_review_reply_target() (0026): owner/admin, o un manager en sus
// sucursales.
// ──────────────────────────────────────────────────────────
const MAX_REPLY_LENGTH = 4096; // límite de Google

router.post('/api/google/reviews/:id/reply', replyLimiter, requireAuth(supabase), async (req, res) => {
  try {
    assertGoogleConfigured();

    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (!comment || comment.length > MAX_REPLY_LENGTH) {
      const err = new Error(`La respuesta tiene que tener entre 1 y ${MAX_REPLY_LENGTH} caracteres`);
      err.status = 400;
      throw err;
    }
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
      const err = new Error('Reseña inválida');
      err.status = 400;
      throw err;
    }

    const { data: rows, error } = await supabase.rpc('google_review_reply_target', {
      p_user: req.user.id,
      p_review: req.params.id,
    });
    if (error) throw rpcError(error, { rol_insuficiente: [403, 'No tenés permiso para responder reseñas de esta sucursal'] });
    const review = rows?.[0];

    const target = await activeTarget(review.organization_id);
    if (!target) {
      const err = new Error('Hay que volver a conectar tu ficha de Google para poder responder');
      err.status = 409;
      throw err;
    }

    const refreshToken = decryptToken(target.refresh_token_enc, target.key_id, target.organization_id);
    const { accessToken } = await refreshAccessToken(refreshToken);
    const reply = await putReviewReply(
      accessToken,
      review.google_account,
      review.google_location,
      review.review_id,
      comment
    );

    const { error: recordError } = await supabase.rpc('google_record_reply', {
      p_review: req.params.id,
      p_user: req.user.id,
      p_comment: reply.comment,
      p_updated: reply.updateTime,
    });
    // La respuesta ya está publicada en Google. Si no se pudo registrar, se
    // avisa en el log pero no se le dice al usuario que falló: la próxima
    // lectura de la ficha la trae de Google igual.
    if (recordError) console.error('Respuesta publicada en Google pero no registrada:', recordError.message);

    res.json({ comment: reply.comment, updatedTime: reply.updateTime });
  } catch (err) {
    if ((err.status && err.status < 500) || err.status === 503) {
      return res.status(err.status).json({ error: err.message });
    }
    // invalid_grant al pedir el access token: la conexión ya no sirve.
    if (err.code === 'invalid_grant') {
      return res.status(409).json({ error: 'Google revocó el acceso. Volvé a conectar tu ficha.' });
    }
    // El detalle de Google (o de la base) sólo al log (CWE-209).
    console.error('Error respondiendo una reseña:', err);
    res.status(502).json({ error: 'Google no aceptó la respuesta. Probá de nuevo en unos minutos.' });
  }
});

export default router;
