import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// ──────────────────────────────────────────────────────────
// POST /api/auth/login-event
// El frontend la llama justo después de un login/registro exitoso
// (evento SIGNED_IN de Supabase Auth). Actualiza profiles.last_login_at
// con el cliente service_role — el cliente nunca escribe esta columna
// directamente, igual que el resto de escrituras de confianza acá.
// ──────────────────────────────────────────────────────────
router.post('/api/auth/login-event', requireAuth(supabase), async (req, res) => {
  const { error } = await supabase
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', req.user.id);

  if (error) {
    console.error('Error actualizando last_login_at:', error);
    return res.status(500).json({ error: 'No se pudo registrar el login' });
  }

  res.sendStatus(204);
});

export default router;
