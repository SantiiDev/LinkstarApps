import GoogleGate from '../../components/GoogleGate/GoogleGate';
import GoogleMetricsMockup from './GoogleMetricsMockup';

/*
 * El dato real sale de la Business Profile Performance API, que es parte del
 * trámite de acceso a las APIs de Google Business (fase 4 del roadmap). No hay
 * forma de aproximarlo desde los escaneos: un escaneo es alguien que ya está en
 * el local con el expositor en la mano, y esto mide a los que te encontraron
 * buscando.
 *
 * Hasta entonces la pantalla es la maqueta de `GoogleMetricsMockup`, borrosa y
 * bloqueada detrás de `GoogleGate`.
 */

export default function GoogleMetrics() {
  return (
    <GoogleGate
      description="Estos números los publica Google sobre tu ficha, no salen de los expositores. Para leerlos necesitamos que conectes tu cuenta."
      benefits={[
        'Cuántas veces apareciste en búsquedas y en el mapa.',
        'Cuántos te llamaron, pidieron cómo llegar o entraron a tu web.',
        'Con qué términos te encontraron los que no te estaban buscando por nombre.',
        'Cómo se mueve todo eso mes a mes, y por sucursal.',
      ]}
      note="Es información distinta de la de Dispositivos: los escaneos miden a quien ya está en tu local, esto mide a quien todavía te está buscando."
    >
      <GoogleMetricsMockup />
    </GoogleGate>
  );
}
