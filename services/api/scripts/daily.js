import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* El job diario del API: lo que corre el cron del host (Railway), una vez por día.
 *
 *   node scripts/daily.js            corre los dos jobs
 *   node scripts/daily.js --dry-run  se lo pasa a los dos: muestran, no escriben ni mandan
 *
 * En orden:
 *   1. sync-reviews — lee fichas y reseñas de Google y deja el snapshot del día.
 *   2. send-alerts  — expositores inactivos y resumen semanal.
 *
 * Los dos viven acá y no en pg_cron porque necesitan claves que sólo tiene este
 * servicio (GOOGLE_TOKEN_ENC_KEY, RESEND_API_KEY). Los cron.schedule de la 0007
 * son otra cosa — rollups, deltas, vencimientos — y se habilitan en la base.
 *
 * Cada job corre en su propio proceso, y SIEMPRE corren los dos: si Google falla
 * (una conexión vencida, la API caída), las alertas por escaneos igual tienen que
 * salir. El código de salida es distinto de 0 si cualquiera de los dos falló, así
 * el panel del host marca la corrida en rojo.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const passthrough = process.argv.slice(2).filter((arg) => arg === '--dry-run');

const JOBS = ['sync-reviews.js', 'send-alerts.js'];

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
