import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { claimUrlFor, claimUrlWarning, publicUrlFor, writeClaimSheet } from '../lib/claimSheet.js';

// Decisión 4 de CLAUDE.md: los devices nunca se crean client-side. Se
// provisionan acá, en lote, con status='unassigned' y sin organization_id —
// el cliente los vincula después desde la app con claim_device() usando el
// claim_code impreso. Por eso este script usa el cliente service_role
// (lib/supabase.js): no existe (ni debe existir) política de INSERT para
// devices en RLS.
const ALLOWED_KINDS = ['google_review', 'instagram'];
// Enum device_form (0001). `nfc_card` es la tarjeta personal: el único
// dispositivo al que se le puede asignar un empleado (decisión 11, 0028).
const ALLOWED_FORMS = ['nfc_stand', 'nfc_sticker', 'nfc_card', 'qr_stand', 'qr_sticker'];
const MAX_COUNT = 500;

function usage() {
  console.error('Uso: node scripts/provision-devices.js <kind> <cantidad> [batch_code] [--form=<forma>] [--out=<carpeta>] [--qr-mm=<mm>]');
  console.error(`  kind debe ser uno de: ${ALLOWED_KINDS.join(', ')}`);
  console.error(`  --form (default nfc_stand): ${ALLOWED_FORMS.join(', ')}`);
  console.error('  --out   carpeta de la hoja de QR de vinculación (default: la actual)');
  console.error('  --qr-mm lado del QR impreso, en mm (default 20)');
  process.exit(1);
}

const flag = (args, name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function parseArgs() {
  const args = process.argv.slice(2);
  const formArg = args.find((a) => a.startsWith('--form='));
  const [kind, countArg, batchCode] = args.filter((a) => !a.startsWith('--'));
  const outDir = flag(args, 'out');
  const qrMm = flag(args, 'qr-mm') ? Number(flag(args, 'qr-mm')) : undefined;
  if (qrMm !== undefined && !(qrMm >= 10 && qrMm <= 60)) {
    console.error('--qr-mm debe estar entre 10 y 60');
    process.exit(1);
  }

  if (!ALLOWED_KINDS.includes(kind)) usage();

  const count = Number(countArg);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    console.error(`cantidad debe ser un entero entre 1 y ${MAX_COUNT}`);
    process.exit(1);
  }

  const formFactor = formArg ? formArg.slice('--form='.length) : 'nfc_stand';
  if (!ALLOWED_FORMS.includes(formFactor)) usage();

  return { kind, count, batchCode: batchCode || null, formFactor, outDir, qrMm };
}

async function provisionDevices({ kind, count, batchCode, formFactor }) {
  // public_id y claim_code no se pasan: los generan los defaults de columna
  // (private.generate_public_id / private.generate_claim_code, ver
  // 0001_extensions_types_helpers.sql), únicos por diseño.
  const rows = Array.from({ length: count }, () => ({
    kind,
    form_factor: formFactor,
    status: 'unassigned',
    batch_code: batchCode,
  }));

  const { data, error } = await supabase
    .from('devices')
    .insert(rows)
    .select('public_id, claim_code');

  if (error) throw error;
  return data;
}

/* Dos QR por expositor, y no son intercambiables (ver lib/claimSheet.js):
 *   - `url`: el del frente, el que escanean los clientes. NO sirve para vincular.
 *   - `claim_url`: el chico de la base, junto al claim_code impreso. Sale de
 *     DASHBOARD_URL, así que para imprimir hay que correr esto con el .env de
 *     producción (https://app.linkstarapp.com), no con localhost.
 * La hoja de QR de vinculación se puede volver a generar después con
 * scripts/print-claim-sheet.js --batch=<lote>. */
function printTable(devices) {
  const rows = devices.map(({ public_id, claim_code }) => ({
    public_id,
    claim_code,
    url: publicUrlFor(public_id),
    claim_url: claimUrlFor(claim_code),
  }));
  console.table(rows);
}

const { kind, count, batchCode, formFactor, outDir, qrMm } = parseArgs();

// Se avisa ANTES de crear nada: lo provisionado no se deshace, la hoja sí.
const warning = claimUrlWarning();
if (warning) console.warn(`⚠️  ${warning}\n`);

provisionDevices({ kind, count, batchCode, formFactor })
  .then(async (devices) => {
    console.log(`\n${devices.length} dispositivo(s) '${kind}' / '${formFactor}' provisionados${batchCode ? ` (batch ${batchCode})` : ''}.\n`);
    printTable(devices);
    const file = await writeClaimSheet(devices, { outDir, batchCode, qrMm });
    console.log(`\nHoja de QR de vinculación: ${file}`);
  })
  .catch((err) => {
    console.error('Error provisionando dispositivos:', err.message || err);
    process.exit(1);
  });
