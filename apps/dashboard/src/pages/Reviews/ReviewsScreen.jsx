import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import Select from '../../components/Select/Select';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import { useOrg } from '../../context/OrgContext';
import { formatRelativeTime } from '../../lib/dashboardApi';
import {
  fetchGoogleLocations,
  fetchReviewCounts,
  fetchReviews,
  replyToReview,
  REVIEW_FILTERS,
  REVIEWS_PAGE_SIZE,
} from '../../lib/googleApi';
import './Reviews.css';

/*
 * Reseñas — la pantalla real (fase 4.4 + 4.5). Lee `google_reviews` y
 * `google_locations` (0024/0025) bajo RLS: un manager ve sólo las fichas de sus
 * sucursales sin que esta pantalla haga nada.
 *
 * Sólo se renderiza con Google conectado; sin conexión, Reviews.jsx sigue
 * mostrando la maqueta detrás de GoogleGate. El markup y las clases son los de
 * `ReviewsMockup` (el diseño ya estaba aprobado), con tres diferencias que no son
 * de estilo:
 *
 *   - Los filtros son por ESTRELLAS, no por sentimiento: el sentimiento es la
 *     fase 5. "Positiva" acá quiere decir 4 o 5★, que es lo que puso el cliente.
 *   - Los totales de arriba salen de dos fuentes distintas, a propósito: las
 *     reseñas totales y el rating son el contador de Google por ficha (el mismo
 *     que alimenta los snapshots), y respondidas / sin responder salen de las
 *     reseñas leídas. Google cuenta también reseñas sin texto que la API no
 *     siempre devuelve, así que la suma de las dos no tiene por qué coincidir.
 *   - "Responder" publica de verdad en Google, en nombre del negocio. Por eso
 *     lo que se muestra después es lo que devolvió Google, no el borrador.
 */

