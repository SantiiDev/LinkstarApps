import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { claimUrlWarning, writeClaimSheet } from '../lib/claimSheet.js';

/* print-claim-sheet — vuelve a generar la hoja de QR de vinculación de un lote.
 *
 *   node scripts/print-claim-sheet.js --batch=<lote>                     sólo los sin vincular
 *   node scripts/print-claim-sheet.js --batch=<lote> --incluir-vinculados
 *   node scripts/print-claim-sheet.js --batch=<lote> --out=<carpeta> --qr-mm=25
 *
 * provision-devices.js ya genera la hoja al crear el lote; esto sirve para
 * reimprimirla (se perdió el archivo, la imprenta pide otro tamaño). Sólo lee:
 * no crea ni cambia ningún expositor.
 *
 * --batch es obligatorio a propósito: una hoja con todos los expositores sin
 * vincular de la base mezclaría tandas, y lo impreso no se deshace.
 */

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const batchCode = flag('batch');
  if (!batchCode) {
    console.error('Falta --batch=<lote>. Uso: node scripts/print-claim-sheet.js --batch=<lote> [--incluir-vinculados] [--out=<carpeta>] [--qr-mm=<mm>]');
    process.exit(1);
  }
  const includeClaimed = process.argv.includes('--incluir-vinculados');
  const qrMm = flag('qr-mm') ? Number(flag('qr-mm')) : undefined;
  if (qrMm !== undefined && !(qrMm >= 10 && qrMm <= 60)) {
    console.error('--qr-mm debe estar entre 10 y 60');
    process.exit(1);
  }

  const warning = claimUrlWarning();
  if (warning) console.warn(`⚠️  ${warning}\n`);

  let query = supabase
    .from('devices')
    .select('public_id, claim_code, status')
    .eq('batch_code', batchCode)
    .order('created_at', { ascending: true });
  if (!includeClaimed) query = query.eq('status', 'unassigned');

  const { data: devices, error } = await query;
  if (error) throw error;
  if (!devices.length) {
    console.log(`El lote ${batchCode} no tiene expositores${includeClaimed ? '' : ' sin vincular'}.`);
    return;
  }

  const file = await writeClaimSheet(devices, { outDir: flag('out'), batchCode, qrMm });
  console.log(`${devices.length} expositor(es) del lote ${batchCode}. Hoja: ${file}`);
}

main().catch((err) => {
  console.error('Error generando la hoja:', err.message || err);
  process.exit(1);
});
