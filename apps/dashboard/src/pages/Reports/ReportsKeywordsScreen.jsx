import { useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import { useOrg } from '../../context/OrgContext';
import { filterAnalysis, keywordStats } from '../../lib/reviewInsights';
import ReportsKeywordsMockup from './ReportsKeywordsMockup';
import { ReauthNotice, AnalysisEmptyState, AnalysisToolbar } from './ReviewAnalysisShared';
import { useReviewAnalysis } from './useReviewAnalysis';
import '../GoogleBusiness/GoogleBusiness.css';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * Palabras clave de las reseñas — la pantalla real (fase 5, 0033).
 *
 * Las palabras las extrae una IA de cada reseña con texto, una sola vez (lib/
 * reviewAnalysis.js en services/api), cada una con su propio tono: el de cómo
 * se la menciona, no el de la reseña entera. «Lugar lindo» dentro de una queja
 * por la demora sigue siendo un elogio, y va a «Lo que más elogian».
 *
 * Es de Business, como Sentimiento: en gratis, la maqueta detrás de BusinessLock.
 */

const PAGE = 15;
const SIDE_LIST = 6;

const DOMINANT_LABEL = {
  positive: 'mencionada sobre todo como elogio',
  neutral: 'mencionada sin un tono claro',
  negative: 'mencionada sobre todo como queja',
};

function Icon({ name }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const icons = {
    hash: <svg {...p}><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>,
    trend: <svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>,
    tag: <svg {...p}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12.01V2h10.01l8.58 8.58a2 2 0 0 1 0 2.83z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  };
  return icons[name] ?? null;
}

const header = (
  <PageHeader
    eyebrow="Reportes"
    title="Palabras Clave"
    subtitle="Los términos que más repiten tus clientes en sus reseñas"
  />
);

function SideList({ title, subtitle, items, empty }) {
  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">{title}</h3>
          <span className="reports-card__subtitle">{subtitle}</span>
        </div>
      </div>
      {items.length ? (
        <div className="reports-keywords-list">
          {items.map((k) => (
            <div key={k.term} className="reports-keyword-row">
              <span className={`reports-keyword-row__dot reports-keyword-row__dot--${k.dominant}`} />
              <span className="reports-keyword-row__term">{k.term}</span>
              <span className="reports-keyword-row__count">{k.count} reseña{k.count === 1 ? '' : 's'}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="gbm-muted">{empty}</p>
      )}
    </div>
  );
}

export default function ReportsKeywordsScreen({ google, onNavigateSettings }) {
  const { org, isBusiness } = useOrg();
  const data = useReviewAnalysis(org?.organization_id, { enabled: isBusiness });
  const [locationId, setLocationId] = useState('all');
  const [range, setRange] = useState('6');
  const [page, setPage] = useState(0);

  const view = useMemo(() => {
    if (!data.rows?.length) return null;
    const rows = filterAnalysis(data.rows, { locationId, range });
    const keywords = keywordStats(rows);
    return {
      rows,
      keywords,
      praised: keywords.filter((k) => k.dominant === 'positive').slice(0, SIDE_LIST),
      complaints: keywords.filter((k) => k.dominant === 'negative').slice(0, SIDE_LIST),
      positiveShare: keywords.length
        ? Math.round((keywords.filter((k) => k.dominant === 'positive').length / keywords.length) * 100)
        : 0,
    };
  }, [data.rows, locationId, range]);

  const changeFilter = (setter) => (value) => { setter(value); setPage(0); };

  if (!isBusiness) {
    return (
      <div className="reports-page">
        {header}
        <BusinessLock
          title="Las palabras clave de tus reseñas son del plan Business"
          description="Una IA lee cada reseña con texto y saca los términos que más repiten tus clientes, separando los que vienen con elogios de los que vienen con quejas. Abajo, un ejemplo con datos inventados."
          preview={<ReportsKeywordsMockup showHeader={false} />}
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

  const { rows, keywords } = view;
  const max = Math.max(1, ...keywords.map((k) => k.count));
  const pages = Math.ceil(keywords.length / PAGE);
  const pageRows = keywords.slice(page * PAGE, (page + 1) * PAGE);

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

      {!keywords.length ? (
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">No hay palabras clave en este período</p>
          <p>Probá con un período más largo{data.linked.length > 1 ? ' u otra sucursal' : ''}.</p>
        </div>
      ) : (
        <>
          <div className="reports-stat-grid">
            <StatCard icon={<Icon name="hash" />} value={keywords.length} label="Palabras clave distintas" color="orange" />
            {/* Con todas en una sola reseña, «la más repetida» sería la primera
                en orden alfabético: no hay ninguna más repetida que otra. */}
            {keywords[0].count > 1 ? (
              <StatCard icon={<Icon name="trend" />} value={keywords[0].term} label={`La más repetida · ${keywords[0].count} reseñas`} color="gold" />
            ) : (
              <StatCard icon={<Icon name="trend" />} value="—" label="Todavía ninguna se repite" color="gold" />
            )}
            <StatCard icon={<Icon name="tag" />} value={rows.length} label="Reseñas analizadas" color="forest" />
            <StatCard icon={<Icon name="hash" />} value={`${view.positiveShare}%`} label="Se mencionan sobre todo como elogio" color="navy" />
          </div>

          <div className="reports-two-col">
            <SideList
              title="Lo que más elogian"
              subtitle="Lo que tus clientes mencionan sobre todo como algo bueno"
              items={view.praised}
              empty="En este período ninguna palabra se menciona sobre todo como elogio."
            />
            <SideList
              title="De qué se quejan"
              subtitle="Lo que tus clientes mencionan sobre todo como algo malo"
              items={view.complaints}
              empty="En este período ninguna palabra se menciona sobre todo como queja."
            />
          </div>

          <div className="reports-card">
            <div className="reports-card__header">
              <div>
                <h3 className="reports-card__title">Ranking de palabras clave</h3>
                <span className="reports-card__subtitle">
                  En cuántas reseñas aparece cada una. El color dice si se la menciona como elogio, como queja o sin un tono claro.
                </span>
              </div>
            </div>
            <div className="reports-keywords-list">
              {pageRows.map((k) => (
                <div key={k.term} className="reports-keyword-row" title={`${k.term}: ${DOMINANT_LABEL[k.dominant]}`}>
                  <span className={`reports-keyword-row__dot reports-keyword-row__dot--${k.dominant}`} />
                  <span className="reports-keyword-row__term">{k.term}</span>
                  <div className="reports-keyword-row__bar">
                    <div
                      className={`reports-keyword-row__fill reports-keyword-row__fill--${k.dominant}`}
                      style={{ width: `max(3px, ${(k.count / max) * 100}%)` }}
                    />
                  </div>
                  <span className="reports-keyword-row__count">{k.count} reseña{k.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
            {pages > 1 && (
              <div className="gbm-pager">
                <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Anterior</button>
                <span>Página {page + 1} de {pages}</span>
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>Siguiente</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
