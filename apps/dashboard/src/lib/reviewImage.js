/*
 * La imagen para compartir una reseña en Instagram (Reseñas → Compartir).
 *
 * Todo corre en el navegador con un <canvas>: no pasa por el API ni se guarda en
 * ningún lado. Sólo dibuja; el modal (pages/Reviews/ReviewShareModal) decide qué
 * hacer con el PNG.
 *
 * Decisiones de producto (11/10/2026):
 *   - el autor va como «Nombre I.» (shortAuthorName): se lee real sin exponer el
 *     nombre completo de un cliente en una red social;
 *   - sin marca de Linkstar: la imagen es publicidad del negocio.
 *
 * Canvas no ajusta texto solo: wrapLines corta por palabras (y una palabra más
 * ancha que la línea, por letras), y lo que no entra termina en «…».
 */

const FORMATS = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1080 },
};

const ORANGE = '#F58529';
const GOLD = '#F59E0B';
const NAVY = '#1A2639';
const GREY = 'rgba(26, 38, 57, 0.55)';
const EMPTY_STAR = 'rgba(26, 38, 57, 0.14)';
const FONT = 'Roboto, -apple-system, "Segoe UI", sans-serif';

/* «Martina González» → «Martina G.». Un solo nombre queda como está. */
export function shortAuthorName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Usuario de Google';
  if (words.length === 1) return words[0];
  return `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.`;
}

function formatLongDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* Corta `text` en líneas de hasta `maxWidth` px, respetando los saltos de línea
   del original. Con `maxLines`, la última termina en «…» si sobra texto. */
