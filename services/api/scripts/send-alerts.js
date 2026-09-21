import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { send, deviceIdleEmail, weeklySummaryEmail } from '../lib/mailer.js';

/* Ejecutor de las alertas de la fase 7 que no dependen de Google.
 *
 *   node scripts/send-alerts.js            manda lo que haya pendiente
 *   node scripts/send-alerts.js --dry-run  muestra qué mandaría, sin mandar
 *
 * Toda la decisión de QUÉ mandar vive en SQL (public.pending_notifications,
 * migración 0023). Acá sólo se arma el mail y se manda, igual que
 * rebuild-today-rollup.js es un envoltorio de una función de la base. Eso es lo
 * que permite que el día que la fase 8 habilite pg_cron no haya que reescribir
 * la lógica: se programa la misma función.
 *
 * ── Idempotencia ──────────────────────────────────────────────────────────
 * Un expositor que lleva una semana quieto cumple la condición todos los días.
 * Lo que evita el aviso repetido es `notification_log`: la función ya excluye
 * lo avisado dentro de la ventana, y acá se registra DESPUÉS de que el
 * proveedor aceptó el mail. Si el envío falla no se registra, así que la
 * alerta vuelve a aparecer en la próxima corrida en vez de perderse.
 *
 * Un mail simulado (sin RESEND_API_KEY) tampoco se registra: registrar un envío
 * que no ocurrió haría que el aviso real nunca salga.
 */

const TEMPLATES = {
  device_idle: deviceIdleEmail,
  weekly_summary: weeklySummaryEmail,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { data: pending, error } = await supabase.rpc('pending_notifications');
  if (error) throw error;

  if (!pending?.length) {
    console.log('No hay avisos pendientes.');
    return;
  }

  console.log(`${pending.length} aviso(s) pendiente(s).${dryRun ? ' (simulacro)' : ''}\n`);

  let sent = 0;
  let simulated = 0;
  let failed = 0;

  for (const row of pending) {
    const build = TEMPLATES[row.kind];
    if (!build) {
      // Pasa si alguien agrega un valor al enum y se olvida la plantilla. Se
      // avisa y se sigue: un tipo nuevo sin plantilla no tiene por qué frenar
      // los avisos que sí funcionan.
      console.warn(`⚠️  Sin plantilla para "${row.kind}", se saltea.`);
      failed++;
      continue;
    }

    const mail = build({
      organizationName: row.organization_name,
      payload: row.payload ?? {},
    });

    if (dryRun) {
      console.log(`[${row.kind}] → ${row.recipient_email}`);
      console.log(`   ${mail.subject}`);
      continue;
    }

    try {
      const result = await send({ to: row.recipient_email, ...mail });

      if (result.simulated) {
        simulated++;
        continue;   // no se registra: no se mandó nada
      }

      const { error: logError } = await supabase.rpc('record_notification', {
        p_organization_id: row.organization_id,
        p_kind: row.kind,
        p_recipient_email: row.recipient_email,
        p_entity_id: row.entity_id,
        p_metadata: row.payload ?? {},
      });

      // El mail salió pero no se pudo registrar. Se avisa fuerte: en la próxima
      // corrida se va a mandar de nuevo, y es mejor saberlo que descubrirlo por
      // un cliente que recibió el mismo aviso tres veces.
      if (logError) {
        console.error(`⚠️  Mail enviado a ${row.recipient_email} pero NO registrado:`, logError.message);
      }

      sent++;
      console.log(`✓ [${row.kind}] → ${row.recipient_email}`);
    } catch (err) {
      failed++;
      console.error(`✗ [${row.kind}] → ${row.recipient_email}: ${err.message}`);
    }
  }

  if (dryRun) return;

  console.log(`\nEnviados: ${sent}${simulated ? ` · Simulados: ${simulated}` : ''}${failed ? ` · Fallidos: ${failed}` : ''}`);
  if (simulated) {
    console.log('Los simulados NO se registraron: sin RESEND_API_KEY no se manda nada de verdad.');
  }
}

main().catch((err) => {
  console.error('Error enviando avisos:', err.message || err);
  process.exit(1);
});
