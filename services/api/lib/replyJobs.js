import { supabase } from './supabase.js';
import { accessTokenForOrg } from './googleAccess.js';
import { putReviewReply } from './googleBusiness.js';
import { isClaudeConfigured } from './claude.js';
import { generateReply } from './replyWriter.js';
import { allowedLocations, jobDecision } from './replyRules.js';

export { allowedLocations, jobDecision };

/* La cola de respuestas con IA (0037): responder sin revisión las reseñas que
 * mandó a responder una regla automática ('auto') o el botón «Responder reseñas
 * anteriores» ('past').
 *
 * Quién la corre: el cron horario y el daily (scripts/sync-google.js, después de
 * leer cada organización), «Actualizar ahora» (runSync en routes/google.js) y
 * POST /api/automations/reply-past. Pueden coincidir —son procesos distintos—,
 * y no importa: el candado está en la base (review_reply_claim toma cada
 * trabajo una sola vez, y el índice único impide un segundo trabajo para la
 * misma reseña). El guard en memoria de cada proceso sólo evita trabajo de más.
 *
 * Por cada trabajo, justo antes de publicar se vuelve a mirar todo
 * (review_reply_context): si ya tiene respuesta, si la organización sigue en
 * Business, si la regla sigue activa. Lo que ya no corresponde se saltea.
 *
 * ── REPLY_ALLOWED_LOCATIONS ────────────────────────────────────────────────
 * Seguro para entornos de prueba: ids de `locations` separados por coma. Si
 * está cargada, la cola sólo publica en esos locales y saltea el resto. Existe
 * porque el proyecto de pruebas tiene vinculada la ficha real de un cliente
 * (Vineria Martu, ver CLAUDE.md): un «Responder anteriores» con «Todos los
 * locales» le publicaría respuestas en su Google. En producción queda vacía
 * (vacía = sin efecto); se puede quitar al salir a vender. No afecta el
 * borrador ni el «Publicar en Google» manual, que siempre los decide una
 * persona.
 */

const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 30;
const CONCURRENCY = 3;
const CLAIM_BATCH = 20;

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

/* Encola lo que mandan las reglas automáticas. Devuelve cuántos trabajos nuevos. */
export async function enqueueAutoReplies(organizationId = null) {
  return (await rpc('review_reply_enqueue_auto', { p_org: organizationId })) ?? 0;
}

async function finish(job, status, error = null, retryAt = null) {
  const { error: rpcError } = await supabase.rpc('review_reply_finish', {
    p_job: job.job_id,
    p_status: status,
    p_error: error,
    p_retry_at: retryAt,
  });
  if (rpcError) console.error(`No se pudo cerrar el trabajo ${job.job_id}:`, rpcError.message);
}

/* Un error que no tiene sentido reintentar. */
function isPermanent(err) {
  return err?.code === 'model_refusal' || err?.status === 400 || err?.httpStatus === 400 || err?.httpStatus === 404;
}

async function runJob(job, tokens, log) {
  const ctx = await rpc('review_reply_context', { p_review: job.review_id });
  const decision = jobDecision(ctx, job);
  if (!decision.publish) {
    await finish(job, 'skipped', decision.reason);
    return 'skipped';
  }

  let tokenPromise = tokens.get(job.organization_id);
  if (!tokenPromise) {
    tokenPromise = accessTokenForOrg(job.organization_id);
    tokens.set(job.organization_id, tokenPromise);
  }
  const accessToken = await tokenPromise;

  const text = await generateReply(ctx);
  const reply = await putReviewReply(
    accessToken,
    ctx.google.google_account,
    ctx.google.google_location,
    ctx.google.review_id,
    text
  );

  const { error: recordError } = await supabase.rpc('google_record_reply', {
    p_review: job.review_id,
    p_user: null,
    p_comment: reply.comment,
    p_updated: reply.updateTime,
    p_source: 'auto',
  });
  // Ya está publicada en Google: el trabajo está hecho aunque no se haya podido
  // anotar (la próxima lectura de la ficha trae la respuesta, sin origen).
  if (recordError) console.error('Respuesta automática publicada pero no registrada:', recordError.message);

  await finish(job, 'done');
  log(`    ✓ respondida ${job.review_id} (${job.source})`);
  return 'done';
}

async function handleJob(job, tokens, log) {
  try {
    return await runJob(job, tokens, log);
  } catch (err) {
    const last = job.attempts >= MAX_ATTEMPTS || isPermanent(err);
    const message = String(err?.message ?? err).slice(0, 300);
    console.error(`  ✗ trabajo ${job.job_id} (reseña ${job.review_id}): ${message}`);
    if (last) {
      await finish(job, 'failed', message);
      return 'failed';
    }
    await finish(job, 'pending', message, new Date(Date.now() + RETRY_MINUTES * 60_000).toISOString());
    return 'retry';
  }
}

/* Procesa trabajos vencidos hasta `limit` (de una organización, o de todas).
   Sin la clave de Claude no toma nada: los trabajos esperan en la cola. */
export async function processReplyJobs({ organizationId = null, limit = 200, log = console.log } = {}) {
  const summary = { done: 0, skipped: 0, failed: 0, retry: 0 };
  if (!isClaudeConfigured()) {
    log('  · respuestas con IA: sin ANTHROPIC_API_KEY, la cola espera');
    return summary;
  }

  const tokens = new Map();
  let taken = 0;
  while (taken < limit) {
    const jobs = await rpc('review_reply_claim', {
      p_limit: Math.min(CLAIM_BATCH, limit - taken),
      p_org: organizationId,
    });
    if (!jobs?.length) break;
    taken += jobs.length;

    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const result = await handleJob(job, tokens, log);
        summary[result] += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  }

  if (taken) {
    log(`  · respuestas con IA: ${summary.done} publicada(s), ${summary.skipped} salteada(s), ` +
      `${summary.retry} a reintentar, ${summary.failed} fallida(s)`);
  }
  return summary;
}

/* Encolar lo de las reglas y procesar, para una organización. Nunca tira: es
   un paso agregado al final de un sync, y no tiene que hacerlo fallar. */
export async function runAutoReplies(organizationId, { log = console.log } = {}) {
  try {
    const queued = await enqueueAutoReplies(organizationId);
    if (queued) log(`  · respuestas automáticas: ${queued} reseña(s) a la cola`);
    return await processReplyJobs({ organizationId, log });
  } catch (err) {
    // Sin la 0037 en esta base, o la base caída: se anota y se sigue.
    console.error(`Respuestas automáticas: no se pudieron procesar para ${organizationId}:`, err.message);
    return null;
  }
}
