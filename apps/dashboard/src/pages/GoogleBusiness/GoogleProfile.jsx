import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import GoogleProfileMockup from './GoogleProfileMockup';
import GoogleProfileScreen from './GoogleProfileScreen';

/*
 * Perfil — sale del modal como salió Reseñas (fase 4.7). Es de lectura Y
 * escritura: la gracia es corregir la ficha sin ir a Google.
 *
 *   sin Google conectado → GoogleGate con GoogleProfileMockup de fondo.
 *   conectado            → GoogleProfileScreen (la ficha en vivo por el API, y la
 *                          protección de ficha de 0030). En 'needs_reauth' la
 *                          pantalla avisa: sin token no se puede leer en vivo.
 */
export default function GoogleProfile({ onNavigateSettings }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <GoogleProfileScreen google={google} onNavigateSettings={onNavigateSettings} />;
  }

  return (
    <GoogleGate
      description="Conectá tu cuenta y vas a poder ver y corregir los datos de tu ficha sin salir del panel."
      benefits={[
        'Nombre, categoría, dirección y teléfono, con el estado de verificación.',
        'Horarios normales y los especiales de feriados.',
        'Fotos y descripción del negocio.',
        'Editar cualquiera de esos campos y que se publique en Google.',
      ]}
      note="Los cambios que hagas acá se escriben en tu ficha real. Es la misma información que ve alguien buscándote en Maps."
    >
      <GoogleProfileMockup />
    </GoogleGate>
  );
}
