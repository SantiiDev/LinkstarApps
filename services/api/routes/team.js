import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { send, invitationEmail } from '../lib/mailer.js';
import { DASHBOARD_URL } from '../lib/config.js';

const router = Router();

/* Manda por correo una invitación al equipo que YA fue creada.
 *
 * La fase 3 resolvió las invitaciones con un enlace que quien invita copia y
 * manda por donde quiera, porque no había proveedor de email. Eso no cambia:
 * `invite_member()` sigue emitiendo el token, la pantalla sigue mostrando el
 * enlace copiable, y esto es un extra. Si el mail falla, el enlace sigue
 * sirviendo — por eso la respuesta no es un error fatal para el frontend.
 *
 * ── Por qué recibe el token y no la URL ───────────────────────────────────
 * El endpoint arma el enlace con DASHBOARD_URL, no con lo que mande el cliente.
 * Aceptar una URL entera convertiría esto en un relay abierto: cualquiera con
 * sesión podría hacernos enviar, desde nuestro dominio y con nuestra marca, un
 * correo con el enlace que quisiera. El token viaja igual porque el frontend ya
 * lo tiene (se lo devolvió la RPC), así que no se expone nada nuevo.
 */

const inviteMailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/* Mismo patrón que requireOrgAdmin() en routes/subscriptions.js: con
 * service_role no hay auth.uid(), así que la comprobación que normalmente hace
 * el RLS se reimplementa a mano. Invitar es de owner/admin, igual que la RPC. */
async function requireOrgAdmin(userId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const err = new Error('No administrás ninguna organización');
    err.status = 403;
    throw err;
  }
  return data.organization_id;
}

router.post(
  '/api/team/send-invitation',
  inviteMailLimiter,
  requireAuth(supabase),
  async (req, res) => {
    try {
      const { email, token } = req.body ?? {};

      if (typeof email !== 'string' || !email.includes('@') || typeof token !== 'string' || !token) {
        return res.status(400).json({ error: 'Faltan el correo o el token de la invitación' });
      }

      const orgId = await requireOrgAdmin(req.user.id);

      // Que la invitación exista, esté pendiente y sea de ESTA organización.
      // Sin esto, alguien podría pedir que mandemos un token inventado a una
      // dirección cualquiera. El token no se compara —en la base vive su
      // sha256— pero sí que haya una invitación pendiente para ese correo.
      const { data: invitation, error: invitationError } = await supabase
        .from('invitations')
        .select('id, status, expires_at')
        .eq('organization_id', orgId)
        .eq('email', email)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (invitationError) throw invitationError;
      if (!invitation) {
        return res.status(404).json({ error: 'No hay una invitación pendiente para ese correo' });
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle();

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', req.user.id)
        .maybeSingle();

      const mail = invitationEmail({
        organizationName: org?.name || 'tu equipo',
        inviterName: profile?.full_name || null,
        link: `${DASHBOARD_URL.replace(/\/$/, '')}/invitacion/${encodeURIComponent(token)}`,
      });

      const result = await send({ to: email, ...mail });

      // `simulated` es honesto: sin RESEND_API_KEY no se mandó nada, y el
      // frontend tiene que poder decirle a quien invita que siga usando el
      // enlace copiable en vez de dar por hecho que el mail salió.
      res.json({ sent: result.sent, simulated: result.simulated });
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error('Error enviando la invitación por correo:', err);
      res.status(status).json({
        error: status === 500 ? 'No se pudo enviar el correo' : err.message,
      });
    }
  }
);

export default router;
