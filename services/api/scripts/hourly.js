import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* El job horario del API: lo que corre el segundo cron de Railway (`hourly`,
 * `0 * * * *`), además del diario.
 *
 *   node scripts/hourly.js            corre los dos pasos
 *   node scripts/hourly.js --dry-run  se lo pasa a los dos: muestran, no escriben ni mandan
 *
 * En orden:
 *   1. sync-google --only-reviews  reseñas nuevas, su análisis y las respuestas
 *                                  automáticas (lib/replyJobs.js, 0037)
 *   2. send-alerts --kinds=…       sólo las alertas de reseñas (0036)
 *
 * Existe para que «Inmediata» en la respuesta automática y las alertas de
 * reseñas tarden menos de una hora y no hasta un día. Las métricas, la
 * protección de la ficha, los rollups y el resumen semanal siguen en el diario
 * (scripts/daily.js): correrlos cada hora sólo gastaría cuota de Google o
 * repetiría el resumen.
 *
 * Como en el diario, cada paso corre en su propio proceso y siempre corren los
 * dos; el código de salida es distinto de 0 si alguno falló.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const passthrough = process.argv.slice(2).filter((arg) => arg === '--dry-run');

const JOBS = [
  ['sync-google.js', '--only-reviews'],
  ['send-alerts.js', '--kinds=low_rating,review_keyword'],
];

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
  console.log(`\n━━━ ${job.join(' ')} ━━━`);
  const code = await run(job);
  if (code !== 0) failed.push(`${job[0]} (código ${code})`);
}

if (failed.length) {
  console.error(`\n✗ Fallaron: ${failed.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\n✓ Job horario completo.');
}
