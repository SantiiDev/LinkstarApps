import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import './MonthlyReports.css';

/*
 * variant="soon": no la destraba conectar Google, la destraba que exista la
 * generación de PDF, el almacenamiento y el envío (fase 7 del roadmap).
 *
 * Antes había seis informes descargables de meses que nunca ocurrieron, con
 * botón "Descargar PDF" que no bajaba nada. Un botón que no hace nada es peor
 * que no tenerlo: el cliente lo aprieta y cree que se le rompió algo.
 */

/* Recuperar la maqueta ─────────────────────────────────────────
 * El JSX que había acá no se perdió: está completo —grillas, tablas y
 * gráficos— en el tag `maquetas-pre-fase-2`, y el CSS de esta pantalla sigue
 * en el repo sin tocar. Los dos juntos son el punto de partida para rehacerla.
 *
 *   git show maquetas-pre-fase-2:apps/dashboard/src/pages/MonthlyReports/MonthlyReports.jsx
 *
 * Que la fuente de datos exista NO devuelve esta pantalla sola: hay que volver
 * a escribir el JSX contra el dato real. El tag es de dónde copiarlo.
 */

export default function MonthlyReports() {
  return (
    <div className="mreports-page">
      <PageHeader
        eyebrow="Informes"
        title="Informes mensuales"
        subtitle="Un resumen ejecutivo de tu desempeño, listo para descargar cada mes"
      />

      <SectionPlaceholder
        variant="soon"
        title="Los informes mensuales todavía no se generan"
        description="Es de las últimas cosas que armamos, porque un informe resume todo lo demás: mientras falten piezas, resumiría medias verdades."
        preview={[
          'Un PDF por mes con escaneos, reseñas y conversión.',
          'Comparación contra el mes anterior y contra el mismo mes del año pasado.',
          'Desglose por sucursal y por expositor.',
          'Envío automático por email apenas cierra el mes.',
        ]}
        note="Mientras tanto, los números de Dispositivos y Gestión local ya son reales y podés mirarlos cuando quieras."
      />
    </div>
  );
}
