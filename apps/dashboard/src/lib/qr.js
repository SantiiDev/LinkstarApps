import QRCode from 'qrcode';

// Genera el PNG del QR para `text` y dispara la descarga en el navegador.
// Todo corre client-side (librería `qrcode`) — no pasa por el backend.
export async function downloadQrPng(text, filename) {
  const dataUrl = await QRCode.toDataURL(text, { width: 512, margin: 2 });
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
