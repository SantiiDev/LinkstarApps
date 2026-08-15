import { supabase } from './supabaseClient';
import { invitationPath } from './routes';

/* Equipo de la organización: miembros que INICIAN SESIÓN en el panel.
 *
 * Ojo con el nombre, porque en este repo "equipo" son dos cosas distintas y
 * mezclarlas es fácil:
 *
 *   memberships  las personas que entran al panel, con rol owner/admin/
 *                manager/viewer. Es esto.
 *   employees    el mozo, el cajero — existen para atribuirle escaneos a
 *                alguien (v_employee_leaderboard). No inician sesión, no tienen
 *                usuario, y viven en pages/Employees/.
 *
 * Las dos se muestran en la pestaña "Equipo" de Configuración, una arriba de la
 * otra, y cada bloque dice cuál es cuál.
 *
 * Todo pasa por RPC y no por consultas sueltas, por los mismos motivos que
 * my_org_context(): el email vive en auth.users —que PostgREST no expone— y la
 * organización activa hay que elegirla con la misma regla en todos lados. La
 * excepción es `invitations`, que sí se lee y se revoca directo porque su RLS
 * del 0006 ya la limita a owner/admin de la organización.
 */

export const ROLE_LABELS = {
  owner: 'Propietario',
  admin: 'Administrador',
  manager: 'Encargado',
  viewer: 'Sólo lectura',
};

/* Lo que puede elegir quien invita. `owner` no está y no es un olvido: el
 * traspaso de propiedad es su propio trámite, no un valor más del desplegable,
 * y la RPC lo rechaza aunque alguien lo mande a mano. */
export const ASSIGNABLE_ROLES = [
  { value: 'admin', label: ROLE_LABELS.admin, hint: 'Gestiona ubicaciones, dispositivos, equipo y facturación.' },
  { value: 'manager', label: ROLE_LABELS.manager, hint: 'Opera las ubicaciones que le asignes. No ve las demás.' },
  { value: 'viewer', label: ROLE_LABELS.viewer, hint: 'Mira métricas y reseñas. No modifica nada.' },
];

/* Cuántos miembros permite el plan. `null` es ilimitado (enterprise), y hay que
 * distinguirlo de 0 — por eso no se puede usar `?? 0` en el consumidor.
 * Sale de `plans`, que es la fuente de verdad de los límites igual que de los
 * precios; el número no se escribe en React. */
export async function fetchMemberLimit(planCode) {
  if (!planCode) return null;
  const { data, error } = await supabase
    .from('plans')
    .select('max_members')
    .eq('code', planCode)
    .maybeSingle();

  if (error) throw error;
  return data?.max_members ?? null;
}

export async function fetchOrgMembers() {
  const { data, error } = await supabase.rpc('list_org_members');
  if (error) throw error;
  return data ?? [];
}

/* Sólo las pendientes y sin vencer. La RLS ya acota a las organizaciones donde
 * el usuario es owner/admin, pero se filtra igual por organización activa: para
 * alguien que administra dos cuentas, la política deja ver las dos y esta
 * pantalla habla de una sola. */
