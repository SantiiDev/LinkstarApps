import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import ReportsKeywordsMockup from './ReportsKeywordsMockup';
import ReportsKeywordsScreen from './ReportsKeywordsScreen';

/*
 * Palabras clave — sale del modal junto con Sentimiento (fase 5, 0033). Mismo
 * recorrido: sin Google, GoogleGate con la maqueta; conectado (o en
 * 'needs_reauth'), ReportsKeywordsScreen sobre v_review_analysis.
 *
 * Ojo con no confundir esta pantalla con la de SEO Local ni con «Búsquedas que
 * mostraron tu perfil» de Métricas: acá las palabras salen de lo que ESCRIBEN
 * tus clientes; allá, de lo que BUSCA la gente en Google. Son dos fuentes
 * distintas.
 */
export default function ReportsKeywords({ onNavigateSettings }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <ReportsKeywordsScreen google={google} onNavigateSettings={onNavigateSettings} />;
  }

  return (
    <GoogleGate
      description="Para saber qué repiten tus clientes hay que leer lo que escribieron. Eso llega con la conexión a tu ficha de Google."
      benefits={[
        'Lo que más gusta a tus clientes y lo que necesita mejorar, en un ranking.',
        'Un resumen en una frase de tus fortalezas y tus puntos débiles.',
        'Las reseñas que mencionan cada palabra, con la palabra resaltada.',
        'Cuándo algo que gusta también recibe quejas.',
      ]}
      note="No es lo mismo que SEO Local: acá se mide lo que dicen tus clientes, allá lo que busca la gente en Google."
    >
      <ReportsKeywordsMockup />
    </GoogleGate>
  );
}
