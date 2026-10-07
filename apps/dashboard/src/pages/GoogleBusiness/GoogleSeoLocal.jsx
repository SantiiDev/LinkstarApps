import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import GoogleSeoLocalMockup from './GoogleSeoLocalMockup';
import GoogleSeoLocalScreen from './GoogleSeoLocalScreen';

/*
 * SEO Local → Análisis SEO — sale del modal como Métricas y Reseñas (fase 4.8).
 *
 *   sin Google conectado → GoogleGate con GoogleSeoLocalMockup de fondo.
 *   conectado            → GoogleSeoLocalScreen, sobre GET /api/google/seo.
 *
 * Google NO expone una API de «puntaje SEO»: el número de la pantalla real es
 * propio (services/api/lib/seoAudit.js) y cada punto dice de qué dato sale. Por
 * eso el texto del modal no promete un puntaje de Google.
 *
 * A diferencia de Métricas, acá 'needs_reauth' también va a la pantalla real,
 * pero el análisis se hace sobre la ficha EN VIVO: sin token no hay nada que
 * mostrar, y la pantalla lo dice con el botón para reconectar.
 */
export default function GoogleSeoLocal({ onNavigateSection }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <GoogleSeoLocalScreen google={google} onNavigateSection={onNavigateSection} />;
  }

  return (
    <GoogleGate
      description="El análisis se hace sobre lo que tenés cargado en Google Business Profile. Sin la conexión no hay nada que revisar."
      benefits={[
        'Qué le falta a tu ficha: categoría, horarios, fotos, descripción.',
        'Hace cuánto que no publicás y qué tan rápido respondés reseñas.',
        'Un puntaje por categoría, con lo que suma cada punto y cómo subirlo.',
        'Cómo se compara cada una de tus sucursales.',
      ]}
      note="Google no publica un «puntaje de SEO local»: ese número no existe como dato. El que vas a ver es nuestro y te dice de dónde sale cada punto."
    >
      <GoogleSeoLocalMockup />
    </GoogleGate>
  );
}
