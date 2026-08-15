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
