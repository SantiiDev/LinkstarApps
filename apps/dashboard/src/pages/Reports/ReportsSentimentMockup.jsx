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
 * Dibuja con los mismos bloques que la pantalla real (SentimentBlocks.jsx), así
 * se ven idénticas. Se rehízo el 9/10/2026 con la estructura de Tapstar; la
 * maqueta anterior (StatCards + torta + temas) está en el historial de git.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import SelectField from '../../components/Select/SelectField';
import { RANGE_OPTIONS } from '../../lib/reviewInsights';
import { SentimentDistribution, SentimentEvolution, SentimentKeywords } from './SentimentBlocks';
import { SAMPLE_KEYWORDS, SAMPLE_SENTIMENT_COUNTS, SAMPLE_SENTIMENT_SERIES } from './reportsSample';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

const noop = () => {};

export default function ReportsSentimentMockup() {
  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Análisis de Sentimiento"
        subtitle="Comprendé las emociones y opiniones de tus clientes, detectadas con IA sobre lo que escribe cada uno"
      />

      <div className="gb-card gbm-toolbar">
        <div className="gbm-toolbar__filters">
          <SelectField label="Local" icon="store" value="all" onChange={noop} options={[{ value: 'all', label: 'Todos los locales' }]} />
          <SelectField label="Rango de fechas" icon="calendar" value="90" onChange={noop} options={RANGE_OPTIONS} />
        </div>
      </div>

      <div className="reports-stack">
        <div className="reports-two-col reports-two-col--even">
          <SentimentDistribution counts={SAMPLE_SENTIMENT_COUNTS} />
          <SentimentEvolution series={SAMPLE_SENTIMENT_SERIES} mode="count" onMode={noop} />
        </div>
        <SentimentKeywords keywords={SAMPLE_KEYWORDS} />
      </div>
    </div>
  );
}
