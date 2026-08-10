import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Medio físico del toque, indicado por el sufijo ?s= en la URL grabada en
// cada soporte: el QR impreso lleva ?s=q, el chip NFC lleva ?s=n. Mismo
// public_id, distinta URL según dónde se imprimió/grabó.
const SCAN_MEDIUM_BY_QUERY_PARAM = { q: 'qr', n: 'nfc' };

// ──────────────────────────────────────────────────────────
// GET /d/:publicId
// Resuelve un toque de NFC/QR: llama a resolve_scan() (SECURITY DEFINER,
// sólo service_role) y redirige. SIEMPRE responde con un destino, incluso
// si algo falla — ver supabase/migrations/0007_functions_and_jobs.sql.
// ──────────────────────────────────────────────────────────
router.get('/d/:publicId', async (req, res) => {
  const fallback = 'https://linkstar.com.ar';
  try {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();
    const medium = SCAN_MEDIUM_BY_QUERY_PARAM[req.query.s] || null;

    const { data, error } = await supabase.rpc('resolve_scan', {
      p_public_id: req.params.publicId,
      p_ip: ip || null,
      p_user_agent: req.headers['user-agent'] || null,
      p_referrer: req.headers['referer'] || null,
      p_medium: medium,
    });

    if (error) throw error;

    return res.redirect(302, data?.destination || fallback);
  } catch (err) {
    console.error('Error resolviendo escaneo:', err);
    return res.redirect(302, fallback);
  }
});

export default router;
