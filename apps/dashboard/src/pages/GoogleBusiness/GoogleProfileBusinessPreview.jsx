/*
 * MAQUETA DECORATIVA — fondo de BusinessLock en Perfil, no datos.
 *
 * Dibuja la tarjeta de protección de ficha con cambios INVENTADOS, con el mismo
 * ProtectionBlock que la tarjeta real (GoogleProfileBlocks), así la maqueta es
 * la tarjeta de verdad con otros datos. Se renderiza ÚNICAMENTE como `preview`
 * de components/BusinessLock (borrosa, inerte, con un velo que no se cierra).
 * NO agregar otro importador.
 */
import { ProtectionBlock } from './GoogleProfileBlocks';

const HOURS_AGO = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const DAYS_AGO = (d) => HOURS_AGO(d * 24);

const CHANGES = {
  pending: [{
    id: 'preview-1',
    status: 'pending',
    detected_at: HOURS_AGO(2),
    fields: ['phoneNumbers'],
    owner_values: { phoneNumbers: { primaryPhone: '0341 555-0000' } },
    google_values: { phoneNumbers: { primaryPhone: '0800 000-0000' } },
  }],
  resolved: [
    {
      id: 'preview-2',
      status: 'reverted',
      detected_at: DAYS_AGO(9),
      resolved_at: DAYS_AGO(9),
      fields: ['openInfo'],
      owner_values: { openInfo: { status: 'OPEN' } },
      google_values: { openInfo: { status: 'CLOSED_PERMANENTLY' } },
    },
    {
      id: 'preview-3',
      status: 'accepted',
      detected_at: DAYS_AGO(21),
      resolved_at: DAYS_AGO(20),
      fields: ['websiteUri'],
      owner_values: { websiteUri: 'https://tunegocio.com.ar' },
      google_values: { websiteUri: 'https://www.tunegocio.com.ar' },
    },
  ],
};

const noop = () => {};

export function ProtectionPreview() {
  return <ProtectionBlock changes={CHANGES} canEdit busyId={null} error={null} onResolve={noop} />;
}
