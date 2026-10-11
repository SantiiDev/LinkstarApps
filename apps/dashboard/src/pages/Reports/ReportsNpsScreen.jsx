import { useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import { useOrg } from '../../context/OrgContext';
import { fetchReviewsByIds } from '../../lib/googleApi';
import {
  DEFAULT_RANGE, filterAnalysis, npsOf, aspectNps, strengthAndChallenge, npsInsights,
} from '../../lib/reviewInsights';
import { NpsKpis, NpsBreakdown, AspectList, AspectReviews, NpsInsights } from './NpsBlocks';
import { ReauthNotice, AnalysisEmptyState, AnalysisToolbar } from './ReviewAnalysisShared';
import { useReviewAnalysis } from './useReviewAnalysis';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * NPS — la pantalla real, con la estructura de Tapstar.
 *
 * No hay encuesta: el NPS sale del análisis de reseñas de la fase 5 (0033), que
 * ya guarda el tono de cada reseña y de cada tema. Promotor = tono positivo,
 * pasivo = neutro, detractor = negativo (las cuentas, en lib/reviewInsights.js).
 * Esta pantalla no llama al modelo: sólo cuenta lo que ya está guardado.
 *
 * Es de Business, como Sentimiento y Palabras clave: a esta pantalla sólo llega
 * una cuenta Business (en gratis, ReportsNps muestra el modal de ventas y no se
 * pide nada; la base igual no lo mandaría, RLS de google_review_analysis).
 *
 * Lo único que se pide aparte es el texto de las reseñas de un aspecto, al
 * desplegar su fila: las últimas DETAIL_LIMIT, por id (fetchReviewsByIds).
 */

const DETAIL_LIMIT = 5;

const header = (
  <PageHeader
    eyebrow="Reportes"
    title="NPS"
    subtitle="Net Promoter Score y análisis de aspectos por reseña"
  />
);

/* Ids distintos de un aspecto, de la reseña más nueva a la más vieja (una
   reseña podría nombrar el mismo tema dos veces). */
function reviewIdsOf(aspect) {
  return [...new Set(aspect.reviews.map((m) => m.reviewId))];
}

export default function ReportsNpsScreen({ google, onNavigateSettings }) {
  const { org } = useOrg();
  const orgId = org?.organization_id;
  const data = useReviewAnalysis(orgId);
  const [locationId, setLocationId] = useState('all');
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [openTopic, setOpenTopic] = useState(null);
  // Reseñas ya pedidas, por lista de ids: reabrir una fila no vuelve a pedirlas.
  const [details, setDetails] = useState({});

  const view = useMemo(() => {
    if (!data.rows?.length) return null;
    const rows = filterAnalysis(data.rows, { locationId, range });
    const nps = npsOf(rows);
    const aspects = aspectNps(rows);
    const { strength, challenge } = strengthAndChallenge(aspects);
    return { rows, nps, aspects, strength, challenge, insights: npsInsights({ nps, strength, challenge }) };
  }, [data.rows, locationId, range]);

  // Con otro filtro la fila abierta mostraría reseñas de otro período.
  const changeFilter = (setter) => (value) => { setter(value); setOpenTopic(null); };

  const toggleAspect = (aspect) => {
    if (openTopic === aspect.topic) {
      setOpenTopic(null);
      return;
    }
    setOpenTopic(aspect.topic);
    const ids = reviewIdsOf(aspect).slice(0, DETAIL_LIMIT);
    const key = ids.join(',');
    if (details[key] && details[key].status !== 'error') return;
    setDetails((d) => ({ ...d, [key]: { status: 'loading' } }));
    fetchReviewsByIds(orgId, ids)
      .then((items) => setDetails((d) => ({ ...d, [key]: { status: 'ok', items } })))
      .catch((err) => {
        console.error('No se pudieron cargar las reseñas del aspecto:', err);
        setDetails((d) => ({ ...d, [key]: { status: 'error' } }));
      });
  };

  const renderDetail = (aspect) => {
    const ids = reviewIdsOf(aspect);
    const tones = new Map(aspect.reviews.map((m) => [m.reviewId, m.sentiment]));
    return (
      <AspectReviews
        aspect={aspect}
        state={details[ids.slice(0, DETAIL_LIMIT).join(',')]}
        toneOf={(id) => tones.get(id)}
        total={ids.length}
        showLocation={locationId === 'all' && data.linked.length > 1}
      />
    );
  };

  if (data.error || data.loading || !data.rows.length || !data.linked.length) {
    return (
      <div className="reports-page">
        {header}
        <ReauthNotice google={google} />
        <AnalysisEmptyState data={data} onNavigateSettings={onNavigateSettings} />
      </div>
    );
  }

  const { rows, nps } = view;

  return (
    <div className="reports-page">
      {header}
      <ReauthNotice google={google} />
      <AnalysisToolbar
        data={data}
        locationId={locationId} setLocationId={changeFilter(setLocationId)}
        range={range} setRange={changeFilter(setRange)}
        analyzedCount={rows.length}
      />

      {!rows.length ? (
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">No hay reseñas analizadas en este período</p>
          <p>Probá con un rango más largo{data.linked.length > 1 ? ' u otro local' : ''}.</p>
        </div>
      ) : (
        <>
          <NpsKpis nps={nps} strength={view.strength} challenge={view.challenge} />
          <div className="reports-nps-body">
            <NpsBreakdown nps={nps} />
            <AspectList
              aspects={view.aspects}
              openTopic={openTopic}
              onToggle={toggleAspect}
              renderDetail={renderDetail}
            />
            <NpsInsights items={view.insights} />
          </div>
        </>
      )}
    </div>
  );
}
