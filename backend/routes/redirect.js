import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

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

export default router;
