import { supabase } from './supabase.js';
import { accessTokenForOrg } from './googleAccess.js';
import { isClaudeConfigured } from './claude.js';
import { writeReply } from './replyWriter.js';
import { publishReviewReply } from './replyPublisher.js';
import { isLocationAllowed } from './replyRules.js';

/* La cola de respuestas con IA que se publican solas (0037): la respuesta
 * automática y «responder reseñas anteriores». La corren:
 *   - scripts/run-auto-replies.js, desde el job diario y el de cada hora;
 *   - POST /api/automations/reply-past, en segundo plano, para la organización
 *     que lo pidió (runOrgInBackground);
 *   - routes/google.js, después de cada «Actualizar ahora» (runAfterSync, 0038).
 *
 * Todo lo que decide QUÉ se publica vive en SQL: enqueue_auto_replies() encola
 * (con el techo de 2.000 por organización y mes y la ventana de 7 días de la
 * 0038), claim_reply_jobs() toma lo vencido y vuelve a mirar que se pueda
 * publicar (sin respuesta, Business, regla prendida). Acá sólo se escribe y se
 * publica — salvo REPLY_ALLOWED_LOCATIONS (lib/replyRules.js), el seguro del
 * proyecto de pruebas, que saltea los locales que no están en la lista.
 *
 * ── El interruptor ───────────────────────────────────────────────────────────
 * Sólo con AI_AUTO_REPLY_PUBLISH=on se publica algo. Con cualquier otro valor
 * se encola (para que el contador de «en camino» sea real) pero no se toma
 * nada: los trabajos quedan pendientes y salen cuando se encienda. Está apagado
 * en producción hasta que Google apruebe la verificación de la app. Desde el 14
 * oct 2026 la política de privacidad (§3.1) y la justificación de Google ya
 * declaran las respuestas que publica una regla que activó el dueño, así que
 * encenderlo no obliga a reescribirlas.
 */

// Varias en paralelo, pocas: cada una es una llamada a Claude y otra a Google,
// y la cuota de Google es compartida entre todas las organizaciones.
const CONCURRENCY = 3;
const DEFAULT_LIMIT = 100;

