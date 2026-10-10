import BusinessPitch from '../../components/BusinessPitch/BusinessPitch';
import { SAMPLE_SENTIMENT_COUNTS } from '../Reports/reportsSample';
import { EmailDeliveryCard, LocationReports, ReportPreview } from './MonthlyReportsBlocks';
import { SAMPLE_LOCATIONS, SAMPLE_RECIPIENTS, SAMPLE_REPORT_PAGE } from './monthlyReportsSample';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import '../Reports/Reports.css';
import './MonthlyReports.css';

/*
 * El modal de ventas de Informes mensuales (components/BusinessPitch), con los 3
 * pasos de Tapstar adaptados a lo que va a hacer el nuestro. `children` es la
 * maqueta de la sección, que va detrás.
 *
 * Las ilustraciones son los bloques de la pantalla (MonthlyReportsBlocks) con
 * datos INVENTADOS. La del paso 2 es la hoja del PDF, que todavía no existe: es
 * un dibujo de lo que va a ser, y el contenido final lo define el socio.
 *
 * El tamaño fijo entre pasos (el precio y los botones no se mueven) lo da
 * BusinessPitch.css; los textos de cada paso entran en los 3 renglones que
 * reserva `.bpitch__step-text`.
 */

const noop = () => {};

const STEPS = [
  {
    title: 'Todos tus informes en un solo lugar',
    text: (
      <>
        Uno por local y otro de toda tu marca, que se generan solos <strong>a principio de cada mes</strong>. Sin
        pedirlos y sin armar nada.
      </>
    ),
    art: <LocationReports item={SAMPLE_LOCATIONS[0]} open onToggle={noop} />,
  },
  {
    title: 'El resumen del mes, en un PDF',
    text: (
      <>
        Tus reseñas, lo que dicen tus clientes, los escaneos de tus expositores y tus métricas de Google, en un PDF
        que se guarda <strong>doce meses</strong>.
      </>
    ),
    art: <ReportPreview page={SAMPLE_REPORT_PAGE} sentimentCounts={SAMPLE_SENTIMENT_COUNTS} />,
  },
  {
    title: 'Y vos decidís quién lo recibe',
    text: (
      <>
        Sumás destinatarios y les llega por mail <strong>apenas se genera</strong>, sin que tengas que reenviar
        nada.
      </>
    ),
    art: <EmailDeliveryCard recipients={SAMPLE_RECIPIENTS} />,
  },
];

export default function MonthlyReportsPitch({ children }) {
  return (
    <BusinessPitch
      title="Informes de reputación, cada mes y sin pedirlos"
      description="Todos tus números en un solo lugar, listos antes de que te acuerdes de mirarlos."
      steps={STEPS}
    >
      {children}
    </BusinessPitch>
  );
}
