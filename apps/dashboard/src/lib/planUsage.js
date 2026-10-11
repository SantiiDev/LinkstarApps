import { supabase } from './supabaseClient';
import { requireOrg } from './dashboardApi';
import { fetchOrgMembers, fetchPendingInvitations } from './teamApi';

/*
 * Cuánto de su plan está usando la organización: lo que muestra el bloque «Tu
 * plan» de Configuración → Plan.
 *
 * Los límites salen de `plans`, la fuente de verdad (igual que fetchMemberLimit
 * de teamApi.js): ningún número se escribe en React. `null` es ilimitado
 * (Enterprise), y no es lo mismo que 0.
 *
 * Cada uso se cuenta como lo cuenta la base al hacer cumplir el límite, para que
 * la pantalla no diga «te queda uno» cuando la base ya va a rechazar el próximo:
 *   - ubicaciones: `locations` sin borrar (enforce_plan_limit, 0007);
 *   - expositores: `devices` sin borrar (claim_device, 0007);
 *   - miembros: miembros + invitaciones pendientes, el mismo `used` de
 *     TeamMembers.jsx (invite_member, 0020, también suma las pendientes).
 *
 * Es para owner/admin: a un manager la RLS le acota las sucursales que ve, y las
 * invitaciones sólo las lee owner/admin, así que para él los números saldrían
 * bajos. La pantalla no se lo muestra.
 */

async function countRows(table, organizationId) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchPlanUsage(organizationId, planCode) {
  requireOrg(organizationId);

  const [planResult, locations, devices, members, invitations] = await Promise.all([
    supabase
      .from('plans')
      .select('max_locations, max_devices, max_members, data_retention_days')
      .eq('code', planCode)
      .maybeSingle(),
    countRows('locations', organizationId),
    countRows('devices', organizationId),
    fetchOrgMembers(),
    fetchPendingInvitations(organizationId),
  ]);

  if (planResult.error) throw planResult.error;
  const plan = planResult.data ?? {};

  return {
    locations: { used: locations, limit: plan.max_locations ?? null },
    devices: { used: devices, limit: plan.max_devices ?? null },
    members: { used: members.length + invitations.length, limit: plan.max_members ?? null },
    retentionDays: plan.data_retention_days ?? null,
  };
}
