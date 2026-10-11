/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Se renderiza ÚNICAMENTE como `children` de BusinessPitch (MonthlyReportsPitch),
 * que la deja borrosa, inerte y detrás de un modal que no se puede cerrar. NO
 * agregar otro importador: fuera de esa puerta es una pantalla inventando
 * informes.
 *
 * Es la pantalla real (MonthlyReportsScreen) dibujada con los mismos bloques
 * (MonthlyReportsBlocks) y datos INVENTADOS (monthlyReportsSample.js), sin
 * «Próximamente»: así se va a ver para Business cuando los informes se generen.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import { AutoGenerationNotice, EmailDeliveryCard, LocationReports, ReportsPeriodChip } from './MonthlyReportsBlocks';
import { SAMPLE_BRAND, SAMPLE_LOCATIONS, SAMPLE_RECIPIENTS } from './monthlyReportsSample';
import '../GoogleBusiness/GoogleBusiness.css';
import './MonthlyReports.css';

const noop = () => {};

export default function MonthlyReportsMockup() {
  return (
    <div className="gb-page mrep-page">
      <PageHeader
        eyebrow="Informes"
        title="Informes mensuales"
        subtitle="Un informe PDF por local cada mes, disponible durante 12 meses"
        actions={<ReportsPeriodChip />}
      />
      <AutoGenerationNotice />

      <div className="mrep-list">
        <LocationReports item={SAMPLE_BRAND} brand open={false} onToggle={noop} />
        {SAMPLE_LOCATIONS.map((item, i) => (
          <LocationReports key={item.id} item={item} open={i === 0} onToggle={noop} />
        ))}
      </div>

      <EmailDeliveryCard recipients={SAMPLE_RECIPIENTS} />
    </div>
  );
}
