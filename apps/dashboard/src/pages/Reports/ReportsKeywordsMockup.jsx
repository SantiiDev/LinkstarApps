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
 * Dibuja con los mismos bloques que la pantalla real (KeywordsBlocks.jsx) y la
 * misma frase de resumen (keywordSummary). Se rehízo el 9/10/2026 con la
 * estructura de Tapstar; la anterior (StatCards + ranking) está en el historial
 * de git.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import SelectField, { FilterField } from '../../components/Select/SelectField';
import { RANGE_OPTIONS, keywordSummary } from '../../lib/reviewInsights';
import { KeywordsHint, KeywordsSummary, KeywordColumns, KeywordReviewsPanel, KeywordRanking } from './KeywordsBlocks';
import { SAMPLE_COMPLAINTS, SAMPLE_KEYWORDS, SAMPLE_PRAISED } from './reportsSample';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

const noop = () => {};

export default function ReportsKeywordsMockup() {
  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Palabras Clave"
        subtitle="Análisis de fortalezas y debilidades según lo que escriben tus clientes"
      />

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
        <KeywordsSummary text={keywordSummary(SAMPLE_PRAISED, SAMPLE_COMPLAINTS)} />
        <KeywordColumns praised={SAMPLE_PRAISED} complaints={SAMPLE_COMPLAINTS} selected={null} onSelect={noop} />
        <KeywordReviewsPanel keyword={null} />
        <KeywordRanking keywords={SAMPLE_KEYWORDS} page={0} onPage={noop} selected={null} onSelect={noop} />
      </div>
    </div>
  );
}
