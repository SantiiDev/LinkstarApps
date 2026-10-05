import GoogleGate from '../../components/GoogleGate/GoogleGate';
import ReportsSentimentMockup from './ReportsSentimentMockup';

/*
 * Depende de dos cosas encadenadas: primero tiene que existir el TEXTO de cada
 * reseña (fase 4.4, que necesita la conexión con Google), y recién después se
 * le puede pasar un modelo por arriba (fase 5). Sin texto no hay nada sobre qué
 * correr un análisis — no es que falte el modelo, falta el insumo.
 *
 * Hasta entonces la pantalla es la maqueta de `ReportsSentimentMockup`, borrosa
 * y bloqueada detrás de `GoogleGate`.
 */

export default function ReportsSentiment() {
  return (
    <GoogleGate
      description="El análisis de sentimiento se corre sobre lo que escriben tus clientes. Sin la conexión con Google no tenemos ese texto, y sin texto no hay nada que analizar."
      benefits={[
        'Qué proporción de tus reseñas son positivas, neutras o negativas.',
        'Cómo se mueve ese ánimo mes a mes.',
        'Los temas que más se repiten, separados por los que suman y los que restan.',
        'Qué sucursal concentra las quejas.',
      ]}
      note="El análisis se calcula una sola vez, cuando la reseña entra, y se guarda. No se recalcula cada vez que abrís la pantalla."
    >
      <ReportsSentimentMockup />
    </GoogleGate>
  );
}
