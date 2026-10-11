import Icon from '../../components/Icon/Icon';
import SelectField from '../../components/Select/SelectField';
import { TYPES } from './googlePostsModel';

/*
 * Publicaciones, sólo presentación. Lo usan la pantalla real
 * (GooglePostsScreen, que lee y publica en Google) y su maqueta de GoogleGate
 * (GooglePostsMockup), así las dos se ven idénticas — el mismo patrón que
 * GoogleMetricsBlocks.
 *
 * Ninguna publicación muestra vistas ni clics: Google dejó de darlos por
 * publicación en 2023.
 */

const STATE_LABELS = {
  LIVE: ['Publicada', 'live'],
  PROCESSING: ['En revisión', 'processing'],
  REJECTED: ['Rechazada por Google', 'rejected'],
  SCHEDULED: ['Programada', 'processing'],
  RECURRING: ['Recurrente', 'live'],
};

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function scheduleLabel(schedule) {
  if (!schedule?.startDate) return null;
  const d = ({ year, month, day }) => `${day}/${month}/${year}`;
  return `${d(schedule.startDate)} – ${d(schedule.endDate ?? schedule.startDate)}`;
}

/* El cupo del plan gratis (1 por mes); con Business no se muestra. `quota`:
   { usadas, limite } de google_post_quota (0031). */
export function QuotaBanner({ quota, isBusiness, onNavigateSettings }) {
  if (!quota || isBusiness) return null;
  const left = quota.limite != null ? Math.max(0, quota.limite - quota.usadas) : null;
  const out = left === 0;
  return (
    <div className={`gbpo-quota ${out ? 'gbpo-quota--out' : ''}`}>
      <span>
        {out
          ? 'Ya usaste tu publicación gratis de este mes. Con Business publicás sin límite.'
          : `Te queda ${left} publicación gratis este mes.`}
      </span>
      {onNavigateSettings && (
        <button type="button" className="gbpo-quota__link" onClick={() => onNavigateSettings('plan')}>
          Ver plan Business
        </button>
      )}
    </div>
  );
}

/* El mismo selector de local que Perfil y Métricas, aunque haya una sola ficha:
   deja a la vista en qué ficha se va a publicar. Sin rango de fechas. */
export function PostsToolbar({ options, selected, onSelect }) {
  return (
    <div className="gb-card gbp-toolbar">
      <SelectField label="Local" icon="store" value={selected ?? ''} onChange={onSelect} options={options} />
    </div>
  );
}

/* Título del compositor y la barra de pasos, como Tapstar: naranja lo hecho y el
   paso actual; debajo, un paso hecho va en verde con ✓, el actual en negrita y
   los que faltan en gris. `steps`: stepsFor(tipo); `current`: índice. */
export function ComposerHeader({ steps, current }) {
  return (
    <>
      <h3 className="gb-card__title">Nueva publicación</h3>
      <div className="gbpo-steps" aria-label={`Paso ${current + 1} de ${steps.length}`}>
        <span className="gbpo-steps__count">Paso {current + 1} de {steps.length}</span>
        <div className="gbpo-steps__bars" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
          {steps.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'todo';
            return (
              <div key={s.id} className={`gbpo-steps__bar gbpo-steps__bar--${state}`}>
                <span>
                  {state === 'done' && <Icon name="check" size={11} strokeWidth={3} />}
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* Paso 1 del compositor: qué tipo de publicación. */
export function PostTypePicker({ value, onChange }) {
  return (
    <>
      <h4 className="gbpo-question">¿Qué querés publicar?</h4>
      <p className="gbp-hint">Google permite tres tipos de publicación en tu ficha. Elegí la que mejor encaje.</p>
      <div className="gbpo-types">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`gbpo-type ${value === t.id ? 'gbpo-type--on' : ''}`}
            onClick={() => onChange(t.id)}
            aria-pressed={value === t.id}
          >
            <span className={`gbpo-type__icon gbpo-type__icon--${t.tone}`}><Icon name={t.icon} size={18} /></span>
            {value === t.id && (
              <span className="gbpo-type__check"><Icon name="check" size={12} strokeWidth={3} /></span>
            )}
            <strong>{t.title}</strong>
            <span>{t.text}</span>
            <em>{t.example}</em>
          </button>
        ))}
      </div>
    </>
  );
}

/* «Publicaciones recientes». `posts`: lo que devuelve GET …/posts, o null
   mientras carga. `onDelete` sólo si el usuario puede borrar. */
export function PostsList({ posts, loading, deleting, onDelete }) {
  return (
    <div className="gb-card">
      <div className="gb-card__header gbpo-list__header">
        <h3 className="gb-card__title gbpo-list__title">
          <Icon name="history" size={18} />
          Publicaciones recientes {posts ? `(${posts.length})` : ''}
        </h3>
        <span className="gb-card__subtitle">Lo que está publicado en tu ficha de Google</span>
      </div>
      {loading && <p className="gbm-muted">Leyendo tus publicaciones en Google…</p>}
      {posts?.length === 0 && <p className="gbm-muted">Todavía no hay publicaciones en esta ficha.</p>}
      <div className="gbpo-list">
        {posts?.map((p) => {
          const [label, tone] = STATE_LABELS[p.state] ?? [p.state ?? 'Sin estado', 'processing'];
          const typeLabel = TYPES.find((t) => t.id === p.topicType)?.title ?? p.topicType;
          return (
            <div key={p.name} className="gbpo-post">
              {p.mediaUrl ? <img src={p.mediaUrl} alt="" /> : <div className="gbpo-post__noimg" />}
              <div className="gbpo-post__body">
                <div className="gbpo-post__top">
                  <span className="gbpo-chip">{typeLabel}</span>
                  <span className={`gbpo-state gbpo-state--${tone}`}>{label}</span>
                </div>
                {p.eventTitle && <strong>{p.eventTitle}</strong>}
                <p>{p.summary}</p>
                <span className="gbp-hint">
                  {scheduleLabel(p.schedule) ?? `Publicada el ${formatDate(p.createTime)}`}
                  {p.couponCode ? ` · Cupón ${p.couponCode}` : ''}
                </span>
              </div>
              <div className="gbpo-post__actions">
                {p.searchUrl && (
                  <a className="gbp-link" href={p.searchUrl} target="_blank" rel="noopener noreferrer">Ver en Google</a>
                )}
                {onDelete && (
                  <button type="button" className="gbp-btn-ghost" onClick={() => onDelete(p)} disabled={deleting === p.name}>
                    {deleting === p.name ? 'Borrando…' : 'Borrar'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
