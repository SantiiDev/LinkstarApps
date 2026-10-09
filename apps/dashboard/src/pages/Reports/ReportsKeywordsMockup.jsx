/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Todos los números de acá son inventados. Se renderiza ÚNICAMENTE en los dos
 * lugares donde una maqueta es legal: como `children` de `GoogleGate` (sin
 * Google conectado) y como `preview` de `BusinessLock` (con Google, en el plan
 * gratis, desde ReportsKeywordsScreen, con `showHeader={false}` porque la
 * pantalla ya muestra el suyo). Los dos la dejan borrosa, inerte y detrás de un
 * velo que no se cierra. NO agregar otro importador: fuera de esas puertas es
 * una pantalla inventando datos.
 *
 * Dibuja con los mismos bloques que la pantalla real (KeywordsBlocks.jsx) y la
 * misma frase de resumen (keywordSummary). Se rehízo el 9/10/2026 con la
 * estructura de Tapstar; la anterior (StatCards + ranking) está en el historial
 * de git.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import SelectField, { FilterField } from '../../components/Select/SelectField';
import { RANGE_OPTIONS, keywordSummary } from '../../lib/reviewInsights';
import { KeywordsHint, KeywordsSummary, KeywordColumns, KeywordReviewsPanel, KeywordRanking } from './KeywordsBlocks';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

// [término, elogios, neutras, quejas]
const RAW = [
  ['atención', 21, 1, 2], ['café', 18, 0, 0], ['amables', 15, 1, 0], ['rico', 13, 0, 1],
  ['recomendable', 11, 0, 0], ['ambiente', 9, 1, 1], ['ubicación', 2, 6, 0], ['demora', 0, 1, 7],
  ['caro', 1, 0, 5], ['horario', 0, 4, 1], ['ruidoso', 0, 0, 3],
];

const KEYWORDS = RAW.map(([term, positive, neutral, negative]) => {
  let dominant = 'neutral';
  if (positive > negative && positive >= neutral) dominant = 'positive';
  else if (negative > positive && negative >= neutral) dominant = 'negative';
  return { term, positive, neutral, negative, count: positive + neutral + negative, dominant, reviews: [] };
}).sort((a, b) => b.count - a.count);

const PRAISED = KEYWORDS.filter((k) => k.dominant === 'positive');
const COMPLAINTS = KEYWORDS.filter((k) => k.dominant === 'negative');

const noop = () => {};

export default function ReportsKeywordsMockup({ showHeader = true }) {
  return (
    <div className="reports-page">
      {showHeader && (
        <PageHeader
          eyebrow="Reportes"
          title="Palabras Clave"
          subtitle="Análisis de fortalezas y debilidades según lo que escriben tus clientes"
        />
      )}

      <div className="gb-card gbm-toolbar">
        <div className="gbm-toolbar__filters">
          <SelectField label="Local" icon="store" value="all" onChange={noop} options={[{ value: 'all', label: 'Todos los locales' }]} />
          <SelectField label="Rango de fechas" icon="calendar" value="90" onChange={noop} options={RANGE_OPTIONS} />
          <FilterField label="Reseñas" icon="message" className="reports-count-field">
            <div className="ls-select-field ls-select-field--block ls-select-field--icon reports-count-field__value">126</div>
          </FilterField>
        </div>
      </div>

      <div className="reports-stack">
        <KeywordsHint />
        <KeywordsSummary text={keywordSummary(PRAISED, COMPLAINTS)} />
        <KeywordColumns praised={PRAISED} complaints={COMPLAINTS} selected={null} onSelect={noop} />
        <KeywordReviewsPanel keyword={null} />
        <KeywordRanking keywords={KEYWORDS} page={0} onPage={noop} selected={null} onSelect={noop} />
      </div>
    </div>
  );
}