function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = [];
  const pushWord = (line, word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    if (line) lines.push(line);
    // Una palabra que sola no entra (un link, una risa larga) se corta por letras.
    let rest = word;
    while (ctx.measureText(rest).width > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    return rest;
  };

  for (const paragraph of text.split(/\n+/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) line = pushWord(line, word);
    if (line) lines.push(line);
  }

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.replace(/[\s.,;:]+$/, '')}…`;
  return kept;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx, cx, cy, outer, fill) {
  const inner = outer * 0.48;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, ORANGE);
  gradient.addColorStop(1, GOLD);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Dos círculos suaves para que el fondo no sea plano.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.arc(width * 0.92, height * 0.08, width * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(26, 38, 57, 0.07)';
  ctx.beginPath();
  ctx.arc(width * 0.05, height * 0.95, width * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

/* El tamaño del texto según el largo: una reseña corta se lee grande. */
function quoteSizeFor(format, length) {
  if (format === 'story') return length < 120 ? 58 : length < 300 ? 48 : 42;
  return length < 100 ? 48 : length < 220 ? 40 : 34;
}

async function ensureFonts() {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`500 48px ${FONT}`),
      document.fonts.load(`700 48px ${FONT}`),
      document.fonts.load(`800 48px ${FONT}`),
    ]);
  } catch {
    // Sin la fuente se dibuja con la del sistema: no es motivo para fallar.
  }
}

/**
 * @param {{ format: 'story' | 'post', businessName: string, author: string,
 *           rating: number | null, text: string, date: string | null }} review
 * @returns {Promise<Blob>} el PNG
 */
export async function renderReviewImage({ format = 'story', businessName, author, rating, text, date }) {
  const { width, height } = FORMATS[format] ?? FORMATS.story;
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  drawBackground(ctx, width, height);

  const isStory = format === 'story';
  const margin = isStory ? 90 : 70;
  const cardX = margin;
  const cardW = width - margin * 2;
  const pad = isStory ? 80 : 60;
  const innerW = cardW - pad * 2;

  // ── Encabezado: el nombre del negocio, en blanco sobre el degradé ──
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `800 ${isStory ? 64 : 50}px ${FONT}`;
  const nameLines = wrapLines(ctx, businessName || 'Nuestro local', width - margin * 2, 2);
  const nameLineH = isStory ? 76 : 60;
  const subtitle = 'Lo que dicen nuestros clientes';
  const subtitleGap = isStory ? 50 : 40; // del nombre a la línea de abajo
  const cardGap = isStory ? 90 : 54; // de esa línea a la tarjeta
  const headerH = nameLines.length * nameLineH + subtitleGap + cardGap;

  // ── Medir la tarjeta antes de dibujarla, para centrarla ──
  const quote = text?.trim() ? `“${text.trim()}”` : '';
  const quoteSize = quoteSizeFor(format, quote.length);
  const quoteLineH = Math.round(quoteSize * 1.42);
  ctx.font = `500 ${quoteSize}px ${FONT}`;
  const starSize = isStory ? 34 : 28;
  const authorSize = isStory ? 40 : 34;
  const metaSize = isStory ? 30 : 25;
  const gap = isStory ? 48 : 36;

  const fixedH = pad * 2 + starSize * 2 + gap + authorSize + 14 + metaSize;
  // En la historia se deja aire arriba y abajo (Instagram tapa los bordes con
  // su interfaz); en la publicación cuadrada se aprovecha todo.
  const available = height - margin * 2 - headerH - (isStory ? 160 : 0);
  const maxQuoteLines = Math.max(2, Math.floor((available - fixedH - gap) / quoteLineH));
  const quoteLines = quote ? wrapLines(ctx, quote, innerW, maxQuoteLines) : [];
  const quoteH = quoteLines.length ? quoteLines.length * quoteLineH + gap : 0;
  const cardH = fixedH + quoteH;

  let y = Math.max(margin, Math.round((height - headerH - cardH) / 2));

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${isStory ? 64 : 50}px ${FONT}`;
  for (const line of nameLines) {
    y += nameLineH;
    ctx.fillText(line, width / 2, y - nameLineH * 0.2);
  }
  ctx.font = `500 ${isStory ? 36 : 30}px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  y += subtitleGap;
  ctx.fillText(subtitle, width / 2, y);
  y += cardGap;

  // ── La tarjeta blanca ──
  const cardY = y;
  ctx.save();
  ctx.shadowColor = 'rgba(26, 38, 57, 0.22)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundedRect(ctx, cardX, cardY, cardW, cardH, isStory ? 48 : 40);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  let cy = cardY + pad;

  // Estrellas, centradas.
  const stars = Math.max(0, Math.min(5, Math.round(rating || 0)));
  const starGap = starSize * 0.7;
  const rowW = 5 * starSize * 2 + 4 * starGap;
  let sx = width / 2 - rowW / 2 + starSize;
  for (let i = 0; i < 5; i += 1) {
    drawStar(ctx, sx, cy + starSize, starSize, i < stars ? GOLD : EMPTY_STAR);
    sx += starSize * 2 + starGap;
  }
  cy += starSize * 2 + gap;

  // El texto de la reseña.
  ctx.textAlign = 'left';
  ctx.fillStyle = NAVY;
  ctx.font = `500 ${quoteSize}px ${FONT}`;
  for (const line of quoteLines) {
    cy += quoteSize;
    ctx.fillText(line, cardX + pad, cy);
    cy += quoteLineH - quoteSize;
  }
  if (quoteLines.length) cy += gap;

  // Autor y fecha.
  ctx.textAlign = 'center';
  ctx.fillStyle = NAVY;
  ctx.font = `700 ${authorSize}px ${FONT}`;
  cy += authorSize;
  ctx.fillText(author, width / 2, cy);
  ctx.fillStyle = GREY;
  ctx.font = `500 ${metaSize}px ${FONT}`;
  cy += 14 + metaSize;
  const meta = ['Reseña en Google', formatLongDate(date)].filter(Boolean).join(' · ');
  ctx.fillText(meta, width / 2, cy);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No pudimos armar la imagen'))), 'image/png');
  });
}
