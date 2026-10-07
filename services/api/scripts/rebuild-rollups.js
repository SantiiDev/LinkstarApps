import 'dotenv/config';
import { supabase } from '../lib/supabase.js';

/* rebuild-rollups — la parte de la base del job diario.
 *
 *   node scripts/rebuild-rollups.js            ayer + hoy, y vence suscripciones
 *   node scripts/rebuild-rollups.js --dry-run  sólo dice qué haría
 *
 * Hace lo que iban a hacer dos de los cuatro cron.schedule de la 0007, que
 * siguen comentados porque pg_cron no está habilitado:
 *
 *   1. scan_daily_rollups de AYER y de HOY (rebuild_today_rollup, 0012). Ayer
 *      además de hoy porque el job corre una vez por día: sin eso, lo escaneado
 *      entre la corrida de ayer y la medianoche no entraría nunca al rollup. Y
 *      el panel lee SÓLO de los rollups (invariante 2), así que eso era un
 *      escaneo perdido para siempre.
 *   2. Vencer las suscripciones cuyo período o gracia terminó
 *      (run_expire_subscriptions, 0028).
 *
 * Los días son UTC, igual que private.rebuild_daily_rollups(): corta el día con
 * p_day::timestamptz en la zona de la base. Ver la decisión 10 del roadmap
 * (cuándo empieza y termina un día) antes de cambiarlo.
 *
 * Es idempotente: el rollup es DELETE + INSERT por día, y vencer dos veces no
 * vence nada nuevo. Correrlo varias veces por día es inofensivo.
 */

function utcDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const days = [utcDay(-1), utcDay(0)];

  if (dryRun) {
    console.log(`(simulacro) Recalcularía scan_daily_rollups de ${days.join(' y ')} y vencería suscripciones.`);
    return;
  }

  for (const day of days) {
    const { data: rows, error } = await supabase.rpc('rebuild_today_rollup', { p_day: day });
    if (error) throw error;
    console.log(`scan_daily_rollups ${day}: ${rows} fila(s).`);
  }

  const { data: expired, error: expireError } = await supabase.rpc('run_expire_subscriptions');
  if (expireError) throw expireError;
  console.log(`Suscripciones vencidas: ${expired}.`);
}

main().catch((err) => {
  console.error('Error en rebuild-rollups:', err.message || err);
  process.exit(1);
});
