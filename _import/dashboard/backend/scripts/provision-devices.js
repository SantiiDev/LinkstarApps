import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { REDIRECT_DOMAIN } from '../lib/config.js';

// Decisión 4 de CLAUDE.md: los devices nunca se crean client-side. Se
// provisionan acá, en lote, con status='unassigned' y sin organization_id —
// el cliente los vincula después desde la app con claim_device() usando el
// claim_code impreso. Por eso este script usa el cliente service_role
// (lib/supabase.js): no existe (ni debe existir) política de INSERT para
// devices en RLS.
const ALLOWED_KINDS = ['google_review', 'instagram'];
const MAX_COUNT = 500;

function parseArgs() {
  const [, , kind, countArg, batchCode] = process.argv;

  if (!ALLOWED_KINDS.includes(kind)) {
    console.error('Uso: node scripts/provision-devices.js <kind> <cantidad> [batch_code]');
    console.error(`  kind debe ser uno de: ${ALLOWED_KINDS.join(', ')}`);
    process.exit(1);
  }

  const count = Number(countArg);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    console.error(`cantidad debe ser un entero entre 1 y ${MAX_COUNT}`);
    process.exit(1);
  }

  return { kind, count, batchCode: batchCode || null };
}

async function provisionDevices({ kind, count, batchCode }) {
  // public_id y claim_code no se pasan: los generan los defaults de columna
  // (private.generate_public_id / private.generate_claim_code, ver
  // 0001_extensions_types_helpers.sql), únicos por diseño.
  const rows = Array.from({ length: count }, () => ({
    kind,
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

function printTable(devices) {
  const rows = devices.map(({ public_id, claim_code }) => ({
    public_id,
    claim_code,
    url: `https://${REDIRECT_DOMAIN}/d/${public_id}`,
  }));
  console.table(rows);
}

const { kind, count, batchCode } = parseArgs();

provisionDevices({ kind, count, batchCode })
  .then((devices) => {
    console.log(`\n${devices.length} dispositivo(s) '${kind}' provisionados${batchCode ? ` (batch ${batchCode})` : ''}.\n`);
    printTable(devices);
  })
  .catch((err) => {
    console.error('Error provisionando dispositivos:', err.message || err);
    process.exit(1);
  });
