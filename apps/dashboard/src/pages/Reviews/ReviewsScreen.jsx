import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import { useOrg } from '../../context/OrgContext';
import {
  DEFAULT_REVIEW_FILTERS,
  fetchGoogleLocations,
  fetchReviewCounts,
  fetchReviewPage,
  fetchReviewSentiments,
  replyToReview,
  REVIEWS_INBOX_PAGE_SIZE,
  useGoogleSyncRequest,
} from '../../lib/googleApi';
import BrandToneModal from './BrandToneModal';
import { ReviewDetail, ReviewList, ReviewsToolbar } from './ReviewsBlocks';
import './Reviews.css';

/*
 * Reseñas — la pantalla real, como bandeja de entrada (estructura de Tapstar).
 * Lee `google_reviews` y `google_locations` (0024/0025) bajo RLS: un manager ve
 * sólo las fichas de sus sucursales sin que esta pantalla haga nada.
 *
 * Sólo se renderiza con Google conectado; sin conexión, Reviews.jsx muestra la
 * maqueta detrás de GoogleGate. Las piezas (filtros, lista, detalle) están en
 * ReviewsBlocks y las comparte con esa maqueta.
 *
 *   - Los filtros se combinan y se aplican en la base (la lista es paginada).
 *     «Tipo» es el tono del texto según la IA (0033), sólo Business.
 *   - Los totales de arriba salen de dos fuentes distintas, a propósito: las
 *     reseñas totales y el rating son el contador de Google por ficha (el mismo
 *     que alimenta los snapshots), y respondidas / sin responder salen de las
 *     reseñas leídas. Google cuenta también reseñas sin texto que la API no
 *     siempre devuelve, así que la suma de las dos no tiene por qué coincidir.
 *   - «Publicar en Google» publica de verdad, en nombre del negocio. Por eso lo
 *     que se muestra después es lo que devolvió Google, no el borrador. Con el
 *     filtro «Sin responder», la reseña respondida sale de la lista y el detalle
 *     pasa a la siguiente: es una bandeja, se vacía respondiendo.
 *   - La IA y el tono de marca son sólo frontend por ahora (ver BrandToneModal).
 */

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

const NO_COMPOSE = { id: null, text: '', editing: false, error: null };

/* `initialFilter` son filtros con los que abrir la bandeja. «Responder ahora»
 * de Mi Empresa manda { rating: 'low', status: 'pending', locationId }: las de
 * 1 y 2 estrellas sin responder del local que estaba mirando, que son
 * exactamente las que cuenta su aviso. (Antes abría «Tipo: Negativas», el tono
 * de la IA, que es otra lista y no coincidía con el número del aviso.) */
function initialFilters(initialFilter) {
  if (!initialFilter || typeof initialFilter !== 'object') return DEFAULT_REVIEW_FILTERS;
  const allowed = Object.fromEntries(
    Object.entries(initialFilter).filter(([key]) => key in DEFAULT_REVIEW_FILTERS)
  );
  return { ...DEFAULT_REVIEW_FILTERS, ...allowed };
}

