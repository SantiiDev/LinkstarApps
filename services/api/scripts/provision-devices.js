import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { REDIRECT_DOMAIN, DASHBOARD_URL } from '../lib/config.js';

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
  console.error('Uso: node scripts/provision-devices.js <kind> <cantidad> [batch_code] [--form=<forma>]');
  console.error(`  kind debe ser uno de: ${ALLOWED_KINDS.join(', ')}`);
  console.error(`  --form (default nfc_stand): ${ALLOWED_FORMS.join(', ')}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const formArg = args.find((a) => a.startsWith('--form='));
  const [kind, countArg, batchCode] = args.filter((a) => !a.startsWith('--'));

  if (!ALLOWED_KINDS.includes(kind)) usage();

  const count = Number(countArg);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    console.error(`cantidad debe ser un entero entre 1 y ${MAX_COUNT}`);
    process.exit(1);
  }

  const formFactor = formArg ? formArg.slice('--form='.length) : 'nfc_stand';
  if (!ALLOWED_FORMS.includes(formFactor)) usage();

  return { kind, count, batchCode: batchCode || null, formFactor };
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

/* Dos QR por expositor, y no son intercambiables:
 *   - `url`: el del frente, el que escanean los clientes (y lo que se graba en el
 *     NFC con ?s=n). Lo ve cualquiera, así que NO sirve para vincular.
 *   - `claim_url`: el chico de la base, junto al claim_code impreso. Lleva al
 *     panel con el modal de vinculación ya completado (ScanClaimModal.jsx, en
 *     apps/dashboard); el botón «Escanear QR» del panel también lo lee. Sale de
 *     DASHBOARD_URL, así que para imprimir hay que correr esto con el .env de
 *     producción (https://app.linkstarapp.com), no con localhost. */
function printTable(devices) {
  const dashboard = DASHBOARD_URL.replace(/\/+$/, '');
  const rows = devices.map(({ public_id, claim_code }) => ({
    public_id,
    claim_code,
    url: `https://${REDIRECT_DOMAIN}/d/${public_id}`,
    claim_url: `${dashboard}/panel/dispositivos?vincular=${claim_code}`,
  }));
  console.table(rows);
}

const { kind, count, batchCode, formFactor } = parseArgs();

provisionDevices({ kind, count, batchCode, formFactor })
  .then((devices) => {
    console.log(`\n${devices.length} dispositivo(s) '${kind}' / '${formFactor}' provisionados${batchCode ? ` (batch ${batchCode})` : ''}.\n`);
    printTable(devices);
  })
  .catch((err) => {
    console.error('Error provisionando dispositivos:', err.message || err);
    process.exit(1);
  });
