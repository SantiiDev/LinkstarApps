import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import ReportsNpsMockup from './ReportsNpsMockup';
import ReportsNpsScreen from './ReportsNpsScreen';

/*
 * NPS — como Tapstar, sale del TEXTO de las reseñas, no de una encuesta.
 *
 * Hasta octubre de 2026 esta sección era un «todavía no disponible» que esperaba
 * decidir dónde hacer una pregunta de 0 a 10 (la fase 6 del roadmap). No hace
 * falta: el análisis de la fase 5 (0033) ya guarda el tono de cada reseña y de
 * cada tema, y con eso se calcula el puntaje — sin tocar el camino del tap a
 * Google.
 *
 *   sin Google conectado → GoogleGate con ReportsNpsMockup de fondo: sin la
 *                          conexión no hay reseñas que leer.
 *   conectado            → ReportsNpsScreen, sobre v_review_analysis. También
 *                          en 'needs_reauth': lo ya analizado se sigue
 *                          mostrando, con un aviso para reconectar.
 *
 * Mientras se averigua el estado se muestra el modal, no la pantalla (mismo
 * criterio que Sentimiento).
 */
export default function ReportsNps({ onNavigateSettings }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <ReportsNpsScreen google={google} onNavigateSettings={onNavigateSettings} />;
  }

  return (
    <GoogleGate
      description="El NPS se calcula sobre lo que escriben tus clientes en sus reseñas de Google. Sin la conexión no tenemos ese texto, y sin texto no hay puntaje."
      benefits={[
        'Tu NPS: cuántos clientes te recomiendan y cuántos te critican.',
        'Tu fortaleza y lo que más te resta, con sus menciones.',
        'El puntaje de cada aspecto: atención, calidad, precio, espera, ambiente y limpieza.',
        'Las reseñas que hablan de cada uno.',
      ]}
      note="No es una encuesta: cada reseña se analiza una sola vez, cuando entra, y no se le pregunta nada más a tus clientes."
    >
      <ReportsNpsMockup />
    </GoogleGate>
  );
}
