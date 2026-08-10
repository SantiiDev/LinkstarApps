import 'dotenv/config';
import { supabase } from '../lib/supabase.js';

// Llama al RPC public.rebuild_today_rollup (0012_rebuild_today_rollup_rpc.sql),
// que a su vez reusa private.rebuild_daily_rollups() (0007) — el mismo
// DELETE + INSERT idempotente del job nocturno. Sirve para ver el dashboard
// actualizado sin esperar al cron: podés correrlo las veces que quieras, el
// resultado para un mismo día siempre converge al mismo estado.
function parseDay() {
  const arg = process.argv[2];
  if (!arg) return undefined;  // sin argumento: la función usa su default (hoy)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    console.error('Uso: node scripts/rebuild-today-rollup.js [YYYY-MM-DD]');
    console.error('  Sin argumento, recalcula el rollup de HOY.');
    process.exit(1);
  }
  return arg;
}

async function main() {
  const day = parseDay();

  const { data: rowCount, error } = await supabase.rpc(
    'rebuild_today_rollup',
    day ? { p_day: day } : {}
  );

  if (error) throw error;

  console.log(`scan_daily_rollups recalculado para ${day || 'hoy'}: ${rowCount} fila(s).`);
}

main().catch((err) => {
  console.error('Error recalculando el rollup:', err.message || err);
  process.exit(1);
});
