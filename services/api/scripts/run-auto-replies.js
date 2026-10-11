import 'dotenv/config';
import { runAutoReplies } from '../lib/autoReplies.js';
import { writeReply } from '../lib/replyWriter.js';

/* run-auto-replies — la cola de respuestas con IA que se publican solas (0037).
 *
 *   node scripts/run-auto-replies.js                  encola las automáticas y publica lo vencido
 *   node scripts/run-auto-replies.js --org <uuid>     sólo una organización
 *   node scripts/run-auto-replies.js --limit 20       tope de publicaciones por corrida (default 100)
 *   node scripts/run-auto-replies.js --dry-run        no encola ni publica: cuenta lo que hay en la cola
 *   node scripts/run-auto-replies.js --muestra "texto" [--estrellas 2] [--nombre "Ana"]
 *                                    [--tono "tuteá"] [--firma "— Bar"] [--mail hola@bar.com]
 *                                    escribe una respuesta a ese texto e imprime el
 *                                    resultado, sin tocar la base ni Google
 *
 * Corre en el job diario (scripts/daily.js) y en el de cada hora
 * (scripts/hourly.js), después de sync-google: así una reseña que acaba de
 * entrar se encola en la misma corrida.
 *
 * Publica SÓLO con AI_AUTO_REPLY_PUBLISH=on (ver lib/autoReplies.js). Apagado,
 * encola y deja todo pendiente: es el estado de producción hasta que Google
 * apruebe la verificación de la app.
 */

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

/* --muestra: prueba el prompt, la clave y el modelo con un texto escrito a mano. */
async function sample(text) {
  const reply = await writeReply({
    review: {
      star_rating: Number(argValue('--estrellas')) || 5,
      comment: text,
      reviewer_name: argValue('--nombre'),
      is_anonymous: !argValue('--nombre'),
      business_name: argValue('--negocio') || 'Bar de prueba',
    },
    context: {
      instructions: argValue('--tono') || '',
      signature: argValue('--firma') || '',
      emojis: { enabled: process.argv.includes('--emojis'), mode: 'auto', amount: 'few', custom: [] },
      language: process.argv.includes('--idioma-resena') ? 'review' : 'business',
      negative_contact_email: argValue('--mail'),
    },
  });
  console.log(reply);
}

async function main() {
  const sampleText = argValue('--muestra');
  if (sampleText !== null) return sample(sampleText);

  const summary = await runAutoReplies({
    orgId: argValue('--org'),
    dryRun: process.argv.includes('--dry-run'),
    limit: Number(argValue('--limit')) || undefined,
  });

  if (summary.publishing) {
    console.log(`\nPublicadas: ${summary.published}${summary.failed ? ` · Con error: ${summary.failed}` : ''}`);
  }
  if (summary.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Error en las respuestas con IA:', err.message || err);
  process.exit(1);
});
