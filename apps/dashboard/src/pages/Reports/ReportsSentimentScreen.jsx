import { useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import PieChart from '../../components/PieChart/PieChart';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import { useOrg } from '../../context/OrgContext';
import { CHART_COLORS } from '../../lib/chartColors';
import { sharesOf } from '../../lib/shares';
import {
  filterAnalysis, sentimentCounts, monthlyPositiveShare, topicStats, locationStats,
} from '../../lib/reviewInsights';
import ReportsSentimentMockup from './ReportsSentimentMockup';
import { ReauthNotice, AnalysisEmptyState, AnalysisToolbar } from './ReviewAnalysisShared';
import { useReviewAnalysis } from './useReviewAnalysis';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * Análisis de sentimiento — la pantalla real (fase 5, 0033).
 *
 * Cada reseña con texto la analiza una IA una sola vez, cuando entra (lo hace la
 * lectura diaria de Google en services/api, lib/reviewAnalysis.js), y el
 * resultado queda guardado. Esta pantalla sólo cuenta: no llama al modelo.
 *
 * Es de Business. En gratis se ve la maqueta detrás de BusinessLock y no se pide
 * nada: la base igual no se lo mandaría (RLS de google_review_analysis).
 */

const tone = (pct) => (pct >= 66 ? 'forest' : pct >= 34 ? 'gold' : 'danger');

function Icon({ name }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const icons = {
    smile: <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    meh: <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    frown: <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    tag: <svg {...p}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12.01V2h10.01l8.58 8.58a2 2 0 0 1 0 2.83z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  };
  return icons[name] ?? null;
}

const header = (
  <PageHeader
    eyebrow="Reportes"
    title="Análisis de Sentimiento"
    subtitle="Cómo se sienten tus clientes, detectado con IA sobre lo que escribe cada uno"
  />
);

export default function ReportsSentimentScreen({ google, onNavigateSettings }) {
  const { org, isBusiness } = useOrg();
  const data = useReviewAnalysis(org?.organization_id, { enabled: isBusiness });
  const [locationId, setLocationId] = useState('all');
  const [range, setRange] = useState('6');

  const view = useMemo(() => {
    if (!data.rows?.length) return null;
    const rows = filterAnalysis(data.rows, { locationId, range });
    const counts = sentimentCounts(rows);
    const [positivePct, neutralPct, negativePct] = sharesOf([counts.positive, counts.neutral, counts.negative]);
    return {
      rows,
      counts,
      positivePct, neutralPct, negativePct,
      trend: monthlyPositiveShare(rows, range),
      topics: topicStats(rows),
      byLocation: locationStats(rows, data.nameOf),
    };
  }, [data.rows, data.nameOf, locationId, range]);

  if (!isBusiness) {
    return (
      <div className="reports-page">
        {header}
        <BusinessLock
          title="El análisis de sentimiento es del plan Business"
          description="Cada reseña con texto se analiza con IA: tono positivo, neutro o negativo, y los temas que menciona. Abajo, un ejemplo con datos inventados."
          preview={<ReportsSentimentMockup showHeader={false} />}
          fullPage
        />
      </div>
    );
  }

  const empty = <AnalysisEmptyState data={data} onNavigateSettings={onNavigateSettings} />;
  if (data.error || data.loading || !data.rows.length || !data.linked.length) {
    return (
      <div className="reports-page">
        {header}
        <ReauthNotice google={google} />
        {empty}
      </div>
    );
  }

  const { rows, counts } = view;
  const sentiments = [
    { key: 'positive', label: 'Positivo', color: CHART_COLORS.good, value: counts.positive },
    { key: 'neutral', label: 'Neutro', color: CHART_COLORS.warning, value: counts.neutral },
    { key: 'negative', label: 'Negativo', color: CHART_COLORS.bad, value: counts.negative },
  ];

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
          <p>Probá con un período más largo{data.linked.length > 1 ? ' u otra sucursal' : ''}.</p>
        </div>
      ) : (
        <>
          <div className="reports-stat-grid">
            <StatCard icon={<Icon name="smile" />} value={`${view.positivePct}%`} label={`Tono positivo · ${counts.positive} reseña${counts.positive === 1 ? '' : 's'}`} color="forest" />
            <StatCard icon={<Icon name="meh" />} value={`${view.neutralPct}%`} label={`Tono neutro o mixto · ${counts.neutral}`} color="gold" />
            <StatCard icon={<Icon name="frown" />} value={`${view.negativePct}%`} label={`Tono negativo · ${counts.negative}`} color="danger" />
            <StatCard icon={<Icon name="tag" />} value={view.topics.length} label="Temas mencionados" color="orange" />
          </div>

          <div className="reports-two-col">
            <div className="reports-card">
              <div className="reports-card__header">
                <div>
                  <h3 className="reports-card__title">Tono positivo mes a mes</h3>
                  <span className="reports-card__subtitle">
                    Qué parte de las reseñas de cada mes tiene tono positivo. Los meses sin reseñas no se muestran.
                  </span>
                </div>
              </div>
              {view.trend.data.length >= 2 ? (
                <TrendChart
                  data={view.trend.data}
                  labels={view.trend.labels}
                  color="orange"
                  seriesName="Tono positivo"
                  xLabel="Mes"
                  yLabel="% positivo"
                  baseline="auto"
                  formatValue={(v) => `${v}%`}
                />
              ) : (
                <p className="gbm-muted">Hace falta al menos dos meses con reseñas para ver una tendencia.</p>
              )}
            </div>

            <div className="reports-card">
              <div className="reports-card__header">
                <div>
                  <h3 className="reports-card__title">Distribución</h3>
                  <span className="reports-card__subtitle">{rows.length} reseñas con texto en el período</span>
                </div>
              </div>
              <PieChart data={sentiments} centerValue={rows.length} centerLabel="reseñas" unit="reseñas" />
            </div>
          </div>

          <div className="reports-card">
            <div className="reports-card__header">
              <div>
                <h3 className="reports-card__title">Temas más mencionados</h3>
                <span className="reports-card__subtitle">Qué parte de las menciones de cada tema es positiva</span>
              </div>
            </div>
            {view.topics.length ? (
              <div className="reports-themes">
                {view.topics.map((t) => (
                  <div key={t.topic} className="reports-theme-row">
                    <div className="reports-theme-row__top">
                      <span>{t.label}</span>
                      <span className="reports-theme-row__mentions">
                        {t.mentions} menci{t.mentions === 1 ? 'ón' : 'ones'}
                        {t.negative ? ` · ${t.negative} negativa${t.negative === 1 ? '' : 's'}` : ''}
                      </span>
                    </div>
                    <div className="reports-theme-row__bar">
                      <div
                        className={`reports-theme-row__fill reports-theme-row__fill--${tone(t.positivePct)}`}
                        style={{ width: `max(3px, ${t.positivePct}%)` }}
                      />
                    </div>
                    <span className="reports-theme-row__pct">{t.positivePct}% positivo</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="gbm-muted">Las reseñas de este período no mencionan atención, calidad, precio, espera, ambiente ni limpieza.</p>
            )}
          </div>

          {data.linked.length > 1 && locationId === 'all' && view.byLocation.length > 1 && (
            <div className="reports-card">
              <div className="reports-card__header">
                <div>
                  <h3 className="reports-card__title">Dónde se concentran las quejas</h3>
                  <span className="reports-card__subtitle">Qué parte de las reseñas de cada sucursal tiene tono negativo</span>
                </div>
              </div>
              <div className="reports-themes">
                {view.byLocation.map((l) => (
                  <div key={l.locationId} className="reports-theme-row">
                    <div className="reports-theme-row__top">
                      <span>{l.name}</span>
                      <span className="reports-theme-row__mentions">{l.total} reseña{l.total === 1 ? '' : 's'}</span>
                    </div>
                    <div className="reports-theme-row__bar">
                      <div
                        className={`reports-theme-row__fill reports-theme-row__fill--${tone(100 - l.negativePct)}`}
                        style={{ width: `max(3px, ${l.negativePct}%)` }}
                      />
                    </div>
                    <span className="reports-theme-row__pct">{l.negativePct}% negativo</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
