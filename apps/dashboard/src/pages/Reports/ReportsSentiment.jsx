import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import ReportsSentimentMockup from './ReportsSentimentMockup';
import ReportsSentimentScreen from './ReportsSentimentScreen';
import { SentimentPitch } from './ReportsPitches';

/*
 * Sentimiento — sale del modal como salieron Reseñas y Métricas (fase 5).
 *
 *   plan gratis          → SentimentPitch (el modal de ventas de Business) con
 *                          ReportsSentimentMockup de fondo, esté o no conectada
 *                          la ficha: es una sección de Business.
 *   Business sin Google  → GoogleGate con la misma maqueta: sin la conexión no
 *                          tenemos el texto de las reseñas, y sin texto no hay
 *                          nada que analizar.
 *   Business conectado   → ReportsSentimentScreen, sobre v_review_analysis
 *                          (0033). También en 'needs_reauth': lo ya analizado
 *                          se sigue mostrando, con un aviso para reconectar.
 *
 * Mientras se averigua el estado se muestra el modal, no la pantalla (mismo
 * criterio que GoogleMetrics). El corte de verdad lo hace la base (RLS de
 * google_review_analysis, 0033): esto sólo decide qué se dibuja.
 */
export default function ReportsSentiment({ onNavigateSettings, onNavigateSection }) {
  const { org, isBusiness } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!isBusiness) {
    return (
      <SentimentPitch>
        <ReportsSentimentMockup />
      </SentimentPitch>
    );
  }

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return (
      <ReportsSentimentScreen
        google={google}
        onNavigateSettings={onNavigateSettings}
        onNavigateSection={onNavigateSection}
      />
    );
  }

  return (
    <GoogleGate
      description="El análisis de sentimiento se corre sobre lo que escriben tus clientes. Sin la conexión con Google no tenemos ese texto, y sin texto no hay nada que analizar."
      benefits={[
        'Qué proporción de tus reseñas son positivas, neutras o negativas.',
        'Cómo se mueve ese ánimo semana a semana o mes a mes.',
        'Las palabras que más repiten tus clientes, separadas por tono.',
        'Qué sucursal concentra las quejas.',
      ]}
      note="El análisis se calcula una sola vez, cuando la reseña entra, y se guarda. No se recalcula cada vez que abrís la pantalla."
    >
      <ReportsSentimentMockup />
    </GoogleGate>
  );
}
