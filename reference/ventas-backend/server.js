import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URLS = (process.env.FRONTEND_URL || 'http://localhost:5174')
  .split(',')
  .map(u => u.trim());

app.use(helmet());
app.use(cors({ origin: FRONTEND_URLS }));
app.use(express.json());

// Un tap de NFC/QR legítimo es, como mucho, unos pocos por minuto y por IP
// (una persona tocando el expositor). Esto no frena el uso normal, sólo
// scraping/enumeración de public_id y floods.
const scanLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Supabase ─────────────────────────────────────────────
// El schema en supabase/migrations/0006_rls.sql niega insert/update/delete
// sobre `orders` y ejecución de `resolve_scan` a `anon`/`authenticated` a
// propósito: sólo un cliente de confianza (este backend) puede escribir ahí.
// Por eso este cliente usa la service_role key, no la publishable/anon.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️  Falta SUPABASE_SERVICE_ROLE_KEY en .env — las escrituras a `orders` y ' +
    'las funciones resolve_scan/record_webhook_event van a fallar por RLS. ' +
    'Buscala en el dashboard de Supabase: Project Settings → API → service_role secret.'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ─── Routes ───────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────
// GET /d/:publicId
// Resuelve un toque de NFC/QR: llama a resolve_scan() (SECURITY DEFINER,
// sólo service_role) y redirige. SIEMPRE responde con un destino, incluso
// si algo falla — ver supabase/migrations/0007_functions_and_jobs.sql.
// ──────────────────────────────────────────────────────────
app.get('/d/:publicId', scanLimiter, async (req, res) => {
  const fallback = 'https://linkstar.com.ar';
  try {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();

    const { data, error } = await supabase.rpc('resolve_scan', {
      p_public_id: req.params.publicId,
      p_ip: ip || null,
      p_user_agent: req.headers['user-agent'] || null,
      p_referrer: req.headers['referer'] || null,
    });

    if (error) throw error;

    return res.redirect(302, data?.destination || fallback);
  } catch (err) {
    console.error('Error resolviendo escaneo:', err);
    return res.redirect(302, fallback);
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/orders y GET /api/orders/:orderNumber — desactivados a
// propósito. El checkout actual no los llama (ver Checkout.jsx) y el
// pago/checkout real se va a reconstruir desde cero con la pasarela de
// pago más adelante. Antes de reactivarlos: validar precio/cantidad de
// cada item contra el catálogo real (no confiar en el precio que manda
// el cliente) y exigir auth para leer una orden por número, ya que hoy
// exponía nombre/email/teléfono/dirección del comprador sin autenticar.
// ──────────────────────────────────────────────────────────

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║   🚀  Linkstar Backend running            ║
  ║   📍  http://localhost:${PORT}              ║
  ║   🔗  Frontend: ${FRONTEND_URLS.join(', ')}    ║
  ╚════════════════════════════════════════════╝
  `);
});
