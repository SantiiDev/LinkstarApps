import Select from '../../components/Select/Select';
import TrendChart from '../../components/TrendChart/TrendChart';
import Icon from '../../components/Icon/Icon';
import Switch from '../../components/Switch/Switch';
import KpiCard, { KpiTrend as Trend } from '../../components/KpiCard/KpiCard';
import { colorForIndex, formatRelativeTime, initialsFor } from '../../lib/dashboardApi';
import { RANGE_OPTIONS, formatNumber, formatOneDecimal, starGoal } from '../../lib/companyOverview';

/*
 * Los bloques de Mi Empresa, sólo presentación: reciben los números ya
 * calculados y los dibujan. Los usan la pantalla real (CompanyScreen) y la
 * maqueta que va detrás del modal de Google (CompanyMockup), así las dos se ven
 * idénticas y un cambio de diseño se hace una sola vez.
 *
 * Ningún bloque inventa un valor: cuando lo que reciben es null dicen «—» o
 * explican qué falta. Los números de la maqueta son inventados y viven en
 * CompanyMockup.jsx, que sólo se renderiza dentro de GoogleGate.
 */

/* ─── Estrellas (rellenas, por eso no van en components/Icon) ────────────── */

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

function Stars({ value, size = 13 }) {
  return (
    <span className="company-stars" role="img" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
          className={i <= Math.round(value) ? 'company-stars__on' : 'company-stars__off'}>
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

function StarGlyph({ size = 14 }) {
  return (
    <svg className="company-star-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
  );
}

/* ─── Filtros ────────────────────────────────────────────────────────────── */

export function CompanyToolbar({ locationOptions, locationId, onLocation, range, onRange }) {
  return (
    <div className="company-card company-toolbar">
      <div className="company-field">
        <span className="company-field__label">Local</span>
        <div className="company-field__control">
          <span className="company-field__icon"><Icon name="store" size={15} /></span>
          <Select value={locationId} onChange={onLocation} options={locationOptions} triggerClassName="ls-select-field ls-select-field--block ls-select-field--icon" />
        </div>
      </div>
      <div className="company-field">
        <span className="company-field__label">Rango de fechas</span>
        <div className="company-field__control">
          <span className="company-field__icon"><Icon name="calendar" size={15} /></span>
          <Select value={range} onChange={onRange} options={RANGE_OPTIONS} triggerClassName="ls-select-field ls-select-field--block ls-select-field--icon" />
        </div>
      </div>
    </div>
  );
}

/* ─── Alerta de negativas sin responder ──────────────────────────────────── */

export function NegativeAlert({ count, onRespond }) {
  if (!count) return null;
  return (
    <div className="company-alert" role="status">
      <div className="company-alert__icon"><Icon name="alert" size={20} /></div>
      <div className="company-alert__body">
        <p className="company-alert__title">
          {count === 1 ? '1 reseña negativa sin responder' : `${formatNumber(count)} reseñas negativas sin responder`}
        </p>
        <p className="company-alert__text">
          Responder rápido a las reseñas de 1 y 2 estrellas protege tu reputación: quien lee la queja también lee cómo la atendiste.
        </p>
      </div>
      <button type="button" className="company-alert__cta" onClick={onRespond}>
        Responder ahora <Icon name="arrowRight" size={14} />
      </button>
    </div>
  );
}

/* ─── KPIs (sobre components/KpiCard, compartido con Dispositivos) ───────── */

export function ReviewsKpi({ data, caption }) {
  return (
    <KpiCard
      icon={<Icon name="message" size={16} />}
      color="orange"
      label="Reseñas"
      aside={(
        <div className="kpi-card__aside">
          <span className="kpi-card__aside-value">{data.answered == null ? '—' : formatNumber(data.answered)}</span>
          <span className="kpi-card__aside-label"><Icon name="reply" size={12} /> Respondidas</span>
          <span className="kpi-card__aside-pct">
            {data.answeredPct == null ? 'sin reseñas' : `${data.answeredPct}% del total`}
          </span>
        </div>
      )}
    >
      <div className="kpi-card__value">{data.value == null ? '—' : formatNumber(data.value)}</div>
      <Trend trend={data.trend} caption={data.value == null ? 'Sin ficha vinculada' : caption} />
    </KpiCard>
  );
}

export function SentimentKpi({ state, caption, onPlans }) {
  let body;
  if (state.status === 'locked') {
    body = (
      <>
        <div className="kpi-card__value kpi-card__value--muted"><Icon name="lock" size={22} /></div>
        <div className="kpi-card__trend">
          <span className="kpi-pill kpi-pill--business">Business</span>
          <span className="kpi-card__caption">Tono de cada reseña, con IA</span>
        </div>
      </>
    );
  } else {
    const captions = {
      pending: 'Analizando tus reseñas',
      empty: 'Sin reseñas analizadas en el período',
      failed: 'No pudimos cargarlo',
      none: 'Sin ficha vinculada',
    };
    body = (
      <>
        <div className="kpi-card__value">{state.value == null ? '—' : <>{state.value}<small>%</small></>}</div>
        <Trend trend={state.status === 'ok' ? state.trend : null} caption={captions[state.status] ?? caption} />
      </>
    );
  }
  return (
    <KpiCard
      icon={<Icon name="heart" size={16} />}
      color="forest"
      label="Sentimiento positivo"
      footer={state.status === 'locked' && (
        <button type="button" className="kpi-card__link" onClick={onPlans}>
          Ver planes <Icon name="arrowRight" size={13} />
        </button>
      )}
    >
      {body}
    </KpiCard>
  );
}

export function RatingKpi({ data, caption }) {
  return (
    <KpiCard icon={<Icon name="star" size={16} />} color="gold" label="Puntuación">
      <div className="kpi-card__value">
        {data.value == null ? '—' : <>{formatOneDecimal(data.value)}<small>/5</small></>}
      </div>
      <Trend
        trend={data.trend}
        caption={data.value == null ? (data.reason ?? 'Sin reseñas en el período') : caption}
      />
    </KpiCard>
  );
}

export function SeoKpi({ state, onOpen }) {
  const { status, summary } = state;
  return (
    <KpiCard
      icon={<Icon name="shield" size={16} />}
      color="navy"
      label="SEO Local"
      footer={(
        <button type="button" className="kpi-card__link" onClick={onOpen}>
          Ver análisis <Icon name="arrowRight" size={13} />
        </button>
      )}
    >
      <div className="kpi-card__value">
        {status === 'ok' ? <>{summary.score}<small>/100</small></> : '—'}
      </div>
      <div className="kpi-card__trend">
        {status === 'ok' && <span className={`kpi-pill kpi-pill--${summary.tone}`}>{summary.level}</span>}
        <span className="kpi-card__caption">
          {status === 'loading' && 'Calculando…'}
          {status === 'failed' && 'No pudimos medirlo'}
          {status === 'none' && 'Sin ficha vinculada'}
          {status === 'ok' && summary.count > 1 && `Promedio de ${summary.count} locales`}
        </span>
      </div>
    </KpiCard>
  );
}

/* ─── Tu media de estrellas ──────────────────────────────────────────────── */

export function StarGoalCard({ average, target, onTarget }) {
  if (!average) {
    return (
      <div className="company-goal company-goal--empty">
        <span className="company-goal__eyebrow">Tu media de estrellas</span>
        <p className="company-goal__empty-text">
          Cuando tu ficha vinculada tenga reseñas, acá vas a ver tu nota en Google y cuántas reseñas de 5★ te faltan
          para subir la próxima décima.
        </p>
      </div>
    );
  }

  const top = !average.targets.length;
  const goal = top ? null : starGoal(average, target);
  const options = average.targets.map((t) => ({ value: t, label: formatOneDecimal(t) }));

  return (
    <div className="company-goal">
      <div className="company-goal__score">
        <span className="company-goal__eyebrow">Tu media de estrellas</span>
        <div className="company-goal__value">
          {formatOneDecimal(average.shown)} <StarGlyph size={26} />
        </div>
        <span className="company-goal__caption">
          Sobre {formatNumber(average.total)} reseña{average.total === 1 ? '' : 's'}
          {average.exact && ` · media exacta ${average.mean.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
        </span>
      </div>

      <div className="company-goal__plan">
        {top ? (
          <p className="company-goal__done">
            Tenés la nota máxima que muestra Google. Seguí pidiendo reseñas para sostenerla: cada reseña baja pesa menos
            cuantas más tengas.
          </p>
        ) : (
          <>
            <div className="company-goal__row">
              <span className="company-goal__target-label"><Icon name="target" size={15} /> Objetivo</span>
              <Select value={target} onChange={onTarget} options={options} triggerClassName="ls-select-field" />
              <span className="company-goal__needed">
                {goal.needed === 0
                  ? `Ya llegaste a ${formatOneDecimal(target)}`
                  : <>Te falta{goal.needed === 1 ? '' : 'n'} <strong>{formatNumber(goal.needed)}</strong> reseña{goal.needed === 1 ? '' : 's'} de 5★ para llegar a {formatOneDecimal(target)}</>}
              </span>
            </div>
            <div className="company-goal__bar-row">
              <span className="company-goal__bound">{formatOneDecimal(average.shown)}</span>
              <div className="company-goal__bar" role="progressbar" aria-valuenow={goal.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="company-goal__fill" style={{ width: `max(6px, ${goal.progress}%)` }} />
              </div>
              <span className="company-goal__bound">{formatOneDecimal(target)}</span>
              <span className="company-goal__pct">{goal.progress}%</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Reseñas en el tiempo ───────────────────────────────────────────────── */

export function ReviewsTrendCard({ series, total, mode, onMode }) {
  const rating = mode === 'rating';
  const enough = rating ? series.data.length >= 2 : total > 0;
  return (
    <div className="company-card company-chart-card">
      <div className="company-card__header">
        <div>
          <h3 className="company-card__title">Reseñas en el tiempo</h3>
          <span className="company-card__subtitle">
            {formatNumber(total)} reseña{total === 1 ? '' : 's'} en el período
          </span>
        </div>
        <Switch
          checked={rating}
          onChange={(on) => onMode(on ? 'rating' : 'count')}
          label="Puntuación media"
          color="gold"
        />
      </div>
      {enough ? (
        <TrendChart
          data={series.data}
          labels={series.labels}
          color={rating ? 'gold' : 'orange'}
          seriesName={rating ? 'Puntuación media' : 'Reseñas'}
          yLabel={rating ? 'Estrellas' : 'Reseñas'}
          baseline={rating ? 'auto' : 'zero'}
          formatValue={rating ? (v) => formatOneDecimal(v) : undefined}
        />
      ) : (
        <div className="company-empty">
          <Icon name="activity" size={22} />
          <p>
            {rating && total > 0
              ? 'Hacen falta reseñas en al menos dos tramos del período para ver cómo se mueve la puntuación.'
              : 'No hubo reseñas en este período. Probá con un rango más largo.'}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Distribución por estrellas ─────────────────────────────────────────── */

export function StarDistributionCard({ distribution, total }) {
  return (
    <div className="company-card">
      <div className="company-card__header">
        <div>
          <h3 className="company-card__title">Distribución por estrellas</h3>
          <span className="company-card__subtitle">
            {total ? `Sobre ${formatNumber(total)} reseña${total === 1 ? '' : 's'} del período` : 'Sin reseñas en el período'}
          </span>
        </div>
      </div>
      <div className="star-dist">
        {distribution.map((d) => (
          <div key={d.stars} className="star-dist__row">
            <span className="star-dist__label">{d.stars} <StarGlyph size={12} /></span>
            <div className="star-dist__bar">
              <div className="star-dist__fill" style={{ width: `${d.pct}%` }} />
            </div>
            <span className="star-dist__count">{formatNumber(d.count)}</span>
            <span className="star-dist__pct">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Resumen por local ──────────────────────────────────────────────────── */

function SummaryCell({ label, children }) {
  return (
    <div className="company-summary__cell">
      <span className="company-summary__label">{label}</span>
      <span className="company-summary__value">{children}</span>
    </div>
  );
}

export function LocationSummaryCard({ rows, scansFailed }) {
  return (
    <div className="company-card company-summary">
      <div className="company-card__header">
        <div>
          <h3 className="company-card__title">Resumen por local</h3>
          <span className="company-card__subtitle">Escaneos de tus expositores y reseñas del período, por sucursal</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="company-empty">
          <Icon name="store" size={22} />
          <p>Todavía no cargaste ninguna sucursal. Se agregan desde Configuración → Gestión local.</p>
        </div>
      ) : (
        <div className="company-summary__list">
          {rows.map((r, i) => (
            <div key={r.id} className="company-summary__row">
              <div className="company-summary__name">
                <span className="company-summary__avatar" style={{ background: colorForIndex(i) }}>
                  {(r.name.trim()[0] ?? '?').toUpperCase()}
                </span>
                <span className="company-summary__title">
                  <strong>{r.name}</strong>
                  {!r.linked && <span className="company-summary__tag">Sin ficha de Google</span>}
                </span>
              </div>
              <SummaryCell label="Escaneos">{r.scans == null ? (scansFailed ? '—' : '…') : formatNumber(r.scans)}</SummaryCell>
              <SummaryCell label="Reseñas">{r.reviews == null ? '—' : formatNumber(r.reviews)}</SummaryCell>
              <SummaryCell label="Respuestas">
                {r.answered == null ? '—' : (
                  <>
                    {formatNumber(r.answered)}
                    {r.answeredPct != null && <small> · {r.answeredPct}%</small>}
                  </>
                )}
              </SummaryCell>
              <SummaryCell label="Sentimiento">
                {r.sentiment === 'locked'
                  ? <span className="kpi-pill kpi-pill--business">Business</span>
                  : r.sentiment == null ? '—' : `${r.sentiment}% positivo`}
              </SummaryCell>
              <SummaryCell label="Puntuación">
                {r.rating == null ? '—' : <>{formatOneDecimal(r.rating)} <StarGlyph size={12} /></>}
              </SummaryCell>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Actividad reciente (sólo reseñas) ──────────────────────────────────── */

export function RecentReviewsCard({ items, failed, showLocation, onViewAll }) {
  return (
    <div className="company-card">
      <div className="company-card__header">
        <div>
          <h3 className="company-card__title">Actividad reciente</h3>
          <span className="company-card__subtitle">Las últimas reseñas que recibiste en Google</span>
        </div>
        <button type="button" className="company-card__link" onClick={onViewAll}>Ver todas</button>
      </div>

      {items === null && <p className="company-muted">Cargando reseñas…</p>}
      {failed && <p className="company-muted">No pudimos cargar las últimas reseñas.</p>}
      {items?.length === 0 && !failed && (
        <div className="company-empty">
          <Icon name="message" size={22} />
          <p>Todavía no hay reseñas en tus fichas vinculadas.</p>
        </div>
      )}

      {items?.length > 0 && (
        <ul className="recent-reviews">
          {items.map((r) => {
            const name = r.is_anonymous || !r.reviewer_name ? 'Usuario de Google' : r.reviewer_name;
            const where = r.google_locations?.locations?.name ?? r.google_locations?.title;
            return (
              <li key={r.id} className="recent-review">
                <span className="recent-review__avatar">{initialsFor(name)}</span>
                <div className="recent-review__body">
                  <div className="recent-review__top">
                    <span className="recent-review__author">{name}</span>
                    <span className={`recent-review__badge recent-review__badge--${r.reply_comment ? 'done' : 'pending'}`}>
                      {r.reply_comment ? 'Respondida' : 'Sin responder'}
                    </span>
                  </div>
                  <div className="recent-review__meta">
                    <Stars value={r.star_rating} />
                    <span className="recent-review__date">
                      {formatRelativeTime(r.created_time)}
                      {showLocation && where ? ` · ${where}` : ''}
                    </span>
                  </div>
                  {r.comment
                    ? <p className="recent-review__text">{r.comment}</p>
                    : <p className="recent-review__text recent-review__text--empty">Sólo estrellas, sin comentario.</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