export function isPublishEnabled() {
  return process.env.AI_AUTO_REPLY_PUBLISH === 'on';
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function finish(jobId, status, message = null) {
  const { error } = await supabase.rpc('finish_reply_job', { p_job: jobId, p_status: status, p_error: message });
  if (error) console.error(`No se pudo cerrar el trabajo ${jobId}:`, error.message);
}

/* Un token por organización y por corrida. Si la conexión no sirve, todas las
   reseñas de esa organización fallan con el mismo motivo sin volver a pedirlo. */
function tokenCache() {
  const tokens = new Map();
  return (orgId) => {
    if (!tokens.has(orgId)) tokens.set(orgId, accessTokenForOrg(orgId));
    return tokens.get(orgId);
  };
}

async function processJob(job, tokenFor, log) {
  const rows = await rpc('review_reply_job_target', { p_review: job.review_id });
  const review = rows?.[0];
  if (!review) return finish(job.job_id, 'skipped', 'ficha_desvinculada');
  if (review.has_reply) return finish(job.job_id, 'skipped', 'ya_respondida');
  if (!isLocationAllowed(review.location_id)) {
    log(`  · ${job.review_id}: local fuera de REPLY_ALLOWED_LOCATIONS, salteada`);
    return finish(job.job_id, 'skipped', 'fuera_de_REPLY_ALLOWED_LOCATIONS');
  }

  // El token antes que Claude: con la conexión vencida no se paga un texto que
  // no se va a poder publicar.
  const accessToken = await tokenFor(review.organization_id);
  const contextRows = await rpc('review_reply_writer_context', {
    p_org: review.organization_id,
    p_location: review.location_id,
    p_stars: review.star_rating,
  });
  const text = await writeReply({ review, context: contextRows?.[0] ?? {} });

  await publishReviewReply({
    reviewId: job.review_id,
    target: review,
    comment: text,
    userId: job.created_by ?? null,
    source: job.source,
    accessToken,
  });
  await finish(job.job_id, 'done');
  log(`  ✓ ${job.source} · reseña ${job.review_id}`);
}

/* orgId: sólo esa organización. enqueue: false para no correr la búsqueda de
 * automáticas (la usa reply-past, que ya encoló lo suyo). */
export async function runAutoReplies({ orgId = null, dryRun = false, enqueue = true, limit = DEFAULT_LIMIT, log = console.log } = {}) {
  const summary = { enqueued: 0, published: 0, failed: 0, pending: 0, publishing: false };

  if (enqueue && !dryRun) {
    summary.enqueued = await rpc('enqueue_auto_replies');
    if (summary.enqueued) log(`  ${summary.enqueued} reseña(s) nuevas en la cola de respuestas automáticas`);
  }

  if (dryRun || !isPublishEnabled() || !isClaudeConfigured()) {
    const pending = (await rpc('pending_reply_jobs', { p_org: orgId })) ?? [];
    summary.pending = pending.reduce((n, row) => n + row.due + row.waiting, 0);
    const why = dryRun
      ? 'simulacro'
      : !isClaudeConfigured()
        ? 'falta ANTHROPIC_API_KEY'
        : 'AI_AUTO_REPLY_PUBLISH no está en "on"';
    log(`  Publicación apagada (${why}): ${summary.pending} respuesta(s) esperando en la cola.`);
    for (const row of pending) {
      log(`    ${row.organization_id} · ${row.source}: ${row.due} vencida(s), ${row.waiting} con retardo`);
    }
    return summary;
  }

  summary.publishing = true;
  const jobs = (await rpc('claim_reply_jobs', { p_limit: limit, p_org: orgId })) ?? [];
  if (!jobs.length) return summary;
  log(`  Publicando ${jobs.length} respuesta(s) con IA…`);

  const tokenFor = tokenCache();
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        await processJob(job, tokenFor, log);
        summary.published += 1;
      } catch (err) {
        summary.failed += 1;
        log(`  ✗ reseña ${job.review_id}: ${err.message}`);
        await finish(job.job_id, 'failed', err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return summary;
}

/* Para «responder reseñas anteriores»: publica la cola de esa organización en
 * segundo plano, con la respuesta HTTP ya enviada. Una a la vez por
 * organización en este proceso (como runSync en routes/google.js). Si el
 * proceso se reinicia en el medio, lo que quedó lo toma la próxima corrida del
 * cron: claim_reply_jobs() recupera los trabajos colgados. */
const running = new Set();

export function runOrgInBackground(orgId) {
  if (!isPublishEnabled() || running.has(orgId)) return false;
  running.add(orgId);
  const log = (line) => console.log(`[respuestas ${orgId}] ${line.trim()}`);
  runAutoReplies({ orgId, enqueue: false, limit: 200, log })
    .catch((err) => console.error(`Respuestas con IA fallaron para ${orgId}:`, err.message))
    .finally(() => running.delete(orgId));
  return true;
}

/* Después de «Actualizar ahora» (runSync en routes/google.js): las reseñas que
 * acaban de entrar y que una regla manda responder se encolan y, con la
 * publicación encendida, salen ya en vez de esperar al cron horario. Nunca
 * tira: un problema acá no es un problema de la sincronización. Encolar mira
 * todas las organizaciones (enqueue_auto_replies() no recibe una); publicar,
 * sólo ésta. */
export async function runAfterSync(orgId, log = console.log) {
  if (running.has(orgId)) return;
  running.add(orgId);
  try {
    await runAutoReplies({ orgId, log });
  } catch (err) {
    console.error(`Respuestas automáticas después del sync fallaron para ${orgId}:`, err.message);
  } finally {
    running.delete(orgId);
  }
}
