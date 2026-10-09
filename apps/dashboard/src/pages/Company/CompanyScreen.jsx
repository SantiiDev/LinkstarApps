import { useEffect, useMemo, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import PageHeader from '../../components/PageHeader/PageHeader';
import SectionPlaceholder from '../../components/SectionPlaceholder/SectionPlaceholder';
import PageSkeleton from '../../components/PageSkeleton/PageSkeleton';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import {
  periodFor, normalizeReviewRows, normalizeAnalysisRows, byLocation, inPeriod, inPreviousPeriod,
  percentTrend, pointsTrend, ratingOf, answeredShare, positiveShare, pendingNegatives,
  starDistribution, reviewSeries, starAverage, seoSummary, locationSummary,
} from '../../lib/companyOverview';
import { useCompanyOverview } from './useCompanyOverview';
import {
  CompanyToolbar, NegativeAlert, ReviewsKpi, SentimentKpi, RatingKpi, SeoKpi,
  StarGoalCard, ReviewsTrendCard, StarDistributionCard, LocationSummaryCard, RecentReviewsCard,
} from './CompanyBlocks';
import './Company.css';

/*
 * Mi Empresa — la pantalla real, con la ficha de Google conectada.
 *
 * Es la pantalla post-login. Hasta octubre de 2026 se armaba sobre escaneos
 * (KPIs de escaneos, gráfico por día, actividad de expositores) porque no había
 * de dónde leer reseñas. Desde la fase 4 leemos las reseñas de cada ficha
 * vinculada (google_reviews, 0024/0025) y desde la fase 5 su sentimiento
 * (0033), así que se rehízo sobre reseñas, con la estructura de Tapstar. Los
 * escaneos quedan en el resumen por local, que es lo único que nadie más mide.
 *
 * Sin Google conectado no se llega acá: Company.jsx muestra GoogleGate con la
 * maqueta de fondo, como las demás secciones de Google.
 *
 * Qué sale de dónde (todo filtrado por la organización activa):
 *   - Reseñas, respondidas, puntuación, distribución, serie y alerta:
 *     google_reviews, filtradas por sucursal y período en el cliente.
 *   - Sentimiento: v_review_analysis, sólo Business (en gratis ni se pide).
 *   - Tu media de estrellas: total y media de Google por ficha, con la media
 *     exacta calculada sobre las reseñas guardadas cuando están todas.
 *   - SEO Local: el Análisis SEO del API (seoAudit.js), aparte porque tarda.
 *   - Escaneos por local: v_location_scans_daily (nunca scan_events).
 *
 * Ninguna cifra se inventa: sin medición va «—», y un bloque sin datos dice por
 * qué. Si la carga base falla se informa; no hay maqueta de respaldo.
 */

const today = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

/* Los filtros quedan como los dejó el usuario al irse a otra sección y volver
   (en memoria: al recargar la página vuelven a los de por defecto). Son de una
   organización: con otra activa arrancan de cero, porque una sucursal elegida
   no existe en la otra. */
const DEFAULT_FILTERS = { locationId: 'all', range: '30', chartMode: 'count', target: null };
let lastFilters = { orgId: null, ...DEFAULT_FILTERS };

export default function CompanyScreen({ google, onNavigate }) {
  const { org, isBusiness, retentionDays } = useOrg();
  const orgId = org?.organization_id;

  const initial = lastFilters.orgId === orgId ? lastFilters : DEFAULT_FILTERS;
  const [locationId, setLocationId] = useState(initial.locationId);
  const [range, setRange] = useState(initial.range);
  const [chartMode, setChartMode] = useState(initial.chartMode);
  const [pickedTarget, setPickedTarget] = useState(initial.target);

  useEffect(() => {
    lastFilters = { orgId, locationId, range, chartMode, target: pickedTarget };
  }, [orgId, locationId, range, chartMode, pickedTarget]);

  const period = useMemo(() => periodFor(range), [range]);
  /* Las reseñas no se recortan por plan, los escaneos sí (0034): con un período
     más largo que el historial, la columna «Escaneos» cuenta sólo lo que el plan
     guarda, y el resumen lo dice en vez de presentarlo como el total del período. */
  const periodDays = range === 'all' ? Infinity : Number(range);
  const scanDaysCap = retentionDays && periodDays > retentionDays ? retentionDays : null;
  const { base, scans, recent, seo } = useCompanyOverview(orgId, {
    isBusiness,
    scanSince: period.fromKey,
    locationId,
  });

  const reviewRows = useMemo(() => normalizeReviewRows(base.reviewRows), [base.reviewRows]);
  const analysisRows = useMemo(() => (base.analysis ? normalizeAnalysisRows(base.analysis) : null), [base.analysis]);
  const linked = useMemo(() => base.fichas.filter((f) => f.location_id), [base.fichas]);

  const view = useMemo(() => {
    const scoped = byLocation(reviewRows, locationId);
    const cur = inPeriod(scoped, period);
    const prev = inPreviousPeriod(scoped, period);
    const hasLinked = locationId === 'all'
      ? linked.length > 0
      : linked.some((f) => f.location_id === locationId);

    const analysisScoped = analysisRows ? byLocation(analysisRows, locationId) : null;
    const analysisCur = analysisScoped ? inPeriod(analysisScoped, period) : null;
    const analysisPrev = analysisScoped ? inPreviousPeriod(analysisScoped, period) : null;

    return {
      hasLinked,
      negatives: pendingNegatives(scoped),
      reviews: hasLinked
        ? {
          value: cur.length,
          trend: prev ? percentTrend(cur.length, prev.length) : null,
          answered: cur.filter((r) => r.answered).length,
          answeredPct: answeredShare(cur),
        }
        : { value: null, trend: null, answered: null, answeredPct: null },
      rating: {
        value: hasLinked ? ratingOf(cur) : null,
        trend: prev ? pointsTrend(ratingOf(cur), ratingOf(prev)) : null,
        reason: hasLinked ? null : 'Sin ficha vinculada',
      },
      sentimentNow: analysisCur,
      sentimentPrev: analysisPrev,
      analysisAll: analysisScoped,
      distribution: starDistribution(cur),
      periodRows: cur,
      average: starAverage(base.fichas, reviewRows, locationId),
    };
  }, [reviewRows, analysisRows, linked, locationId, period, base.fichas]);

  const series = useMemo(() => reviewSeries(view.periodRows, period, chartMode), [view.periodRows, period, chartMode]);

  const summaryRows = useMemo(() => locationSummary({
    locations: base.locations,
    fichas: base.fichas,
    rows: inPeriod(reviewRows, period),
    analysis: analysisRows ? inPeriod(analysisRows, period) : null,
    scanTotals: scans.totals,
    isBusiness,
    locationId,
  }), [base.locations, base.fichas, reviewRows, analysisRows, period, scans.totals, isBusiness, locationId]);

  /* El objetivo por defecto es la décima siguiente; si el que se eligió deja de
     tener sentido (otra sucursal, otra nota), vuelve al de por defecto. */
  const targets = view.average?.targets ?? [];
  const target = targets.includes(pickedTarget) ? pickedTarget : targets[0];

  const caption = period.prevFromKey ? 'vs período anterior' : 'en todo el historial';

  const header = (
    <PageHeader
      eyebrow="Panel general"
      title="Mi Empresa"
      subtitle="Resumen de tus locales y de lo que dicen tus clientes en Google"
      actions={<span className="company-date">{today()}</span>}
    />
  );

  if (base.loading && !base.reviewRows.length) {
    return (
      <div className="company-page">
        {header}
        <PageSkeleton label="Cargando tu resumen" />
      </div>
    );
  }

  if (base.error) {
    return (
      <div className="company-page">
        {header}
        <SectionPlaceholder
          variant="soon"
          title="No pudimos cargar tu resumen"
          description="Hubo un problema al consultar tus datos. Probá recargar la página; si sigue pasando, escribinos y lo miramos."
        />
      </div>
    );
  }

  const locationOptions = [
    { value: 'all', label: 'Todos los locales' },
    ...base.locations.map((l) => ({ value: l.location_id, label: l.name ?? 'Sucursal' })),
  ];

  let sentimentState;
  if (!isBusiness) sentimentState = { status: 'locked' };
  else if (!view.hasLinked) sentimentState = { status: 'none', value: null };
  else if (base.analysisFailed) sentimentState = { status: 'failed', value: null };
  else if (!view.analysisAll?.length) sentimentState = { status: 'pending', value: null };
  else if (!view.sentimentNow.length) sentimentState = { status: 'empty', value: null };
  else {
    const value = positiveShare(view.sentimentNow);
    sentimentState = {
      status: 'ok',
      value,
      trend: view.sentimentPrev?.length ? pointsTrend(value, positiveShare(view.sentimentPrev), { decimals: 0, unit: ' pts' }) : null,
    };
  }

  let seoState;
  if (seo.loading) seoState = { status: 'loading' };
  else if (seo.failed) seoState = { status: 'failed' };
  else {
    const summary = seoSummary(seo.data, locationId);
    seoState = summary ? { status: 'ok', summary } : { status: view.hasLinked ? 'failed' : 'none' };
  }

  return (
    <div className="company-page">
      {header}

      {google?.connection?.status === 'needs_reauth' && (
        <div className="company-notice">
          <p>Google cortó el acceso a tu ficha. Lo de abajo es lo que ya teníamos guardado; para seguir actualizándolo, volvé a conectarla.</p>
          <GoogleConnect google={google} align="start" />
        </div>
      )}

      <CompanyToolbar
        locationOptions={locationOptions}
        locationId={locationId}
        onLocation={setLocationId}
        range={range}
        onRange={setRange}
      />

      {linked.length === 0 && (
        <div className="company-card company-link-cta">
          <div>
            <p className="company-link-cta__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
            <p className="company-link-cta__text">
              Las reseñas, la puntuación y el SEO se leen sólo de las fichas vinculadas. Elegí cuál de tus fichas de
              Google corresponde a cada sucursal y esta pantalla se completa sola.
            </p>
          </div>
          <button type="button" className="company-btn-primary" onClick={() => onNavigate?.('settings-local')}>
            Vincular en Gestión local
          </button>
        </div>
      )}

      <NegativeAlert
        count={view.negatives}
        onRespond={() => onNavigate?.('reviews', { reviewFilter: { rating: 'low', status: 'pending', locationId } })}
      />

      <div className="kpi-grid">
        <ReviewsKpi data={view.reviews} caption={caption} />
        <SentimentKpi state={sentimentState} caption={caption} onPlans={() => onNavigate?.('settings-billing')} />
        <RatingKpi data={view.rating} caption={caption} />
        <SeoKpi state={seoState} onOpen={() => onNavigate?.('gb-seo')} />
      </div>

      <StarGoalCard average={view.average} target={target} onTarget={setPickedTarget} />

      <div className="company-two-col">
        <ReviewsTrendCard
          series={series}
          total={view.periodRows.length}
          mode={chartMode}
          onMode={setChartMode}
        />
        <StarDistributionCard distribution={view.distribution} total={view.periodRows.length} />
      </div>

      <LocationSummaryCard rows={summaryRows} scansFailed={scans.failed} scanDaysCap={scanDaysCap} />

      <RecentReviewsCard
        items={recent.items}
        failed={recent.failed}
        showLocation={locationId === 'all' && linked.length > 1}
        onViewAll={() => onNavigate?.('reviews')}
      />
    </div>
  );
}
