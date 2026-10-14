import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { generateReply } from '../lib/replyWriter.js';
import { allowedLocations, enqueueAutoReplies, jobDecision, processReplyJobs } from '../lib/replyJobs.js';

/* reply-reviews — las respuestas con IA (0037) por separado.
 *
 *   node scripts/reply-reviews.js --org <uuid> --dry-run [--limit 5]
 *        escribe con Claude la respuesta de las últimas N reseñas SIN responder
 *        de esa organización y las imprime. No publica nada ni escribe la base.
 *   node scripts/reply-reviews.js --muestra "texto" [--estrellas 2] [--nombre Ana] [--email x@y.com]
 *        escribe la respuesta a una reseña inventada, sin tocar la base
 *   node scripts/reply-reviews.js [--org <uuid>]
 *        encola lo que manden las reglas automáticas y procesa la cola: PUBLICA
 *        en Google. Es lo mismo que hace sync-google después de cada lectura.
 *
 * Para probar sin riesgo: --dry-run o --muestra. Antes de procesar la cola en
 * el proyecto de pruebas, REPLY_ALLOWED_LOCATIONS tiene que tener el id del
 * local Linkstar (ver lib/replyJobs.js): ahí también está vinculada la ficha
 * real de un cliente.
 */

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function sample(text) {
  const stars = Number(argValue('--estrellas')) || 5;
  const ctx = {
    review: { stars, text: text || null, first_name: argValue('--nombre') },
    business: { name: argValue('--negocio') || 'Linkstar', city: 'Rosario' },
    kind: stars >= 4 ? 'positive' : 'critical',
    tone: null,
    contact_email: argValue('--email'),
  };
  console.log(await generateReply(ctx));
}

async function dryRun(organizationId, limit) {
  const { data: rows, error } = await supabase
    .from('google_reviews')
    .select('id')
    .eq('organization_id', organizationId)
    .is('reply_comment', null)
    .order('created_time', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!rows?.length) {
    console.log('No hay reseñas sin responder.');
    return;
  }

  const allowed = allowedLocations();
  for (const { id } of rows) {
    const { data: ctx, error: ctxError } = await supabase.rpc('review_reply_context', { p_review: id });
    if (ctxError) throw ctxError;
    if (!ctx) {
      console.log(`\n▸ ${id}: su ficha no está vinculada a un local, se saltea`);
      continue;
    }
    const decision = jobDecision(ctx, { source: 'past' }, allowed);
    console.log(`\n▸ ${ctx.review.stars}★ · ${ctx.business.name} · ${ctx.kind}` +
      `${ctx.tone ? ` · tono ${ctx.tone.kind}` : ' · sin tono'}` +
      `${decision.publish ? '' : ` · la cola la saltearía: ${decision.reason}`}`);
    console.log(`  Reseña: ${ctx.review.text ?? '(sólo estrellas)'}`);
    console.log(`  Respuesta:\n${(await generateReply(ctx)).replace(/^/gm, '    ')}`);
  }
}

async function main() {
  // Con --muestra nunca se sigue al modo que publica, aunque el texto venga
  // vacío (una reseña de sólo estrellas) o falte.
  if (process.argv.includes('--muestra')) {
    const text = argValue('--muestra');
    return sample(text && !text.startsWith('--') ? text : '');
  }

  const organizationId = argValue('--org');
  if (process.argv.includes('--dry-run')) {
    if (!organizationId) throw new Error('--dry-run necesita --org <uuid>');
    return dryRun(organizationId, Number(argValue('--limit')) || 5);
  }

  const allowed = allowedLocations();
  console.log(allowed
    ? `REPLY_ALLOWED_LOCATIONS: sólo se publica en ${[...allowed].join(', ')}`
    : 'REPLY_ALLOWED_LOCATIONS vacía: se publica en cualquier local con regla o pedido.');
  const queued = await enqueueAutoReplies(organizationId);
  console.log(`${queued} reseña(s) nuevas a la cola por las reglas automáticas.`);
  const summary = await processReplyJobs({ organizationId });
  if (summary.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Error con las respuestas con IA:', err.message || err);
  process.exit(1);
});
