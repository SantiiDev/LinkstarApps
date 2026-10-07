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
        'Qué términos aparecen más seguido en tus reseñas.',
        'Cuáles vienen acompañados de elogios y cuáles de quejas.',
        'Cómo cambia el vocabulario de tus clientes a lo largo del tiempo.',
        'Qué palabras te conviene sumar a la descripción de tu ficha.',
      ]}
      note="No es lo mismo que SEO Local: acá se mide lo que dicen tus clientes, allá lo que busca la gente en Google."
    >
      <ReportsKeywordsMockup />
    </GoogleGate>
  );
}
