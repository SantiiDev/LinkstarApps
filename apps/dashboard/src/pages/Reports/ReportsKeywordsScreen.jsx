import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import { useOrg } from '../../context/OrgContext';
import { fetchReviewsByIds } from '../../lib/googleApi';
import { DEFAULT_RANGE, filterAnalysis, keywordStats, keywordSummary } from '../../lib/reviewInsights';
import {
  KEYWORDS_PER_COLUMN, KeywordsHint, KeywordsSummary, KeywordColumns, KeywordReviewsPanel, KeywordRanking,
} from './KeywordsBlocks';
import { ReauthNotice, AnalysisEmptyState, AnalysisToolbar } from './ReviewAnalysisShared';
import { useReviewAnalysis } from './useReviewAnalysis';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * Palabras clave de las reseñas — la pantalla real (fase 5, 0033), con la
 * estructura de Tapstar desde el 9/10/2026: aviso, frase de resumen, las dos
 * columnas y, al tocar una palabra, las reseñas que la mencionan.
 *
 * Las palabras las extrae una IA de cada reseña con texto, una sola vez (lib/
 * reviewAnalysis.js en services/api), cada una con su propio tono: el de cómo
 * se la menciona, no el de la reseña entera. «Lugar lindo» dentro de una queja
 * por la demora sigue siendo un elogio.
 *
 * Lo único que se pide aparte es el texto de las reseñas de la palabra elegida,
 * de a REVIEWS_PAGE por página (fetchReviewsByIds), y cada página se guarda: ir y
 * volver no la vuelve a pedir.
 *
 * Es de Business, como Sentimiento: a esta pantalla sólo llega una cuenta
 * Business (en gratis, ReportsKeywords muestra el modal de ventas).
 */

const REVIEWS_PAGE = 5;

const header = (
  <PageHeader
    eyebrow="Reportes"
    title="Palabras Clave"
    subtitle="Análisis de fortalezas y debilidades según lo que escriben tus clientes"
  />
);

/* Reseñas distintas que nombran la palabra, de la más nueva a la más vieja. */
function reviewIdsOf(keyword) {
  return keyword ? [...new Set(keyword.reviews.map((m) => m.reviewId))] : [];
}

export default function ReportsKeywordsScreen({ google, onNavigateSettings }) {
  const { org } = useOrg();
  const orgId = org?.organization_id;
  const data = useReviewAnalysis(orgId);
  const [locationId, setLocationId] = useState('all');
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [rankPage, setRankPage] = useState(0);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [reviewPage, setReviewPage] = useState(0);
  // `term`: de qué palabra son las reseñas cargadas. Al cambiar de página se
  // conservan mientras llega la nueva; al cambiar de palabra, no.
  const [mentions, setMentions] = useState({ term: null, key: null, status: 'idle', items: [] });
  const cache = useRef(new Map());
  const panelRef = useRef(null);

  const view = useMemo(() => {
    if (!data.rows?.length) return null;
    const rows = filterAnalysis(data.rows, { locationId, range });
    const keywords = keywordStats(rows);
    const praised = keywords.filter((k) => k.dominant === 'positive').slice(0, KEYWORDS_PER_COLUMN);
    const complaints = keywords.filter((k) => k.dominant === 'negative').slice(0, KEYWORDS_PER_COLUMN);
    return { rows, keywords, praised, complaints, summary: keywordSummary(praised, complaints) };
  }, [data.rows, locationId, range]);

  const selected = view?.keywords.find((k) => k.term === selectedTerm) ?? null;
  const ids = reviewIdsOf(selected);
  const reviewPages = Math.ceil(ids.length / REVIEWS_PAGE);
  const pageKey = ids.slice(reviewPage * REVIEWS_PAGE, (reviewPage + 1) * REVIEWS_PAGE).join(',');

  useEffect(() => {
    if (!pageKey || !orgId) return undefined;
    const term = selectedTerm;
    const cached = cache.current.get(pageKey);
    if (cached) {
      setMentions({ term, key: pageKey, status: 'ok', items: cached });
      return undefined;
    }
    let cancelled = false;
    setMentions((prev) => ({ term, key: pageKey, status: 'loading', items: prev.term === term ? prev.items : [] }));
    fetchReviewsByIds(orgId, pageKey.split(','))
      .then((items) => {
        cache.current.set(pageKey, items);
        if (!cancelled) setMentions({ term, key: pageKey, status: 'ok', items });
      })
      .catch((err) => {
        console.error('No se pudieron cargar las reseñas de la palabra:', err);
        if (!cancelled) setMentions({ term, key: pageKey, status: 'error', items: [] });
      });
    return () => { cancelled = true; };
  }, [pageKey, orgId, selectedTerm]);

  // Otro local o rango cambia qué palabras hay: se empieza de cero.
  const changeFilter = (setter) => (value) => {
    setter(value);
    setRankPage(0);
    setSelectedTerm(null);
    setReviewPage(0);
  };

  function selectKeyword(keyword) {
    if (keyword.term !== selectedTerm) {
      setSelectedTerm(keyword.term);
      setReviewPage(0);
    }
    // El panel está abajo de las columnas: se baja hasta él para que la
    // respuesta al toque no quede fuera de la vista.
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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

  const { rows, keywords } = view;
  const tones = new Map((selected?.reviews ?? []).map((m) => [m.reviewId, m.sentiment]));
  // En el render justo después de «Siguiente» el efecto todavía no corrió:
  // `mentions` es la página anterior. Se muestra como «cargando» pero con sus
  // reseñas (atenuadas), así el panel no se cierra.
  let mentionsState = { status: 'loading', items: [] };
  if (mentions.term === selectedTerm) {
    mentionsState = mentions.key === pageKey ? mentions : { ...mentions, status: 'loading' };
  }

  return (
    <div className="reports-page">
      {header}
      <ReauthNotice google={google} />
      <AnalysisToolbar
        data={data}
        locationId={locationId} setLocationId={changeFilter(setLocationId)}
        range={range} setRange={changeFilter(setRange)}
        analyzedCount={rows.length}
        showReviewCount
      />

      {!keywords.length ? (
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">No hay palabras clave en este período</p>
          <p>Probá con un rango más largo{data.linked.length > 1 ? ' u otro local' : ''}.</p>
        </div>
      ) : (
        <div className="reports-stack">
          <KeywordsHint />
          <KeywordsSummary text={view.summary} />
          <KeywordColumns
            praised={view.praised}
            complaints={view.complaints}
            selected={selectedTerm}
            onSelect={selectKeyword}
          />
          <KeywordReviewsPanel
            panelRef={panelRef}
            keyword={selected}
            reviewCount={ids.length}
            state={mentionsState}
            toneOf={(id) => tones.get(id)}
            page={reviewPage}
            pages={reviewPages}
            onPage={setReviewPage}
            showLocation={locationId === 'all' && data.linked.length > 1}
          />
          <KeywordRanking
            keywords={keywords}
            page={rankPage}
            onPage={setRankPage}
            selected={selectedTerm}
            onSelect={selectKeyword}
          />
        </div>
      )}
    </div>
  );
}
