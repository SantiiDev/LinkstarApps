import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* El job diario del API: lo que corre el cron del host (Railway), una vez por día.
 *
 *   node scripts/daily.js            corre los tres jobs
 *   node scripts/daily.js --dry-run  se lo pasa a los tres: muestran, no escriben ni mandan
 *
 * En orden:
 *   1. rebuild-rollups — scan_daily_rollups de ayer y hoy, y vence suscripciones.
 *   2. sync-google     — fichas, reseñas, snapshot del día y métricas de Google.
 *   3. send-alerts     — expositores inactivos y resumen semanal.
 *
 * Los rollups van primero porque el resumen semanal de send-alerts los lee: con
 * el orden al revés, el mail diría lo de ayer.
 *
 * rebuild-rollups es lo que iban a hacer los cron.schedule de la 0007, que
 * siguen comentados (pg_cron no está habilitado). Sin él, el panel mostraba los
 * escaneos en cero: lee sólo de scan_daily_rollups y nada los escribía. Los otros
 * dos viven acá y no en pg_cron porque necesitan claves que sólo tiene este
 * servicio (GOOGLE_TOKEN_ENC_KEY, RESEND_API_KEY).
 *
 * Cada job corre en su propio proceso, y SIEMPRE corren todos: si Google falla
 * (una conexión vencida, la API caída), las alertas por escaneos igual tienen que
 * salir. El código de salida es distinto de 0 si cualquiera falló, así el panel
 * del host marca la corrida en rojo.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const passthrough = process.argv.slice(2).filter((arg) => arg === '--dry-run');

const JOBS = ['rebuild-rollups.js', 'sync-google.js', 'send-alerts.js'];

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), ...passthrough], {
      stdio: 'inherit',
    });
    child.on('error', (err) => {
      console.error(`No se pudo lanzar ${script}:`, err.message);
      resolve(1);
    });
    child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

const failed = [];
for (const script of JOBS) {
  console.log(`\n━━━ ${script} ━━━`);
  const code = await run(script);
  if (code !== 0) failed.push(`${script} (código ${code})`);
}

if (failed.length) {
  console.error(`\n✗ Fallaron: ${failed.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\n✓ Job diario completo.');
}
