import { supabase } from './supabase.js';
import { DASHBOARD_URL } from './config.js';
import { getGoogleUpdated, getLocationProfile } from './googleBusiness.js';
import { send, profileChangedEmail } from './mailer.js';

/* Protección de ficha (Business, 0030). Por cada ficha vinculada de una
 * organización Business, le pregunta a Google qué cambió por su cuenta
 * (getGoogleUpdated → diffMask):
 *
 *   - sin cambios: lo que estaba pendiente se cierra ('cleared'): Google ya no
 *     lo muestra, así que no hay nada que revertir.
 *   - con cambios: se guardan los valores de Google y los del negocio (los que
 *     devuelve locations.get), y si el cambio es nuevo se avisa por mail.
 *
 * NUNCA revierte: eso es un botón del panel. Si el cambio lo hizo el dueño desde
 * Google, revertirlo solo le pisaría su propia edición.
 *
 * El mail sigue las reglas de send-alerts.js: se registra en notification_log
 * DESPUÉS de que el proveedor lo aceptó, y uno simulado (sin RESEND_API_KEY) no
 * se registra.
 */

const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj?.[f] ?? null]));

export async function checkProfileChanges(accessToken, organizationId, linkedLocations, { dryRun = false, log = console.log } = {}) {
  const summary = { checked: 0, changes: 0, mailed: 0, failures: 0 };
  if (!linkedLocations.length) return summary;

  const { data: business, error: businessError } = await supabase.rpc('org_has_business', { p_org: organizationId });
  if (businessError) throw businessError;
  if (!business) return summary;

  if (dryRun) {
    for (const gl of linkedLocations) log(`    · ${gl.title ?? gl.google_location}: se revisarían cambios de Google`);
    return summary;
  }

  let recipient;
  let organizationName;

  for (const gl of linkedLocations) {
    try {
      summary.checked++;
      const { location: googleVersion, diffFields } = await getGoogleUpdated(accessToken, gl.google_location);

      if (!diffFields.length) {
        const { error } = await supabase.rpc('google_clear_profile_changes', { p_google_location: gl.id });
        if (error) throw error;
        continue;
      }

      const ownerVersion = await getLocationProfile(accessToken, gl.google_location);
      const { data: changeId, error } = await supabase.rpc('google_record_profile_change', {
        p_google_location: gl.id,
        p_fields: diffFields,
        p_google_values: pick(googleVersion, diffFields),
        p_owner_values: pick(ownerVersion, diffFields),
      });
      if (error) throw error;
      if (!changeId) continue;   // ya se conocía: no se avisa de nuevo

      summary.changes++;
      log(`    ⚠ ${gl.title ?? gl.google_location}: Google cambió ${diffFields.join(', ')}`);

      if (recipient === undefined) {
        const [{ data: email }, { data: org }] = await Promise.all([
          supabase.rpc('org_alert_recipient', { p_org: organizationId }),
          supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
        ]);
        recipient = email ?? null;
        organizationName = org?.name ?? '';
      }
      if (!recipient) continue;

      const payload = {
        fields: diffFields,
        location_title: gl.title ?? null,
        panel_url: DASHBOARD_URL ? new URL('/panel/google/perfil', DASHBOARD_URL).toString() : null,
      };
      const result = await send({ to: recipient, ...profileChangedEmail({ organizationName, payload }) });
      if (result.simulated) continue;

      const { error: logError } = await supabase.rpc('record_notification', {
        p_organization_id: organizationId,
        p_kind: 'profile_changed',
        p_recipient_email: recipient,
        p_entity_id: changeId,
        p_metadata: payload,
      });
      if (logError) log(`    ⚠ aviso mandado pero no registrado: ${logError.message}`);
      summary.mailed++;
    } catch (err) {
      summary.failures++;
      log(`    ✗ ${gl.title ?? gl.google_location} (protección): ${err.message}`);
    }
  }
  return summary;
}
