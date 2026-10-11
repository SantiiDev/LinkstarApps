import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* El job de cada hora: lo que no puede esperar al diario de las 8:00.
 *
 *   node scripts/hourly.js            corre los tres jobs
 *   node scripts/hourly.js --dry-run  se lo pasa a los tres
 *
 * En orden:
 *   1. sync-google      — lee las reseñas nuevas (y métricas y protección de ficha).
 *   2. run-auto-replies — encola las respuestas automáticas y, con
 *                         AI_AUTO_REPLY_PUBLISH=on, publica las vencidas. Los
 *                         retardos «entre 1 y 3 horas» y «entre 3 y 6 horas»
 *                         sólo tienen sentido con esto corriendo cada hora.
 *   3. send-alerts --solo-resenas — las alertas de reseñas (0036) salen el
 *                         mismo día en vez de al día siguiente. Las de escaneos
 *                         quedan en el diario: el resumen semanal sale a los 6
 *                         días del anterior, y cada hora se iría adelantando.
 *
 * Los escaneos (rebuild-rollups) siguen sólo en el diario. Corre en un servicio
 * cron propio de Railway (`hourly`, `0 * * * *`), con las mismas variables que
 * `daily`. Ver services/api/DEPLOY.md.
 *
 * Igual que daily.js: cada job en su proceso, siempre corren todos, y el código
 * de salida es distinto de 0 si alguno falló.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const passthrough = process.argv.slice(2).filter((arg) => arg === '--dry-run');

const JOBS = [['sync-google.js'], ['run-auto-replies.js'], ['send-alerts.js', '--solo-resenas']];

function run([script, ...args]) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), ...args, ...passthrough], {
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
for (const job of JOBS) {
  const label = job.join(' ');
  console.log(`\n━━━ ${label} ━━━`);
  const code = await run(job);
  if (code !== 0) failed.push(`${label} (código ${code})`);
}

if (failed.length) {
  console.error(`\n✗ Fallaron: ${failed.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\n✓ Job de cada hora completo.');
}
