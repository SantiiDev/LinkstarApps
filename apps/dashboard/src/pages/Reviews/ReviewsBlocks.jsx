import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import SoonBadge from '../../components/SoonBadge/SoonBadge';
import SelectField, { FilterField } from '../../components/Select/SelectField';
import { formatRelativeTime, initialsFor } from '../../lib/dashboardApi';
import { settingsTabPath } from '../../lib/routes';
import {
  originalReviewText,
  REVIEW_RATING_OPTIONS,
  REVIEW_SORT_OPTIONS,
  REVIEW_STATUS_OPTIONS,
  REVIEW_TYPE_OPTIONS,
} from '../../lib/googleApi';

/*
 * Las piezas de la bandeja de Reseñas, sólo presentación: la barra de filtros,
 * la lista y el detalle. Las usan la pantalla real (ReviewsScreen) y la maqueta
 * que va detrás del modal de Google (ReviewsMockup), así las dos se ven iguales
 * y el diseño se cambia en un solo lugar — el mismo esquema que CompanyBlocks.
 *
 * Reciben filas con la forma de `google_reviews` tal como las devuelve
 * fetchReviewPage (con `google_locations` y `google_review_analysis` embebidas).
 * Ninguna pieza consulta nada ni inventa un valor.
 */

/* ─── Helpers de una fila ────────────────────────────────────────────────── */

function authorOf(review) {
  return review.is_anonymous || !review.reviewer_name ? 'Usuario de Google' : review.reviewer_name;
}

function branchOf(review) {
  return review.google_locations?.locations?.name ?? review.google_locations?.title ?? '';
}

/* El tono, cuando viene embebido en la fila (filtro por Tipo, o la maqueta). El
 * embed 1 a 1 llega como objeto; se acepta también un array por si PostgREST
 * no detecta la relación como única. Si no viene, la pantalla lo pasa aparte. */
function sentimentOf(review) {
  const analysis = review.google_review_analysis;
  return (Array.isArray(analysis) ? analysis[0] : analysis)?.sentiment ?? null;
}

const SENTIMENT_LABELS = { positive: 'Positiva', neutral: 'Neutra', negative: 'Negativa' };

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

