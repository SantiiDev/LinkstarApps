import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validateBody } from '../lib/validation.js';
import { sendContactMessage } from '../lib/email.js';

const router = Router();

// Más ajustado que el de pagos: una persona con una consulta manda uno, dos si
// se equivocó. Este límite es la razón de ser de la ruta — el formulario del
// navegador no tenía ninguno, y la access_key estaba a la vista en el bundle.
const contactLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas seguidas. Probá de nuevo en un rato.' },
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1).max(5000),
});

// ──────────────────────────────────────────────────────────
// POST /api/contact
// ──────────────────────────────────────────────────────────
router.post('/api/contact', contactLimiter, validateBody(contactSchema), async (req, res) => {
  try {
    await sendContactMessage(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error sending contact message:', err);
    res.status(500).json({ error: 'No pudimos enviar tu consulta. Probá de nuevo en unos minutos.' });
  }
});

export default router;
