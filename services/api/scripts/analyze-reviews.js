import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { analyzeOrganizationReviews, classifyReview } from '../lib/reviewAnalysis.js';

/* analyze-reviews — el análisis de reseñas (fase 5, 0033) por separado.
 *
 *   node scripts/analyze-reviews.js                     todas las organizaciones con Google
 *   node scripts/analyze-reviews.js --org <uuid>        sólo una
 *   node scripts/analyze-reviews.js --limit 1000        tope por organización (default 300)
 *   node scripts/analyze-reviews.js --dry-run           cuenta las pendientes, no llama a Claude
 *   node scripts/analyze-reviews.js --muestra "texto" [--estrellas 4]
 *                                                       clasifica ese texto e imprime el resultado,
 *                                                       sin tocar la base
 *
 * En el día a día no hace falta: el análisis ya corre dentro de sync-google,
 * después de leer las reseñas. Esto sirve para dos cosas: completar de una vez
 * el historial de una organización que acaba de pasar a Business (el diario lo
 * hace de a 300 por corrida), y probar el análisis sin volver a leer Google.
 *
 * Sólo trabaja sobre organizaciones Business: para las demás,
 * google_reviews_pending_analysis() devuelve vacío. Correrlo dos veces es
 * inofensivo: lo ya analizado no vuelve a salir pendiente.
 */

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

/* --muestra: clasifica un texto escrito a mano y lo imprime. No lee ni escribe
   la base: sirve para probar la clave, el modelo y el prompt (por ejemplo, con
   una reseña que intenta darle instrucciones al modelo). */
async function sample(text) {
  const stars = Number(argValue('--estrellas')) || null;
  const result = await classifyReview({ comment: text, star_rating: stars });
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const sampleText = argValue('--muestra');
  if (sampleText) return sample(sampleText);

  const dryRun = process.argv.includes('--dry-run');
  const onlyOrg = argValue('--org');
  const limit = Number(argValue('--limit')) || undefined;

  // Las mismas organizaciones que lee sync-google: Google conectado y plan
  // vigente. Sin Google no hay reseñas que analizar.
  const { data: targets, error } = await supabase.rpc('google_sync_targets');
  if (error) throw error;

  const orgs = [...new Set((targets ?? []).map((t) => t.organization_id))]
    .filter((id) => !onlyOrg || id === onlyOrg);
  if (!orgs.length) {
    console.log(onlyOrg ? `La organización ${onlyOrg} no tiene Google conectado.` : 'No hay organizaciones con Google conectado.');
    return;
  }

  let analyzed = 0;
  let failures = 0;
  for (const orgId of orgs) {
    console.log(`▸ ${orgId}`);
    const result = await analyzeOrganizationReviews(orgId, { dryRun, limit });
    if (!result.pending && !result.analyzed) console.log('  nada pendiente (o no es Business)');
    analyzed += result.analyzed;
    failures += result.failures;
  }

  console.log(`\nAnalizadas: ${analyzed}${failures ? ` · Con error: ${failures}` : ''}${dryRun ? ' (simulacro)' : ''}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Error analizando reseñas:', err.message || err);
  process.exit(1);
});