export function StarRow({ rating, size = 13 }) {
  return (
    <span className="reviews-star-row" role="img" aria-label={rating ? `${rating} de 5 estrellas` : 'Sin puntaje'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={n <= rating ? '#F59E0B' : 'none'} stroke={n <= rating ? '#F59E0B' : 'rgba(27,26,46,0.25)'} strokeWidth="2" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

/* ─── Filtros ────────────────────────────────────────────────────────────── */

/* `pendingCount` se agrega a «Sin responder» (como Tapstar: «Sin responder
 * (65)»). Sin Business, las opciones de Tipo van deshabilitadas: es el tono que
 * detecta la IA, y una cuenta gratis no recibe ese dato. */
export function ReviewsToolbar({ filters, onFilter, search, onSearch, locationOptions, pendingCount, isBusiness }) {
  const statusOptions = REVIEW_STATUS_OPTIONS.map((opt) => (
    opt.value === 'pending' && pendingCount != null ? { ...opt, label: `${opt.label} (${pendingCount})` } : opt
  ));
  const typeOptions = isBusiness
    ? REVIEW_TYPE_OPTIONS
    : REVIEW_TYPE_OPTIONS.map((opt) => (opt.value === 'all' ? opt : { ...opt, label: `${opt.label} · Business`, disabled: true }));

  const showLocation = locationOptions.length > 2;

  return (
    <div className="reviews-card reviews-toolbar" style={{ '--reviews-filters': showLocation ? 5 : 4 }}>
      {showLocation && (
        <SelectField label="Local" icon="store" value={filters.locationId} onChange={(v) => onFilter({ locationId: v })} options={locationOptions} />
      )}
      <SelectField label="Rating" value={filters.rating} onChange={(v) => onFilter({ rating: v })} options={REVIEW_RATING_OPTIONS} />
      <SelectField label="Estado" value={filters.status} onChange={(v) => onFilter({ status: v })} options={statusOptions} />
      <SelectField label="Ordenar" value={filters.sort} onChange={(v) => onFilter({ sort: v })} options={REVIEW_SORT_OPTIONS} />
      <SelectField label="Tipo" value={filters.sentiment} onChange={(v) => onFilter({ sentiment: v })} options={typeOptions} />
      <FilterField label="Buscar" icon="search" className="reviews-toolbar__search">
        <input
          type="search"
          className="ls-field__input"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Cliente o texto…"
          aria-label="Buscar reseñas"
        />
      </FilterField>
    </div>
  );
}

/* ─── Lista ──────────────────────────────────────────────────────────────── */

const LIST_TITLES = {
  all: 'Todas las reseñas',
  answered: 'Reseñas respondidas',
  pending: 'Reseñas no respondidas',
};

/* «Anterior / Siguiente» y «Mostrando 16–30 de 146 reseñas». */
function Pager({ page, pageSize, total, onPage }) {
  if (!total) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <footer className="reviews-pager">
      <div className="reviews-pager__buttons">
        <button type="button" className="reviews-btn reviews-btn--ghost" onClick={() => onPage(page - 1)} disabled={page === 0}>
          <Icon name="chevronLeft" size={15} /> Anterior
        </button>
        <button type="button" className="reviews-btn reviews-btn--ghost" onClick={() => onPage(page + 1)} disabled={last >= total}>
          Siguiente <Icon name="chevronRight" size={15} />
        </button>
      </div>
      <p className="reviews-pager__info">Mostrando {first}–{last} de {total} reseña{total === 1 ? '' : 's'}</p>
    </footer>
  );
}

export function ReviewList({
  status, count, reviews, selectedId, onSelect, showBranch,
  lastRead, sync, children, page, pageSize, onPage,
}) {
  return (
    <section className="reviews-card reviews-list" aria-label="Reseñas">
      <header className="reviews-list__head">
        <h2 className="reviews-list__title">{LIST_TITLES[status] ?? LIST_TITLES.all}</h2>
        <div className="reviews-list__meta">
          {count != null && <strong>{count} reseña{count === 1 ? '' : 's'}</strong>}
          {sync?.syncing ? (
            <span className="reviews-list__sync"><Icon name="refresh" size={12} className="reviews-spin" /> Sincronizando reseñas en segundo plano…</span>
          ) : (
            lastRead && <span>Última lectura: {formatRelativeTime(lastRead).toLowerCase()}</span>
          )}
          {sync?.visible && !sync.syncing && (
            <button type="button" className="reviews-list__refresh" onClick={sync.onRefresh}>
              <Icon name="refresh" size={12} /> Actualizar
            </button>
          )}
        </div>
        {sync?.message && <p className="reviews-list__notice" role="status">{sync.message}</p>}
      </header>

      {/* `key` por página: al pasar de página la lista vuelve arriba. */}
      <div className="reviews-list__scroll" key={page}>
        {children}
        {reviews.map((r) => {
          const author = authorOf(r);
          const branch = branchOf(r);
          const text = originalReviewText(r.comment);
          return (
            <button
              key={r.id}
              type="button"
              className={`review-card${r.id === selectedId ? ' review-card--active' : ''}`}
              onClick={() => onSelect(r.id)}
              aria-pressed={r.id === selectedId}
            >
              <span className="review-card__avatar" aria-hidden="true">{initialsFor(author)}</span>
              <span className="review-card__body">
                <span className="review-card__top">
                  <span className="review-card__author">{author}</span>
                  <StarRow rating={r.star_rating} size={12} />
                </span>
                <span className="review-card__meta">
                  {showBranch && branch && `${branch} · `}{formatRelativeTime(r.created_time)}
                  {r.reply_comment && (
                    <span className="review-card__done"><Icon name="check" size={11} strokeWidth={3} /> Respondida</span>
                  )}
                </span>
                <span className={`review-card__preview${text ? '' : ' review-card__preview--empty'}`}>
                  {text || 'Sin texto, sólo puntaje'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Pager page={page} pageSize={pageSize} total={count} onPage={onPage} />
    </section>
  );
}

/* ─── Detalle ────────────────────────────────────────────────────────────── */

/* Lo que ve una cuenta gratis debajo de la respuesta. Sin contador: no hay
 * backend que cuente, y «te quedan N» sería un número inventado. */
function AiUpsell() {
  const navigate = useNavigate();
  return (
    <div className="reviews-ai-upsell">
      <div className="reviews-ai-upsell__text">
        <p className="reviews-ai-upsell__title"><Icon name="sparkles" size={15} /> Respondé tus reseñas con IA</p>
        <p className="reviews-ai-upsell__desc">
          Una respuesta escrita con tu tono de marca, lista para revisar y publicar. Incluida en el plan Business.
        </p>
      </div>
      <button type="button" className="reviews-btn reviews-btn--primary" onClick={() => navigate(settingsTabPath('plan'))}>
        Probar Business
      </button>
    </div>
  );
}

export function ReviewDetail({
  review, sentiment: sentimentProp = null, showBranch, canReply, isBusiness,
  draft, onDraft, editing, onEdit, onCancelEdit, onPublish, publishing, replyError,
  onOpenTone, onBack,
}) {
  const navigate = useNavigate();

  if (!review) {
    return (
      <section className="reviews-card reviews-detail reviews-detail--empty">
        <Icon name="message" size={28} />
        <p>Elegí una reseña de la lista para leerla y responderla.</p>
      </section>
    );
  }

  const author = authorOf(review);
  const branch = branchOf(review);
  const sentiment = sentimentProp ?? sentimentOf(review);
  const text = originalReviewText(review.comment);
  const showReplyBox = canReply && (!review.reply_comment || editing);

  return (
    <section className="reviews-card reviews-detail" aria-label={`Reseña de ${author}`}>
      <button type="button" className="reviews-detail__back" onClick={onBack}>
        <Icon name="arrowLeft" size={15} /> Volver a la lista
      </button>

      <header className="reviews-detail__head">
        <span className="review-card__avatar review-card__avatar--lg" aria-hidden="true">{initialsFor(author)}</span>
        <div className="reviews-detail__who">
          <span className="reviews-detail__author">{author}</span>
          {showBranch && branch && <span className="reviews-detail__branch">{branch}</span>}
          <span className="reviews-detail__rating">
            <StarRow rating={review.star_rating} size={16} />
            <strong>{review.star_rating ? `${review.star_rating}.0` : '—'}</strong>
            {sentiment && (
              <span className={`reviews-sentiment reviews-sentiment--${sentiment}`}>{SENTIMENT_LABELS[sentiment]}</span>
            )}
          </span>
        </div>
        {canReply && (
          <button type="button" className="reviews-btn reviews-btn--primary reviews-detail__tone" onClick={onOpenTone}>
            <Icon name="palette" size={15} /> Crear tono de marca
          </button>
        )}
      </header>

      <p className={`reviews-detail__text${text ? '' : ' reviews-detail__text--empty'}`}>
        {text || 'Sin texto, sólo puntaje.'}
      </p>

      <div className="reviews-detail__row">
        <span className="reviews-detail__date">{formatDate(review.created_time)}</span>
        <div className="reviews-detail__links">
          <button type="button" className="reviews-btn reviews-btn--ghost" disabled title="Próximamente">
            <Icon name="share" size={14} /> <Icon name="instagram" size={14} /> Compartir <SoonBadge />
          </button>
        </div>
      </div>

      {review.reply_comment && !editing && (
        <div className="reviews-detail__reply">
          <span className="reviews-detail__label">Tu respuesta</span>
          <p>{review.reply_comment}</p>
          {canReply && (
            <button type="button" className="reviews-detail__edit" onClick={onEdit}>Editar respuesta</button>
          )}
        </div>
      )}

      {showReplyBox && (
        <div className="reviews-detail__compose">
          <label className="reviews-detail__label" htmlFor="review-reply">Respuesta</label>
          <textarea
            id="review-reply"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            placeholder="Escribí una respuesta pública. La va a ver cualquiera en Google Maps."
            rows={5}
            maxLength={4096}
          />
          {replyError && <p className="reviews-error" role="alert">{replyError}</p>}

          <div className="reviews-detail__actions">
            {/* La IA la conecta el backend de la fase 5; hasta entonces el botón
                se ve, pero no hace nada en Business y lleva a Configuración → Plan en
                gratis. */}
            {isBusiness ? (
              <button type="button" className="reviews-btn reviews-btn--ai" disabled title="Próximamente">
                <Icon name="sparkles" size={15} /> Generar respuesta con IA <span className="reviews-soon">Próximamente</span>
              </button>
            ) : (
              <button type="button" className="reviews-btn reviews-btn--ai reviews-btn--locked" onClick={() => navigate(settingsTabPath('plan'))}>
                <Icon name="lock" size={14} /> Generar respuesta con IA
              </button>
            )}
            <button
              type="button"
              className="reviews-btn reviews-btn--send"
              onClick={onPublish}
              disabled={!draft.trim() || publishing}
            >
              <Icon name="send" size={14} /> {publishing ? 'Publicando…' : 'Publicar en Google'}
            </button>
          </div>

          {editing && (
            <button type="button" className="reviews-detail__edit" onClick={onCancelEdit} disabled={publishing}>
              Cancelar edición
            </button>
          )}

          {!isBusiness && <AiUpsell />}
        </div>
      )}
    </section>
  );
}
