/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Todos los números de acá son inventados. Se renderiza ÚNICAMENTE en los dos
 * lugares donde una maqueta es legal: como `children` de `GoogleGate` (sin
 * Google conectado) y como `preview` de `BusinessLock` (con Google, en el plan
 * gratis, desde ReportsSentimentScreen, con `showHeader={false}` porque la
 * pantalla ya muestra el suyo). Los dos la dejan borrosa, inerte y detrás de un
 * velo que no se cierra. NO agregar otro importador: fuera de esas puertas es
 * una pantalla inventando datos.
 *
 * Dibuja con los mismos bloques que la pantalla real (SentimentBlocks.jsx), así
 * se ven idénticas. Se rehízo el 9/10/2026 con la estructura de Tapstar; la
 * maqueta anterior (StatCards + torta + temas) está en el historial de git.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import SelectField from '../../components/Select/SelectField';
import { RANGE_OPTIONS } from '../../lib/reviewInsights';
import { SentimentDistribution, SentimentEvolution, SentimentKeywords } from './SentimentBlocks';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

// 13 semanas (rango «Últimos 90 días»). Suman lo que dice COUNTS.
const SERIES = {
  unit: 'semana',
  withData: 13,
  labels: ['13 jul', '20 jul', '27 jul', '3 ago', '10 ago', '17 ago', '24 ago', '31 ago', '7 sept', '14 sept', '21 sept', '28 sept', '5 oct'],
  positive: [4, 5, 5, 6, 6, 7, 6, 7, 8, 7, 8, 7, 8],
  neutral: [3, 2, 3, 2, 3, 2, 3, 2, 2, 3, 2, 2, 2],
  negative: [2, 2, 1, 2, 1, 1, 2, 1, 1, 0, 1, 1, 0],
};
const COUNTS = { positive: 84, neutral: 31, negative: 15 };

const KEYWORDS = [
  ['atención', 22, 'positive'], ['café', 18, 'positive'], ['amables', 15, 'positive'], ['rico', 13, 'positive'],
  ['recomendable', 11, 'positive'], ['ambiente', 9, 'positive'],
  ['ubicación', 8, 'neutral'], ['horario', 5, 'neutral'],
  ['demora', 7, 'negative'], ['caro', 5, 'negative'], ['ruidoso', 3, 'negative'],
].map(([term, count, dominant]) => ({ term, count, dominant }));

const noop = () => {};

export default function ReportsSentimentMockup({ showHeader = true }) {
  return (
    <div className="reports-page">
      {showHeader && (
        <PageHeader
          eyebrow="Reportes"
          title="Análisis de Sentimiento"
          subtitle="Comprendé las emociones y opiniones de tus clientes, detectadas con IA sobre lo que escribe cada uno"
        />
      )}

      <div className="gb-card gbm-toolbar">
        <div className="gbm-toolbar__filters">
          <SelectField label="Local" icon="store" value="all" onChange={noop} options={[{ value: 'all', label: 'Todos los locales' }]} />
          <SelectField label="Rango de fechas" icon="calendar" value="90" onChange={noop} options={RANGE_OPTIONS} />
        </div>
      </div>

      <div className="reports-stack">
        <div className="reports-two-col reports-two-col--even">
          <SentimentDistribution counts={COUNTS} />
          <SentimentEvolution series={SERIES} mode="count" onMode={noop} />
        </div>
        <SentimentKeywords keywords={KEYWORDS} />
      </div>
    </div>
  );
}
