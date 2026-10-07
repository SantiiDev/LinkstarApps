import GoogleGate from '../../components/GoogleGate/GoogleGate';
import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import GoogleMetricsMockup from './GoogleMetricsMockup';
import GoogleMetricsScreen from './GoogleMetricsScreen';

/*
 * Métricas — sale del modal como salió Reseñas (fase 4.6).
 *
 *   sin Google conectado → GoogleGate con GoogleMetricsMockup de fondo.
 *   conectado            → GoogleMetricsScreen, contra google_metrics_daily()
 *                          (0029). También en 'needs_reauth': lo guardado se
 *                          sigue mostrando, con un aviso para reconectar.
 *
 * Mientras se averigua el estado se muestra el modal, no la pantalla: una
 * pantalla vacía reemplazada por el modal medio segundo después se lee como un
 * error. Los números de Métricas los publica Google sobre la ficha; no se pueden
 * aproximar desde los escaneos (un escaneo es alguien que ya está en el local).
 */
export default function GoogleMetrics({ onNavigateSettings }) {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);
  const status = google.connection?.status;

  if (!google.loading && (status === 'active' || status === 'needs_reauth')) {
    return <GoogleMetricsScreen google={google} onNavigateSettings={onNavigateSettings} />;
  }

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
