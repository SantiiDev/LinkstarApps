import TrendChart from '../../components/TrendChart/TrendChart';
import Switch from '../../components/Switch/Switch';
import Icon from '../../components/Icon/Icon';
import { sharesOf } from '../../lib/shares';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * Los bloques de Sentimiento, sólo presentación (estructura de Tapstar): reciben
 * los números ya calculados (lib/reviewInsights.js) y los dibujan. Los usan la
 * pantalla real (ReportsSentimentScreen) y la maqueta (ReportsSentimentMockup),
 * así las dos se ven idénticas — el patrón de NpsBlocks y CompanyBlocks.
 *
 * Los tres tonos usan la escala de siempre (lib/chartColors.js, SCALE_3): verde
 * positivo, dorado neutro (como los pasivos de NPS), rojo negativo. El color
 * nunca va solo: siempre hay texto y número al lado.
 */

const TONES = [
  { key: 'positive', label: 'Positivas', icon: 'smile' },
  { key: 'neutral', label: 'Neutras', icon: 'meh' },
  { key: 'negative', label: 'Negativas', icon: 'frown' },
];

/* ─── Distribución: anillo + tres cuadros ───────────────────────────────────
   El anillo es el % de reseñas positivas, el mismo número del primer cuadro.
   No es el «76» de Tapstar, que es un índice de 0 a 100 (positiva 100, neutra
   50, negativa 0): eso es el NPS en otra escala, y ya está en su pantalla. */

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

function PositiveRing({ pct }) {
  return (
    <div className="reports-ring">
      <div className="reports-ring__chart">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${pct}% de las reseñas tienen tono positivo`}>
          <circle className="reports-ring__track" cx="66" cy="66" r={RING_R} />
          <circle
            className="reports-ring__arc"
            cx="66" cy="66" r={RING_R}
            strokeDasharray={`${(pct / 100) * RING_C} ${RING_C}`}
            transform="rotate(-90 66 66)"
          />
        </svg>
        <span className="reports-ring__value">{pct}<small>%</small></span>
      </div>
      <span className="reports-ring__label">Positivo</span>
    </div>
  );
}

export function SentimentDistribution({ counts }) {
  const values = TONES.map((t) => counts[t.key] ?? 0);
  const pcts = sharesOf(values);
  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">Distribución de sentimiento</h3>
          <span className="reports-card__subtitle">
            {values.reduce((a, b) => a + b, 0)} reseñas con texto en el período
          </span>
        </div>
      </div>
      <PositiveRing pct={pcts[0]} />
      <div className="reports-tone-tiles">
        {TONES.map((t, i) => (
          <div key={t.key} className={`reports-tone-tile reports-tone-tile--${t.key}`}>
            <Icon name={t.icon} size={20} />
            <span className="reports-tone-tile__value">
              {values[i]} <small>({pcts[i]}%)</small>
            </span>
            <span className="reports-tone-tile__label">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Evolución: tres líneas ─────────────────────────────────────────────── */

const UNIT_PLURAL = { día: 'días', semana: 'semanas', mes: 'meses' };
const UNIT_AXIS = { día: 'Día', semana: 'Semana', mes: 'Mes' };

export function SentimentEvolution({ series, mode, onMode }) {
  const percent = mode === 'percent';
  const plural = UNIT_PLURAL[series.unit];
  // En % sólo quedan los tramos con reseñas; en cantidad, todos los del rango.
  const enough = series.labels.length >= 2 && series.withData > 0;

  return (
    <div className="reports-card chart-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title reports-card__title--icon">
            <Icon name="trend" size={16} /> Evolución del sentimiento
          </h3>
          <span className="reports-card__subtitle">
            {percent
              ? `Qué parte de las reseñas de cada ${series.unit} tiene cada tono. Los ${plural} sin reseñas no se muestran.`
              : `Reseñas por ${series.unit}, agrupadas según el tono detectado.`}
          </span>
        </div>
        {onMode && (
          <Switch checked={percent} onChange={(on) => onMode(on ? 'percent' : 'count')} label="Ver en %" />
        )}
      </div>

      {enough ? (
        <TrendChart
          labels={series.labels}
          series={[
            { name: 'Positivas', data: series.positive, color: 'forest' },
            { name: 'Neutras', data: series.neutral, color: 'gold', dashed: true },
            { name: 'Negativas', data: series.negative, color: 'danger' },
          ]}
          xLabel={UNIT_AXIS[series.unit]}
          yLabel={percent ? '% de reseñas' : 'Reseñas'}
          formatValue={percent ? (v) => `${v}%` : undefined}
        />
      ) : (
        <p className="gbm-muted">
          Hacen falta reseñas en al menos dos {plural} para ver cómo se mueve el tono. Probá con un rango más largo.
        </p>
      )}
    </div>
  );
}

/* ─── Palabras clave por sentimiento ────────────────────────────────────────
   Agrupadas por el tono DOMINANTE de cada palabra (keywordStats), no por el de
   la reseña: «lugar lindo» en una reseña negativa sigue siendo un elogio. Las
   más repetidas de cada grupo; el ranking completo está en Palabras clave. */

const KEYWORDS_PER_GROUP = 8;
const KEYWORD_GROUPS = [
  { key: 'positive', label: 'Positivas', icon: 'trend' },
  { key: 'neutral', label: 'Neutras', icon: 'minus' },
  { key: 'negative', label: 'Negativas', icon: 'trendDown' },
];

export function SentimentKeywords({ keywords, onViewAll }) {
  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">Palabras clave por sentimiento</h3>
          <span className="reports-card__subtitle">
            Lo que más repiten tus clientes, agrupado según el tono con que lo mencionan.
          </span>
        </div>
        {onViewAll && (
          <button type="button" className="reports-card__link" onClick={onViewAll}>
            Ver todas <Icon name="arrowRight" size={13} />
          </button>
        )}
      </div>

      <div className="reports-kw-groups">
        {KEYWORD_GROUPS.map((g) => {
          const items = keywords.filter((k) => k.dominant === g.key).slice(0, KEYWORDS_PER_GROUP);
          return (
            <div key={g.key} className="reports-kw-group">
              <p className={`reports-kw-group__title reports-kw-group__title--${g.key}`}>
                <Icon name={g.icon} size={15} /> {g.label}
              </p>
              {items.length ? (
                <ul className="reports-kw-chips">
                  {items.map((k) => (
                    <li key={k.term} className={`reports-kw-chip reports-kw-chip--${g.key}`}>
                      {k.term} <span>({k.count})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="reports-kw-group__empty">Ninguna en este período.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Dónde se concentran las quejas (varias sucursales) ─────────────────── */

const tone = (pct) => (pct >= 66 ? 'forest' : pct >= 34 ? 'gold' : 'danger');

export function ComplaintsByLocation({ byLocation }) {
  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">Dónde se concentran las quejas</h3>
          <span className="reports-card__subtitle">Qué parte de las reseñas de cada sucursal tiene tono negativo</span>
        </div>
      </div>
      <div className="reports-themes">
        {byLocation.map((l) => (
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
  );
}
