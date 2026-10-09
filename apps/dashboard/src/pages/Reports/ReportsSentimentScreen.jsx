import { useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import { useOrg } from '../../context/OrgContext';
import {
  DEFAULT_RANGE, filterAnalysis, sentimentCounts, sentimentSeries, keywordStats, locationStats,
} from '../../lib/reviewInsights';
import ReportsSentimentMockup from './ReportsSentimentMockup';
import { SentimentDistribution, SentimentEvolution, SentimentKeywords, ComplaintsByLocation } from './SentimentBlocks';
import { ReauthNotice, AnalysisEmptyState, AnalysisToolbar } from './ReviewAnalysisShared';
import { useReviewAnalysis } from './useReviewAnalysis';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * Análisis de sentimiento — la pantalla real (fase 5, 0033), con la estructura
 * de Tapstar desde el 9/10/2026: distribución y evolución lado a lado, y las
 * palabras clave agrupadas por tono.
 *
 * Cada reseña con texto la analiza una IA una sola vez, cuando entra (lo hace la
 * lectura diaria de Google en services/api, lib/reviewAnalysis.js), y el
 * resultado queda guardado. Esta pantalla sólo cuenta: no llama al modelo.
 *
 * «Temas más mencionados» ya no está acá: es lo mismo que «NPS por aspecto», que
 * lo muestra mejor (de −100 a +100). Lo que sí sigue, y Tapstar no tiene, es
 * «Dónde se concentran las quejas», sólo con varias sucursales.
 *
 * Es de Business. En gratis se ve la maqueta detrás de BusinessLock y no se pide
 * nada: la base igual no se lo mandaría (RLS de google_review_analysis).
 */

const header = (
  <PageHeader
    eyebrow="Reportes"
    title="Análisis de Sentimiento"
    subtitle="Comprendé las emociones y opiniones de tus clientes, detectadas con IA sobre lo que escribe cada uno"
  />
);

export default function ReportsSentimentScreen({ google, onNavigateSettings, onNavigateSection }) {
  const { org, isBusiness } = useOrg();
  const data = useReviewAnalysis(org?.organization_id, { enabled: isBusiness });
  const [locationId, setLocationId] = useState('all');
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [mode, setMode] = useState('count');

  const view = useMemo(() => {
    if (!data.rows?.length) return null;
    const rows = filterAnalysis(data.rows, { locationId, range });
    return {
      rows,
      counts: sentimentCounts(rows),
      series: sentimentSeries(rows, range, mode),
      keywords: keywordStats(rows),
      byLocation: locationStats(rows, data.nameOf),
    };
  }, [data.rows, data.nameOf, locationId, range, mode]);

  if (!isBusiness) {
    return (
      <div className="reports-page">
        {header}
        <BusinessLock
          title="El análisis de sentimiento es del plan Business"
          description="Cada reseña con texto se analiza con IA: tono positivo, neutro o negativo, cómo se mueve con el tiempo y las palabras que más se repiten. Abajo, un ejemplo con datos inventados."
          preview={<ReportsSentimentMockup showHeader={false} />}
          fullPage
        />
      </div>
    );
  }

  if (data.error || data.loading || !data.rows.length || !data.linked.length) {
    return (
      <div className="reports-page">
        {header}
        <ReauthNotice google={google} />
        <AnalysisEmptyState data={data} onNavigateSettings={onNavigateSettings} />
      </div>
    );
  }

  const { rows } = view;

  return (
    <div className="reports-page">
      {header}
      <ReauthNotice google={google} />
      <AnalysisToolbar
        data={data}
        locationId={locationId} setLocationId={setLocationId}
        range={range} setRange={setRange}
        analyzedCount={rows.length}
      />

      {!rows.length ? (
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">No hay reseñas analizadas en este período</p>
          <p>Probá con un rango más largo{data.linked.length > 1 ? ' u otro local' : ''}.</p>
        </div>
      ) : (
        <div className="reports-stack">
          <div className="reports-two-col reports-two-col--even">
            <SentimentDistribution counts={view.counts} />
            <SentimentEvolution series={view.series} mode={mode} onMode={setMode} />
          </div>

          <SentimentKeywords
            keywords={view.keywords}
            onViewAll={onNavigateSection ? () => onNavigateSection('reports-keywords') : undefined}
          />

          {data.linked.length > 1 && locationId === 'all' && view.byLocation.length > 1 && (
            <ComplaintsByLocation byLocation={view.byLocation} />
          )}
        </div>
      )}
    </div>
  );
}