export async function fetchPendingInvitations(organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, role, status, expires_at, created_at')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/* Devuelve { invitationId, token, expiresAt, link }.
 *
 * `token` es el texto plano y es la ÚNICA vez que se puede leer: en la base
 * queda sólo su sha256. Si quien invita pierde el link, la salida es revocar y
 * volver a invitar, no recuperarlo. */
export async function inviteMember(email, role) {
  const { data, error } = await supabase.rpc('invite_member', {
    p_email: email,
    p_role: role,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row?.token) {
    throw new Error('La invitación se creó pero no devolvió el enlace. Revocala y volvé a intentar.');
  }

  return {
    invitationId: row.invitation_id,
    token: row.token,
    expiresAt: row.expires_at,
    link: buildInvitationLink(row.token),
  };
}

/* El link se arma contra el origin actual y no contra una constante: el
 * dashboard todavía no tiene dominio propio, así que en desarrollo tiene que
 * salir localhost:5173 y en producción el que sea. Cuando haya deploy, esto
 * sigue funcionando sin tocarse. */
export function buildInvitationLink(token) {
  return `${window.location.origin}${invitationPath(token)}`;
}

export async function revokeInvitation(invitationId) {
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);
  if (error) throw error;
}

export async function setMemberRole(membershipId, role) {
  const { error } = await supabase.rpc('set_member_role', {
    p_membership_id: membershipId,
    p_role: role,
  });
  if (error) throw error;
}

/* Quitar a alguien del equipo es borrar su membership. La política
 * memberships_delete del 0006 deja hacerlo a owner/admin, y protect_last_owner()
 * del 0002 impide que la organización se quede sin propietario. */
export async function removeMember(membershipId) {
  const { error } = await supabase.from('memberships').delete().eq('id', membershipId);
  if (error) throw error;
}

/* Canjea el token. Devuelve el organization_id al que se sumó el usuario.
 * Exige sesión iniciada con el mismo email de la invitación — la RPC lo compara
 * contra el JWT, no contra lo que diga el cliente. */
export async function acceptInvitation(token) {
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------------------
 * Registro de actividad
 *
 * Sale de `audit_log` (0004), que existe desde el principio. Hasta la 0020 el
 * único que escribía ahí era `claim_device()`, así que una cuenta nueva ve una
 * o dos líneas — eso es correcto y es distinto de "no hay registro": lo que se
 * anota es lo que efectivamente pasó. La 0020 suma los movimientos de equipo.
 *
 * La RLS del 0006 lo limita a owner/admin, que es la gente que puede auditar.
 * ------------------------------------------------------------------------- */
const AUDIT_ACTION_LABELS = {
  'device.claimed': 'Vinculó un expositor',
  'member.invited': 'Invitó a alguien al equipo',
  'member.role_changed': 'Cambió el rol de un miembro',
};

export async function fetchAuditLog(organizationId, limit = 20) {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, entity_type, metadata, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/* Una acción desconocida se muestra con su código crudo en vez de esconderse:
 * si mañana alguien agrega un `insert into audit_log` y se olvida de la
 * etiqueta, es mejor ver 'location.deleted' que no ver la línea. */
export function auditActionLabel(row) {
  const base = AUDIT_ACTION_LABELS[row.action] || row.action;
  const email = row.metadata?.email;
  if (row.action === 'member.invited' && email) return `Invitó a ${email} al equipo`;
  if (row.action === 'member.role_changed' && row.metadata?.to) {
    return `Cambió un rol a ${ROLE_LABELS[row.metadata.to] || row.metadata.to}`;
  }
  return base;
}

/* Traduce lo que devuelve Postgres a algo que se pueda leer en pantalla.
 * Los `hint` los pone la 0020 justamente para no tener que adivinar por el
 * texto del mensaje, que cambia. */
export function invitationErrorMessage(error) {
  if (!error) return null;

  const hint = error.hint || '';
  if (hint === 'plan_limit_reached') return error.message;
  if (hint === 'already_member') return 'Esa persona ya forma parte de tu equipo.';
  if (hint === 'owner_by_invitation') return 'No se puede invitar a alguien como propietario.';

  const code = error.code || '';
  if (code === 'P0002') return 'Esta invitación no existe, ya se usó o venció. Pedile al dueño de la cuenta que te mande una nueva.';
  if (code === '42501') return 'Esta invitación es para otra dirección de correo. Iniciá sesión con la cuenta a la que te invitaron.';
  if (code === '22023') return 'Revisá el correo que escribiste.';

  return error.message || 'No pudimos completar la operación. Probá de nuevo.';
}

/* "Vence en 6 días" es más útil que una fecha: lo que importa es cuánto queda,
 * y las invitaciones duran 7 días desde el 0002. */
export function expiryLabel(isoString) {
  if (!isoString) return '';
  const ms = new Date(isoString).getTime() - Date.now();
  if (ms <= 0) return 'Vencida';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `Vence en ${days} día${days === 1 ? '' : 's'}`;
  const hours = Math.max(1, Math.floor(ms / 3600000));
  return `Vence en ${hours} h`;
}
