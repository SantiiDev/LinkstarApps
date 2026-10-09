/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Todos los números de acá son inventados. Se renderiza ÚNICAMENTE en los dos
 * lugares donde una maqueta es legal: como `children` de `GoogleGate` (sin
 * Google conectado) y como `preview` de `BusinessLock` (con Google, en el plan
 * gratis, desde ReportsNpsScreen, con `showHeader={false}` porque la pantalla ya
 * muestra el suyo). Los dos la dejan borrosa, inerte y detrás de un velo que no
 * se cierra. NO agregar otro importador: fuera de esas puertas es una pantalla
 * inventando datos.
 *
 * Dibuja con los mismos bloques que la pantalla real (NpsBlocks.jsx) y las
 * mismas cuentas (lib/reviewInsights.js), así el ejemplo es coherente: el +58
 * sale de los promotores y detractores de abajo.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import SelectField from '../../components/Select/SelectField';
import { RANGE_OPTIONS, strengthAndChallenge, npsInsights } from '../../lib/reviewInsights';
import { NpsKpis, NpsBreakdown, AspectList, NpsInsights } from './NpsBlocks';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

const NPS = { promoters: 33, passives: 10, detractors: 5, total: 48, score: 58, small: false };

const aspect = (topic, label, positive, neutral, negative) => {
  const mentions = positive + neutral + negative;
  return { topic, label, positive, neutral, negative, mentions, score: Math.round(((positive - negative) / mentions) * 100) };
};

const ASPECTS = [
  aspect('calidad', 'Calidad', 41, 6, 1),
  aspect('atencion', 'Atención', 32, 6, 3),
  aspect('ambiente', 'Ambiente', 25, 9, 2),
  aspect('limpieza', 'Limpieza', 15, 5, 2),
  aspect('precio', 'Precio', 12, 13, 8),
  aspect('espera', 'Tiempo de espera', 4, 3, 12),
];

const noop = () => {};

export default function ReportsNpsMockup({ showHeader = true }) {
  const { strength, challenge } = strengthAndChallenge(ASPECTS);
  return (
    <div className="reports-page">
      {showHeader && (
        <PageHeader
          eyebrow="Reportes"
          title="NPS"
          subtitle="Net Promoter Score y análisis de aspectos por reseña"
        />
      )}

      <div className="gb-card gbm-toolbar">
        <div className="gbm-toolbar__filters">
          <SelectField label="Local" icon="store" value="all" onChange={noop} options={[{ value: 'all', label: 'Todos los locales' }]} />
          <SelectField label="Rango de fechas" icon="calendar" value="90" onChange={noop} options={RANGE_OPTIONS} />
        </div>
      </div>

      <NpsKpis nps={NPS} strength={strength} challenge={challenge} />
      <div className="reports-nps-body">
        <NpsBreakdown nps={NPS} />
        <AspectList aspects={ASPECTS} />
        <NpsInsights items={npsInsights({ nps: NPS, strength, challenge })} />
      </div>
    </div>
  );
}
