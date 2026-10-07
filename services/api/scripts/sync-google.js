import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { assertGoogleConfigured } from '../lib/googleOAuth.js';
import { syncGoogleOrganization } from '../lib/googleSync.js';

/* sync-google — la parte de Google del job diario (scripts/daily.js).
 *
 *   node scripts/sync-google.js                  todas las organizaciones conectadas
 *   node scripts/sync-google.js --org <uuid>     sólo una
 *   node scripts/sync-google.js --dry-run        lista cuentas y fichas, no escribe
 *
 * Por cada organización con Google conectado y plan vigente
 * (google_sync_targets, 0024): pide un access token con el refresh token,
 * recorre cuentas → fichas → reseñas, deja el snapshot del día en
 * location_review_snapshots y lee las métricas y palabras de búsqueda de cada
 * ficha vinculada. El detalle está en lib/googleSync.js. Hasta la fase 4.6 se
 * llamaba sync-reviews.js y sólo leía reseñas.
 *
 * Al final recalcula review_deltas del día (compute_review_deltas), así las
 * "reseñas nuevas" aparecen sin esperar al cron de 0007, que no está programado.
 *
 * No puede vivir en pg_cron: habla con Google y necesita la clave de cifrado de
 * este servicio. Correrlo más de una vez por día es inofensivo: el snapshot del
 * día se pisa, y reseñas y métricas se upsertean.
 *
 * ── Errores ───────────────────────────────────────────────────────────────
 * Una organización que falla no frena a las demás. Si Google rechaza el refresh
 * token (invalid_grant) la conexión pasa a 'needs_reauth' y deja de intentarse
 * hasta que alguien la reconecte desde el panel. Mientras la app de Google esté
 * en modo Testing eso pasa a los 7 días de cada conexión — es esperable, no un
 * bug.
 */

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  assertGoogleConfigured();

  const dryRun = process.argv.includes('--dry-run');
  const onlyOrg = argValue('--org');

  const { data: targets, error } = await supabase.rpc('google_sync_targets');
  if (error) throw error;

  const selected = (targets ?? []).filter((t) => !onlyOrg || t.organization_id === onlyOrg);
  if (!selected.length) {
    console.log(onlyOrg
      ? `La organización ${onlyOrg} no tiene Google conectado, está en needs_reauth o sin plan vigente.`
      : 'No hay organizaciones con Google conectado.');
    return;
  }

  console.log(`${selected.length} organización(es) para sincronizar.${dryRun ? ' (simulacro)' : ''}\n`);

  let ok = 0;
  let partial = 0;   // la organización se leyó, pero alguna ficha falló
  let failed = 0;
  let reauth = 0;

  for (const target of selected) {
    console.log(`▸ ${target.organization_id}`);
    try {
      const summary = await syncGoogleOrganization(target, { dryRun });
      if (!dryRun) {
        await supabase.rpc('google_record_sync_result', {
          p_org: target.organization_id,
          p_ok: summary.failures === 0,
          p_error: summary.failures
            ? `No pudimos leer ${summary.failures} de tus fichas. Suele pasar con fichas sin verificar.`
            : null,
        });
      }
      console.log(
        `  → ${summary.locations} ficha(s) (${summary.linked} vinculada(s)), ${summary.reviews} reseña(s) nueva(s)/editada(s), ` +
        `${summary.snapshots} snapshot(s), ${summary.metricDays ?? 0} día(s) de métricas, ${summary.keywords ?? 0} palabra(s)` +
        `${summary.failures ? `, ${summary.failures} error(es) de ficha` : ''}\n`
      );
      // Contarla como OK con todas sus fichas en error escondía justo el caso
      // que importa ver (p. ej. la API v4 sin habilitar: cuentas y fichas se
      // leen bien, las reseñas no).
      if (summary.failures) partial++;
      else ok++;
    } catch (err) {
      const needsReauth = err.code === 'invalid_grant';
      if (needsReauth) reauth++;
      else failed++;

      console.error(`  ✗ ${err.message}\n`);
      if (!dryRun) {
        await supabase.rpc('google_record_sync_result', {
          p_org: target.organization_id,
          p_ok: false,
          // Texto para el panel, no el error crudo de Google.
          p_error: needsReauth
            ? 'Google revocó el acceso. Volvé a conectar tu ficha.'
            : 'No pudimos leer tu ficha de Google. Lo volvemos a intentar mañana.',
          p_needs_reauth: needsReauth,
        });
      }
    }
  }

  if (!dryRun) {
    const { data: deltas, error: deltasError } = await supabase.rpc('compute_review_deltas', {});
    if (deltasError) console.error('⚠️  No se pudieron recalcular los deltas:', deltasError.message);
    else console.log(`review_deltas de hoy: ${deltas} fila(s).`);
  }

  console.log(
    `\nOK: ${ok}` +
    (partial ? ` · Con fichas en error: ${partial}` : '') +
    (reauth ? ` · A reconectar: ${reauth}` : '') +
    (failed ? ` · Fallidas: ${failed}` : '')
  );
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Error sincronizando Google:', err.message || err);
  process.exit(1);
});
