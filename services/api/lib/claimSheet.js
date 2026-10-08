import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { REDIRECT_DOMAIN, DASHBOARD_URL } from './config.js';

/* Hoja A4 con los QR de vinculación, para la imprenta.
 *
 * Dos QR por expositor, y no son intercambiables:
 *   - publicUrlFor(): el del frente, el que escanean los clientes (y lo que se
 *     graba en el NFC con ?s=n). Lo ve cualquiera, así que NO sirve para vincular
 *     y NO va en esta hoja: es parte del diseño del frente.
 *   - claimUrlFor(): el chico de la base, junto al claim_code impreso. Lleva al
 *     panel con el modal de vinculación ya completado (ScanClaimModal.jsx, en
 *     apps/dashboard); el botón «Escanear QR» del panel también lo lee.
 *
 * La hoja es HTML autocontenido (los QR van como SVG inline, sin fuentes ni
 * scripts externos): se abre sin conexión y se imprime o se guarda como PDF desde
 * el navegador. Las medidas van en mm para que el tamaño impreso sea el pedido.
 */

export function publicUrlFor(publicId) {
  return `https://${REDIRECT_DOMAIN}/d/${publicId}`;
}

export function claimUrlFor(claimCode) {
  return `${DASHBOARD_URL.replace(/\/+$/, '')}/panel/dispositivos?vincular=${claimCode}`;
}

/* Un QR que apunta a localhost impreso en una base no le sirve a nadie, y no
   hay forma de corregirlo después de la imprenta. */
export function claimUrlWarning() {
  const host = new URL(DASHBOARD_URL).hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.trycloudflare.com')) {
    return `DASHBOARD_URL es ${DASHBOARD_URL}: los QR de vinculación apuntan ahí y NO van a servir impresos. ` +
      'Generá la hoja con DASHBOARD_URL=https://app.linkstarapp.com.';
  }
  return null;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* devices: [{ public_id, claim_code, form_factor? }]. */
export async function renderClaimSheet(devices, { qrMm = 20, batchCode = null, generatedAt = new Date() } = {}) {
  const dashboardHost = new URL(DASHBOARD_URL).host;

  const labels = await Promise.all(devices.map(async ({ public_id, claim_code }) => {
    // Corrección de errores M: aguanta un raspón sin agrandar demasiado el QR.
    const svg = await QRCode.toString(claimUrlFor(claim_code), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return `
      <div class="label">
        <div class="qr">${svg}</div>
        <div class="code">${escapeHtml(claim_code)}</div>
        <div class="hint">Vinculá en ${escapeHtml(dashboardHost)}</div>
        <div class="id">${escapeHtml(public_id)}</div>
      </div>`;
  }));

  const date = generatedAt.toISOString().slice(0, 10);
  const title = `QR de vinculación${batchCode ? ` · lote ${batchCode}` : ''} · ${date}`;
  // Etiqueta = QR + texto + márgenes. El ancho manda la grilla (auto-fill).
  const labelMm = qrMm + 12;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  header { display: flex; justify-content: space-between; font-size: 9pt; padding: 0 0 4mm; border-bottom: 0.3mm solid #000; margin-bottom: 4mm; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, ${labelMm}mm); gap: 3mm; }
  .label {
    width: ${labelMm}mm; padding: 2mm; border: 0.2mm dashed #999; /* guía de corte */
    display: flex; flex-direction: column; align-items: center; text-align: center;
    break-inside: avoid; page-break-inside: avoid;
  }
  .qr, .qr svg { width: ${qrMm}mm; height: ${qrMm}mm; display: block; }
  .code { margin-top: 1.5mm; font-family: "Courier New", Courier, monospace; font-weight: bold; font-size: ${Math.max(8, Math.round(qrMm / 2.2))}pt; letter-spacing: 0.4mm; }
  .hint { font-size: 6pt; margin-top: 0.8mm; }
  .id { font-size: 5pt; color: #666; margin-top: 0.5mm; }
  @media screen { body { padding: 10mm; } }
</style>
</head>
<body>
<header>
  <span>${escapeHtml(title)}</span>
  <span>${devices.length} expositor(es) · QR ${qrMm} mm</span>
</header>
<main class="grid">${labels.join('')}
</main>
</body>
</html>
`;
}

/* Escribe la hoja en `outDir` y devuelve la ruta. El nombre lleva el lote (o la
   fecha y hora, si no hay lote) para que dos tandas no se pisen. */
export async function writeClaimSheet(devices, { outDir = process.cwd(), batchCode = null, qrMm } = {}) {
  const generatedAt = new Date();
  const stamp = batchCode
    ? batchCode.replace(/[^\w.-]+/g, '_')
    : generatedAt.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const file = path.resolve(outDir, `claim-sheet-${stamp}.html`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await renderClaimSheet(devices, { qrMm, batchCode, generatedAt }), 'utf8');
  return file;
}