export default function ReviewsScreen({ google, onNavigateSettings, initialFilter }) {
  const { org, isBusiness } = useOrg();
  const orgId = org?.organization_id;
  // Mismo criterio que google_review_reply_target() (0026). Para un manager la
  // base además restringe a sus sucursales; un viewer no ve el cuadro.
  const canReply = ['owner', 'admin', 'manager'].includes(org?.role);
  // POST /api/google/sync es de owner/admin.
  const canSync = ['owner', 'admin'].includes(org?.role) && google.connection?.status === 'active';

  const [fichas, setFichas] = useState(null);
  const [counts, setCounts] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sentiments, setSentiments] = useState(() => new Map());

  const [filters, setFilters] = useState(() => initialFilters(initialFilter));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const [selectedId, setSelectedId] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  // El borrador va atado a la reseña para la que se escribió: al cambiar de
  // reseña deja de aplicar solo, y un texto a medio escribir para otra persona
  // nunca queda listo para publicarse en ésta.
  const [compose, setCompose] = useState(NO_COMPOSE);
  const [publishing, setPublishing] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);

  const sync = useGoogleSyncRequest(google);
  const [syncMessage, setSyncMessage] = useState(null);

  const loadSummary = useCallback(async () => {
    const [locations, reviewCounts] = await Promise.all([fetchGoogleLocations(orgId), fetchReviewCounts(orgId)]);
    setFichas(locations);
    setCounts(reviewCounts);
  }, [orgId]);

  const queryArgs = useMemo(() => ({
    ...filters,
    search: debouncedSearch,
    locationId: filters.locationId === 'all' ? null : filters.locationId,
  }), [filters, debouncedSearch]);

  /* La etiqueta de tono de las reseñas cargadas (Business). Si falla, la lista
   * queda igual, sin etiquetas. */
  const loadSentiments = useCallback((rows) => {
    if (!isBusiness || !rows.length) return;
    fetchReviewSentiments(orgId, rows.map((r) => r.id))
      .then((found) => setSentiments((prev) => new Map([...prev, ...found])))
      .catch((err) => console.error('No se pudo leer el tono de las reseñas:', err));
  }, [isBusiness, orgId]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([loadSummary(), fetchReviewPage(orgId, { ...queryArgs, page })])
      .then(([, result]) => {
        if (cancelled) return;
        // Una página que quedó vacía (se respondió la última de la última
        // página con «Sin responder») vuelve a la anterior.
        if (!result.rows.length && page > 0) {
          setPage(page - 1);
          return;
        }
        setReviews(result.rows);
        setTotal(result.count);
        // La elegida se conserva si sigue en la página; si no, la primera.
        setSelectedId((prev) => (result.rows.some((r) => r.id === prev) ? prev : result.rows[0]?.id ?? null));
        loadSentiments(result.rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('No se pudieron cargar las reseñas:', err);
        setError(queryArgs.sentiment !== 'all'
          ? 'No pudimos filtrar por tipo. Probá con «Tipo: Todas».'
          : 'No pudimos cargar tus reseñas. Probá recargar la página.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryArgs, page, loadSummary, loadSentiments, orgId, reloadKey]);

  // Cuando termina una lectura pedida desde acá, se relee todo.
  useEffect(() => {
    if (sync.result === 'done') {
      setSyncMessage(null);
      setReloadKey((k) => k + 1);
    }
    if (sync.result === 'slow') setSyncMessage('La lectura está tardando. Las reseñas nuevas van a aparecer en unos minutos.');
  }, [sync.result]);

  async function refresh() {
    setSyncMessage(null);
    try {
      await sync.syncNow();
    } catch (err) {
      setSyncMessage(err.message);
    }
  }

  // Cambiar un filtro o la búsqueda vuelve a la primera página.
  function changeFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(0);
  }

  function changeSearch(value) {
    setSearch(value);
    setPage(0);
  }

  const selected = reviews.find((r) => r.id === selectedId) ?? null;
  const current = compose.id === selectedId ? compose : NO_COMPOSE;
  const updateCompose = (patch) => setCompose({ ...current, id: selectedId, ...patch });

  async function publish() {
    if (!selected) return;
    setPublishing(true);
    updateCompose({ error: null });
    try {
      const saved = await replyToReview(selected.id, current.text);
      if (filters.status === 'pending') {
        // Sale de la bandeja y el detalle pasa a la que ocupa su lugar. Se
        // relee la página para que la primera de la siguiente suba a ésta (y
        // los totales); la recarga conserva la elegida.
        const index = reviews.findIndex((r) => r.id === selected.id);
        const rest = reviews.filter((r) => r.id !== selected.id);
        setReviews(rest);
        setTotal((t) => (t == null ? t : Math.max(0, t - 1)));
        setSelectedId(rest[Math.min(index, rest.length - 1)]?.id ?? null);
        if (!rest.length) setMobileDetail(false);
        setReloadKey((k) => k + 1);
      } else {
        setReviews((prev) => prev.map((r) => (r.id === selected.id
          ? { ...r, reply_comment: saved.comment, reply_updated_time: saved.updatedTime }
          : r)));
        loadSummary().catch(() => {});
      }
      setCompose(NO_COMPOSE);
    } catch (err) {
      updateCompose({ error: err.message });
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
  const showBranch = linked.length > 1;

  const locationOptions = [
    { value: 'all', label: 'Todos los locales' },
    ...linked.map((f) => ({ value: f.location_id, label: f.locations?.name ?? f.title ?? 'Sucursal' })),
  ];
  const filtersActive = Object.keys(DEFAULT_REVIEW_FILTERS)
    .some((key) => key !== 'sort' && filters[key] !== DEFAULT_REVIEW_FILTERS[key]) || debouncedSearch.trim();

  const header = (
    <PageHeader
      eyebrow="Gestión de reseñas"
      title="Bandeja de reseñas"
      subtitle="Respondé a tus clientes desde tu perfil de Google"
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
        <div className="reviews-card reviews-empty">
          <p className="reviews-empty__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
          <p>
            Tu cuenta de Google está conectada. Ahora elegí cuáles de sus fichas son de este negocio y a qué
            sucursal corresponde cada una: sólo leemos las reseñas de las fichas vinculadas.
            {fichas.length === 0 && ' Si todavía no ves tus fichas allá, esperá un minuto: estamos leyendo tu cuenta.'}
          </p>
          {onNavigateSettings && (
            <button type="button" className="reviews-btn reviews-btn--primary" onClick={() => onNavigateSettings('local')}>
              Vincular en Gestión local
            </button>
          )}
        </div>
      </div>
    );
  }

  let emptyState = null;
  if (loading && reviews.length === 0) {
    emptyState = <div className="reviews-empty">Cargando reseñas…</div>;
  } else if (!loading && reviews.length === 0) {
    emptyState = filtersActive ? (
      <div className="reviews-empty">
        <p>No hay reseñas que coincidan con estos filtros.</p>
        {filters.sentiment !== 'all' && (
          <p className="reviews-empty__hint">
            El tipo sale del análisis con IA de cada reseña con texto: las que todavía no se analizaron no
            aparecen con este filtro.
          </p>
        )}
        <button
          type="button"
          className="reviews-btn reviews-btn--ghost"
          onClick={() => { setFilters(DEFAULT_REVIEW_FILTERS); changeSearch(''); }}
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
            : 'Cuando alguien deje una, va a aparecer acá al día siguiente, o al tocar «Actualizar».'}
        </p>
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

      <ReviewsToolbar
        filters={filters}
        onFilter={changeFilters}
        search={search}
        onSearch={changeSearch}
        locationOptions={locationOptions}
        pendingCount={counts?.unanswered}
        isBusiness={isBusiness}
      />

      {error && <p className="reviews-error" role="alert">{error}</p>}

      <div className={`reviews-inbox${mobileDetail ? ' reviews-inbox--detail' : ''}`}>
        <ReviewList
          status={filters.status}
          count={total}
          reviews={reviews}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setMobileDetail(true); }}
          showBranch={showBranch}
          lastRead={google.connection?.last_synced_at}
          sync={{ visible: canSync, syncing: sync.syncing, onRefresh: refresh, message: syncMessage }}
          page={page}
          pageSize={REVIEWS_INBOX_PAGE_SIZE}
          onPage={setPage}
        >
          {emptyState}
        </ReviewList>

        <ReviewDetail
          review={selected}
          sentiment={selected ? sentiments.get(selected.id) ?? null : null}
          showBranch={showBranch}
          canReply={canReply}
          isBusiness={isBusiness}
          draft={current.text}
          onDraft={(text) => updateCompose({ text })}
          editing={current.editing}
          onEdit={() => updateCompose({ editing: true, text: selected?.reply_comment ?? '', error: null })}
          onCancelEdit={() => setCompose(NO_COMPOSE)}
          onPublish={publish}
          publishing={publishing}
          replyError={current.error}
          onOpenTone={() => setToneOpen(true)}
          onBack={() => setMobileDetail(false)}
        />
      </div>

      {toneOpen && <BrandToneModal onClose={() => setToneOpen(false)} />}
    </div>
  );
}
