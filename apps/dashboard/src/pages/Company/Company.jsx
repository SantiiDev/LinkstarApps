import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import CompanyMockup from './CompanyMockup';
import CompanyScreen from './CompanyScreen';

/*
 * Mi Empresa — la pantalla post-login.
 *
 *   sin Google conectado → GoogleGate con CompanyMockup de fondo, igual que
 *                          Reseñas y Métricas: casi todo lo de esta pantalla sale
 *                          de las reseñas de la ficha, y sin la conexión no hay
 *                          de dónde leerlas.
 *   conectado            → CompanyScreen, contra google_reviews y compañía. También
 *                          en 'needs_reauth': lo guardado se sigue mostrando, con
 *                          un aviso para reconectar.
 *
 * Mientras se averigua el estado se muestra el modal, no la pantalla: una
 * pantalla vacía reemplazada por el modal medio segundo después se lee como un
 * error. `company` está en GOOGLE_GATED_SECTIONS (lib/routes.js) por lo mismo
 * que las otras: el aviso de suscripción quedaría detrás del modal.
 */
export default function Company({ onNavigate }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <CompanyScreen google={google} onNavigate={onNavigate} />;
  }

  return (
    <GoogleGate
      description="Tu resumen sale de las reseñas de tu ficha de Google: cuántas entran, cómo te puntúan y cuáles faltan responder. Para leerlas necesitamos que conectes tu cuenta."
      benefits={[
        'Tus reseñas, cuántas respondiste y cuáles negativas siguen sin respuesta.',
        'Tu media de estrellas y cuántas reseñas de 5★ te faltan para subirla.',
        'El sentimiento de lo que escriben tus clientes y tu puntaje de SEO local.',
        'Cada sucursal comparada: escaneos, reseñas, respuestas y puntuación.',
      ]}
      note="Los escaneos de tus expositores se siguen midiendo igual: los ves en Dispositivos y, con la ficha conectada, también en el resumen por local."
    >
      <CompanyMockup />
    </GoogleGate>
  );
}
