import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { REDIRECT_DOMAIN } from '../lib/config.js';

// ============================================================================
// Seed de prueba: organization + location con destino configurado (Google
// review vía place_id, Instagram vía handle) + un device provisionado
// asignado a esa location. Pensado para probar el flujo de /d/:publicId de
// punta a punta contra datos reales de tu cuenta de test.
//
// ADVERTENCIA: usa las credenciales de services/api/.env tal cual estén (hoy
// apuntan al proyecto Supabase de PRODUCCIÓN, no a un stack local). Corré
// esto sólo si querés escribir en esa base.
//
// Por qué no se usa claim_device() acá (aunque es la función "oficial" para
// vincular un device):
//   claim_device() valida `exists (... where user_id = auth.uid() ...)`
//   (0007_functions_and_jobs.sql) — auth.uid() se resuelve del JWT de la
//   request. Un script sin sesión de usuario real (llamando con la
//   service_role key) no tiene ese JWT, así que auth.uid() da null y el
//   chequeo de permisos siempre falla, sin importar qué organización le
//   pases. Como este cliente ya usa service_role (bypassa RLS por diseño,
//   igual que el resto del backend), replicamos acá los mismos pasos que
//   hace claim_device() puertas adentro — la única pieza que no aplica es su
//   chequeo de "sos admin/owner de esa org", que no tiene sentido para un
//   script de seed corriendo con la llave de servicio.
// ============================================================================

const ALLOWED_KINDS = ['google_review', 'instagram'];

function parseArgs() {
  const flags = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match) continue;
    flags[match[1]] = match[2];
  }

  const ownerEmail = flags['owner-email'];
  const locationId = flags['location-id'] || null;
  // Sin --location-id hacen falta place-id/instagram para crear la location.
  // Con --location-id se reusa una ya creada (por ejemplo, de una corrida
  // anterior que falló al no encontrar device) y estos quedan opcionales.
  const placeId = flags['place-id'];
  const instagram = flags['instagram'];

  if (!ownerEmail || (!locationId && (!placeId || !instagram))) {
    console.error(
      'Uso: node scripts/seed-test-device.js --owner-email=<email> --place-id=<google_place_id> --instagram=<handle_o_url> ' +
      '[--org-name="Organización de Prueba"] [--org-slug=org-de-prueba] [--location-name="Sucursal de Prueba"] [--device-kind=google_review]'
    );
    console.error('  --owner-email  cuenta ya registrada en Supabase Auth que va a quedar como owner de la org de test.');
    console.error('  --place-id     Google Place ID de la ubicación (para armar la URL de reseña, ver resolve_scan).');
    console.error('  --instagram    handle ("mi_negocio") o URL completa ("https://instagram.com/mi_negocio").');
    console.error(
      '  --location-id  reusa una organization/location ya creadas (salta el paso de creación) y sólo asigna el device.'
    );
    process.exit(1);
  }

  const deviceKind = flags['device-kind'] || 'google_review';
  if (!ALLOWED_KINDS.includes(deviceKind)) {
    console.error(`--device-kind debe ser uno de: ${ALLOWED_KINDS.join(', ')}`);
    process.exit(1);
  }

  const isInstagramUrl = /^https?:\/\//.test(instagram || '');

  return {
    ownerEmail,
    locationId,
    placeId,
    instagramHandle: !instagram || isInstagramUrl ? null : instagram.replace(/^@/, ''),
    instagramUrl: isInstagramUrl ? instagram : null,
    orgName: flags['org-name'] || 'Organización de Prueba',
    orgSlug: flags['org-slug'] || null,
    locationName: flags['location-name'] || 'Sucursal de Prueba',
    deviceKind,
  };
}

function slugify(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // saca acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`.slice(0, 40);
}

async function findOwner(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    throw new Error(`No existe ningún usuario de Supabase Auth con el email ${email}. Registrate primero desde la app.`);
  }
  return user;
}

async function createOrganization({ orgName, orgSlug, ownerId }) {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: orgName,
      slug: orgSlug || slugify(orgName),
      created_by: ownerId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createLocation({ organizationId, locationName, placeId, instagramHandle, instagramUrl }) {
  const { data, error } = await supabase
    .from('locations')
    .insert({
      organization_id: organizationId,
      name: locationName,
      google_place_id: placeId,
      instagram_handle: instagramHandle,
      instagram_url: instagramUrl,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function findLocation(locationId) {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, organization_id')
    .eq('id', locationId)
    .single();

  if (error) throw error;
  return data;
}

async function findOrganization(organizationId) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function findUnassignedDevice(kind) {
  const { data, error } = await supabase
    .from('devices')
    .select('id, public_id, claim_code')
    .eq('kind', kind)
    .eq('status', 'unassigned')
    .is('organization_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(
      `No hay devices '${kind}' sin asignar. Corré primero: npm run provision-devices -- ${kind} <cantidad>`
    );
  }
  return data;
}

// Misma actualización que hace claim_device() (0007_functions_and_jobs.sql)
// al vincular un device, sin el chequeo de auth.uid() — ver nota arriba.
async function assignDevice({ deviceId, organizationId, locationId, ownerId }) {
  const { data, error } = await supabase
    .from('devices')
    .update({
      organization_id: organizationId,
      location_id: locationId,
      status: 'active',
      claimed_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      claim_code: null,
    })
    .eq('id', deviceId)
    .select('public_id')
    .single();

  if (error) throw error;

  await supabase.from('audit_log').insert({
    organization_id: organizationId,
    actor_id: ownerId,
    action: 'device.claimed',
    entity_type: 'device',
    entity_id: deviceId,
    metadata: { source: 'seed-test-device.js' },
  });

  return data;
}

async function main() {
  const args = parseArgs();

  const owner = await findOwner(args.ownerEmail);
  console.log(`Owner: ${owner.email} (${owner.id})`);

  let org;
  let location;

  if (args.locationId) {
    location = await findLocation(args.locationId);
    org = await findOrganization(location.organization_id);
    console.log(`Reusando organization: ${org.name} — slug=${org.slug} id=${org.id}`);
    console.log(`Reusando location: ${location.name} — id=${location.id}`);
  } else {
    org = await createOrganization({ orgName: args.orgName, orgSlug: args.orgSlug, ownerId: owner.id });
    console.log(`Organization: ${org.name} — slug=${org.slug} id=${org.id}`);

    location = await createLocation({
      organizationId: org.id,
      locationName: args.locationName,
      placeId: args.placeId,
      instagramHandle: args.instagramHandle,
      instagramUrl: args.instagramUrl,
    });
    console.log(`Location: ${location.name} — id=${location.id}`);
  }

  const device = await findUnassignedDevice(args.deviceKind);
  const assigned = await assignDevice({
    deviceId: device.id,
    organizationId: org.id,
    locationId: location.id,
    ownerId: owner.id,
  });

  console.log('\nListo. Resumen:\n');
  console.table([{
    organization: `${org.name} (${org.slug})`,
    location: location.name,
    device_kind: args.deviceKind,
    public_id: assigned.public_id,
    redirect_url: `https://${REDIRECT_DOMAIN}/d/${assigned.public_id}`,
  }]);
  console.log(`\nLogueate como ${owner.email} en la app para ver esta org en el dashboard.`);
}

main().catch((err) => {
  console.error('Error creando el seed de prueba:', err.message || err);
  process.exit(1);
});
