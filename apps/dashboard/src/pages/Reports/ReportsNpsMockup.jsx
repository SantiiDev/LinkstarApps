/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Todos los números de acá son inventados (reportsSample.js). Se renderiza
 * ÚNICAMENTE en los dos lugares donde una maqueta es legal en Reportes: como
 * `children` de `BusinessPitch` (plan gratis) y de `GoogleGate` (Business sin
 * Google conectado). Los dos la dejan borrosa, inerte y detrás de un modal que
 * no se cierra. NO agregar otro importador: fuera de esas puertas es una
 * pantalla inventando datos.
 *
 * Dibuja con los mismos bloques que la pantalla real (NpsBlocks.jsx) y las
 * mismas cuentas (lib/reviewInsights.js), así el ejemplo es coherente: el +58
 * sale de los promotores y detractores de abajo.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import SelectField from '../../components/Select/SelectField';
import { RANGE_OPTIONS, strengthAndChallenge, npsInsights } from '../../lib/reviewInsights';
import { NpsKpis, NpsBreakdown, AspectList, NpsInsights } from './NpsBlocks';
import { SAMPLE_NPS, SAMPLE_ASPECTS } from './reportsSample';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

const noop = () => {};

export default function ReportsNpsMockup() {
  const { strength, challenge } = strengthAndChallenge(SAMPLE_ASPECTS);
  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="NPS"
        subtitle="Net Promoter Score y análisis de aspectos por reseña"
      />

      <div className="gb-card gbm-toolbar">
        <div className="gbm-toolbar__filters">
          <SelectField label="Local" icon="store" value="all" onChange={noop} options={[{ value: 'all', label: 'Todos los locales' }]} />
          <SelectField label="Rango de fechas" icon="calendar" value="90" onChange={noop} options={RANGE_OPTIONS} />
        </div>
      </div>

      <NpsKpis nps={SAMPLE_NPS} strength={strength} challenge={challenge} />
      <div className="reports-nps-body">
        <NpsBreakdown nps={SAMPLE_NPS} />
        <AspectList aspects={SAMPLE_ASPECTS} />
        <NpsInsights items={npsInsights({ nps: SAMPLE_NPS, strength, challenge })} />
      </div>
    </div>
  );
}
