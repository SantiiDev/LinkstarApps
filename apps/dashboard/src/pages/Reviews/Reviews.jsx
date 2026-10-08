import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import ReviewsMockup from './ReviewsMockup';
import ReviewsScreen from './ReviewsScreen';

/*
 * Reseñas es la primera de las siete secciones de Google que sale del modal.
 *
 *   sin Google conectado → GoogleGate con ReviewsMockup de fondo, igual que
 *                          antes: la maqueta sigue siendo la invitación para
 *                          quien todavía no conectó (ver GoogleGate para por qué
 *                          un número inventado ahí dentro no rompe la regla).
 *   conectado            → ReviewsScreen, contra `google_reviews` y
 *                          `google_locations` (0024/0025). También en
 *                          'needs_reauth': lo guardado se sigue mostrando, con un
 *                          aviso para reconectar.
 *
 * Mientras se averigua el estado se muestra el modal y no la pantalla: mostrar
 * una pantalla vacía y reemplazarla por el modal medio segundo después se lee
 * como un error.
 *
 * Es también la página a la que vuelve el navegador después de autorizar en
 * Google (?google=…, RETURN_PATH en services/api/routes/google.js). Ese mensaje
 * lo muestra GoogleConnect, que está tanto en el modal como en el aviso de
 * reconexión de la pantalla real.
 *
 * `reviews` sigue en GOOGLE_GATED_SECTIONS (lib/routes.js): sin conexión el aviso
 * de suscripción quedaría detrás del modal. Con conexión también se oculta; es
 * un costo chico frente a que AppShell tenga que consultar Google en cada
 * sección.
 */

export default function ReviewsPage({ onNavigateSettings, initialFilter }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <ReviewsScreen google={google} onNavigateSettings={onNavigateSettings} initialFilter={initialFilter} />;
  }

  return (
    <GoogleGate
      description="Los expositores mandan gente a dejar reseñas, pero para leerlas necesitamos permiso sobre tu ficha. Google no las comparte de otra forma."
      benefits={[
        'Cada reseña completa: quién la dejó, cuántas estrellas y qué escribió.',
        'Cuáles siguen sin responder, y responderlas desde el panel.',
        'Filtrar por sucursal, por puntaje o por estado de respuesta.',
        'Avisos cuando entra una reseña negativa.',
      ]}
      note="Mientras tanto, en Dispositivos y Gestión local vas a ver reseñas «estimadas»: se calculan por la diferencia del contador de tu ficha día a día, que es lo único medible sin la conexión."
    >
      <ReviewsMockup />
    </GoogleGate>
  );
}
