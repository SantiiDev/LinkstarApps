import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import GooglePostsMockup from './GooglePostsMockup';
import GooglePostsScreen from './GooglePostsScreen';

/*
 * Publicaciones — sale del modal como salió Reseñas (fase 4.7).
 *
 *   sin Google conectado → GoogleGate con GooglePostsMockup de fondo.
 *   conectado            → GooglePostsScreen (Local Posts en vivo por el API,
 *                          cupo del plan gratis en 0031).
 */
export default function GooglePosts({ onNavigateSettings }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <GooglePostsScreen google={google} onNavigateSettings={onNavigateSettings} />;
  }

  return (
    <GoogleGate
      description="Las publicaciones de Google Business aparecen en tu ficha y caducan solas. Para verlas y crearlas desde acá hace falta la conexión."
      benefits={[
        'Qué publicaciones tenés vigentes y cuándo vencen.',
        'Cuánta gente las vio y cuántos hicieron clic.',
        'Crear novedades, ofertas y eventos sin salir del panel.',
        'Programarlas para que salgan solas.',
      ]}
    >
      <GooglePostsMockup />
    </GoogleGate>
  );
}