function StarRow({ rating, size = 13 }) {
  return (
    <div className="reviews-star-row" aria-label={rating ? `${rating} de 5 estrellas` : 'Sin puntaje'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={n <= rating ? '#F59E0B' : 'none'} stroke={n <= rating ? '#F59E0B' : 'rgba(27,26,46,0.25)'} strokeWidth="2" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'G';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const ICONS = {
  star: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  award: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" /></svg>,
  reply: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>,
  alert: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
};

export default function ReviewsScreen({ google, onNavigateSettings, initialFilter }) {
  const { org } = useOrg();
  const orgId = org?.organization_id;
  // Mismo criterio que google_review_reply_target() (0026). Para un manager la
  // base además restringe a sus sucursales; un viewer no ve el botón.
  const canReply = ['owner', 'admin', 'manager'].includes(org?.role);

  const [fichas, setFichas] = useState(null);
  const [counts, setCounts] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // `initialFilter` lo pone «Responder ahora» de Mi Empresa (vía location.state
  // en App.jsx). Sólo se aceptan los filtros que existen.
  const [filter, setFilter] = useState(
    REVIEW_FILTERS.some((f) => f.id === initialFilter) ? initialFilter : 'all'
  );
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('all');
  const debouncedSearch = useDebounced(search, 300);

  const [expandedId, setExpandedId] = useState(null);
  const [replyingId, setReplyingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [replyError, setReplyError] = useState(null);

  const loadSummary = useCallback(async () => {
    const [locations, reviewCounts] = await Promise.all([fetchGoogleLocations(orgId), fetchReviewCounts(orgId)]);
    setFichas(locations);
    setCounts(reviewCounts);
  }, [orgId]);

  const queryArgs = useMemo(() => ({
    filter,
    search: debouncedSearch,
    locationId: locationId === 'all' ? null : locationId,
  }), [filter, debouncedSearch, locationId]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([loadSummary(), fetchReviews(orgId, { ...queryArgs, from: 0 })])
      .then(([, page]) => {
        if (cancelled) return;
        setReviews(page);
        setHasMore(page.length === REVIEWS_PAGE_SIZE);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('No se pudieron cargar las reseñas:', err);
        setError('No pudimos cargar tus reseñas. Probá recargar la página.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryArgs, loadSummary, orgId]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchReviews(orgId, { ...queryArgs, from: reviews.length });
      setReviews((prev) => [...prev, ...page]);
      setHasMore(page.length === REVIEWS_PAGE_SIZE);
    } catch (err) {
      console.error('No se pudieron cargar más reseñas:', err);
      setError('No pudimos cargar más reseñas.');
    } finally {
      setLoadingMore(false);
    }
  }

  function startReply(review) {
    setReplyingId(review.id);
    setExpandedId(review.id);
    setDraft(review.reply_comment || '');
    setReplyError(null);
  }

  async function submitReply(review) {
    setPublishing(true);
    setReplyError(null);
    try {
      const saved = await replyToReview(review.id, draft);
      setReviews((prev) => prev.map((r) => (r.id === review.id
        ? { ...r, reply_comment: saved.comment, reply_updated_time: saved.updatedTime }
        : r)));
      setReplyingId(null);
      setDraft('');
      loadSummary().catch(() => {});
    } catch (err) {
      setReplyError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  const linked = (fichas ?? []).filter((f) => f.location_id);
  const totalFromGoogle = linked.reduce((sum, f) => sum + (f.total_reviews ?? 0), 0);
  const ratedWeight = linked.reduce((sum, f) => sum + (f.average_rating != null ? (f.total_reviews ?? 0) : 0), 0);
  const averageRating = ratedWeight
    ? linked.reduce((sum, f) => sum + (f.average_rating ?? 0) * (f.total_reviews ?? 0), 0) / ratedWeight
    : null;
  const firstReadPending = linked.some((f) => !f.reviews_synced_at);

  const locationOptions = [
    { value: 'all', label: 'Todas las sucursales' },
    ...linked.map((f) => ({ value: f.location_id, label: f.locations?.name ?? f.title ?? 'Sucursal' })),
  ];
  const filtersActive = filter !== 'all' || debouncedSearch.trim() || locationId !== 'all';

  const header = (
    <PageHeader
      eyebrow="Gestión de reseñas"
      title="Reseñas"
      subtitle="Las reseñas de Google de tus sucursales, en un solo lugar"
    />
  );

  const reauthNotice = google.connection?.status === 'needs_reauth' && (
    <div className="reviews-notice">
      <p>Google cortó el acceso a tu ficha. Las reseñas de abajo son las que teníamos guardadas; para seguir recibiendo las nuevas y poder responder, volvé a conectarla.</p>
      <GoogleConnect google={google} align="start" />
    </div>
  );

  if (fichas && !linked.length) {
    return (
      <div className="reviews-page">
        {header}
        {reauthNotice}
        <div className="reviews-list">
          <div className="reviews-empty">
            <p className="reviews-empty__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
            <p>
              Tu cuenta de Google está conectada. Ahora elegí cuáles de sus fichas son de este negocio y a qué
              sucursal corresponde cada una: sólo leemos las reseñas de las fichas vinculadas.
              {fichas.length === 0 && ' Si todavía no ves tus fichas allá, esperá un minuto: estamos leyendo tu cuenta.'}
            </p>
            {onNavigateSettings && (
              <button type="button" className="review-row__respond-btn" onClick={() => onNavigateSettings('local')}>
                Vincular en Gestión local
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reviews-page">
      {header}
      {reauthNotice}

      <div className="reviews-stats">
        <StatCard icon={ICONS.star} value={fichas ? totalFromGoogle : '—'} label="Reseñas en Google" color="gold" />
        <StatCard icon={ICONS.award} value={averageRating ? `${averageRating.toFixed(1)} ★` : '—'} label="Rating promedio" color="orange" />
        <StatCard icon={ICONS.reply} value={counts ? counts.answered : '—'} label="Respondidas" color="forest" />
        <StatCard icon={ICONS.alert} value={counts ? counts.unanswered : '—'} label="Sin responder" color="navy" />
      </div>

      <div className="reviews-toolbar">
        <div className="reviews-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por cliente o texto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar reseñas"
          />
        </div>

        <div className="reviews-filters">
          {REVIEW_FILTERS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`reviews-filter-tab ${filter === tab.id ? 'reviews-filter-tab--active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              {tab.id === 'pending' && counts?.unanswered > 0 && (
                <span className="reviews-filter-tab__count">{counts.unanswered}</span>
              )}
            </button>
          ))}
        </div>

        {linked.length > 1 && (
          <Select value={locationId} onChange={setLocationId} options={locationOptions} />
        )}
      </div>

      {error && <p className="reviews-error" role="alert">{error}</p>}

      <div className="reviews-list">
        {loading && reviews.length === 0 && <div className="reviews-empty">Cargando reseñas…</div>}

        {!loading && reviews.length === 0 && (
          filtersActive ? (
            <div className="reviews-empty">
              <p>No hay reseñas que coincidan con estos filtros.</p>
              <button
                type="button"
                className="review-row__reply-cancel"
                onClick={() => { setFilter('all'); setSearch(''); setLocationId('all'); }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="reviews-empty">
              <p className="reviews-empty__title">
                {firstReadPending ? 'Estamos leyendo tus reseñas' : 'Tus fichas todavía no tienen reseñas en Google'}
              </p>
              <p>
                {firstReadPending
                  ? 'La primera lectura de una ficha recién vinculada tarda un minuto. Recargá en un rato.'
                  : 'Cuando alguien deje una, va a aparecer acá al día siguiente, o al tocar "Actualizar ahora" en Gestión local.'}
              </p>
            </div>
          )
        )}

        {reviews.map((r) => {
          const isExpanded = expandedId === r.id;
          const isReplying = replyingId === r.id;
          const author = r.is_anonymous || !r.reviewer_name ? 'Usuario de Google' : r.reviewer_name;
          const branch = r.google_locations?.locations?.name ?? r.google_locations?.title ?? '';

          return (
            <div key={r.id} className="review-row-wrap">
              <div className="review-row">
                <div className="review-row__avatar">{initialsOf(author)}</div>

                <div className="review-row__info">
                  <span className="review-row__author">{author}</span>
                  <span className="review-row__meta">
                    {branch && `${branch} · `}{formatRelativeTime(r.created_time)}
                  </span>
                </div>

                <StarRow rating={r.star_rating} />

                <button
                  type="button"
                  className="review-row__snippet review-row__snippet--button"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  aria-expanded={isExpanded}
                >
                  {r.comment || <em>Sin texto, sólo puntaje</em>}
                </button>

                <div className="review-row__action">
                  {r.reply_comment ? (
                    <button type="button" className="review-row__done-btn" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Respondida
                    </button>
                  ) : canReply ? (
                    <button type="button" className="review-row__respond-btn" onClick={() => startReply(r)}>
                      Responder
                    </button>
                  ) : null}
                </div>
              </div>

              {isExpanded && (
                <div className="review-row__panel">
                  {r.comment && <p className="review-row__full">{r.comment}</p>}

                  {r.reply_comment && !isReplying && (
                    <>
                      <span className="review-row__panel-label">Tu respuesta</span>
                      <p>{r.reply_comment}</p>
                      {canReply && (
                        <button type="button" className="review-row__edit-btn" onClick={() => startReply(r)}>
                          Editar respuesta
                        </button>
                      )}
                    </>
                  )}

                  {isReplying && (
                    <>
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Escribí una respuesta pública. La va a ver cualquiera en Google Maps."
                        rows={3}
                        maxLength={4096}
                        autoFocus
                      />
                      {replyError && <p className="reviews-error" role="alert">{replyError}</p>}
                      <div className="review-row__reply-actions">
                        <button type="button" className="review-row__reply-cancel" onClick={() => setReplyingId(null)} disabled={publishing}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="review-row__reply-submit"
                          onClick={() => submitReply(r)}
                          disabled={!draft.trim() || publishing}
                        >
                          {publishing ? 'Publicando…' : 'Publicar en Google'}
                        </button>
                      </div>
                    </>
                  )}

                  {r.google_locations?.maps_uri && (
                    <a className="review-row__google-link" href={r.google_locations.maps_uri} target="_blank" rel="noopener noreferrer">
                      Ver la ficha en Google Maps
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {hasMore && (
          <div className="reviews-more">
            <button type="button" className="review-row__reply-cancel" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
