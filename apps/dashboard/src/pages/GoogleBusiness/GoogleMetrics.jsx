import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './GoogleBusiness.css';

/*
 * Reemplaza la maqueta: acá había visitas, llamadas, clics al sitio y pedidos
 * de cómo llegar, todo con series y variaciones escritas a mano.
 *
 * El dato real sale de la Business Profile Performance API, que es parte del
 * trámite de acceso a las APIs de Google Business (fase 4 del roadmap). No hay
 * forma de aproximarlo desde los escaneos: un escaneo es alguien que ya está en
 * el local con el expositor en la mano, y esto mide a los que te encontraron
 * buscando.
 */

export default function GoogleMetrics() {
  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="Métricas de Google"
        subtitle="Cuánta gente encuentra tu negocio en Google y qué hace después"
      />

      <SectionPlaceholder
        variant="google"
        title="Todavía no podemos ver tus métricas de Google"
        description="Estos números los publica Google sobre tu ficha, no salen de los expositores. Para leerlos necesitamos que conectes tu cuenta."
        preview={[
          'Cuántas veces apareciste en búsquedas y en el mapa.',
          'Cuántos te llamaron, pidieron cómo llegar o entraron a tu web.',
          'Con qué términos te encontraron los que no te estaban buscando por nombre.',
          'Cómo se mueve todo eso mes a mes, y por sucursal.',
        ]}
        note="Es información distinta de la de Dispositivos: los escaneos miden a quien ya está en tu local, esto mide a quien todavía te está buscando."
      />
    </div>
  );
}
