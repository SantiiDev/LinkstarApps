import KpiCard from '../../components/KpiCard/KpiCard';
import Icon from '../../components/Icon/Icon';
import SoonBadge from '../../components/SoonBadge/SoonBadge';
import { sharesOf } from '../../lib/shares';
import { MIN_ASPECT_MENTIONS, SMALL_SAMPLE, formatNps, npsLevel } from '../../lib/reviewInsights';
import ReviewMentions from './ReviewMentions';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * Los bloques de NPS, sólo presentación: reciben los números ya calculados
 * (lib/reviewInsights.js) y los dibujan. Los usan la pantalla real
 * (ReportsNpsScreen) y la maqueta (ReportsNpsMockup), así las dos se ven
 * idénticas y un cambio de diseño se hace una sola vez — el patrón de
 * CompanyBlocks.
 *
 * Ningún bloque inventa un valor: sin dato dicen «—» o explican qué falta. Los
 * números de la maqueta son inventados y viven en ReportsNpsMockup.jsx.
 */

const toneOf = (score) => (score == null || score === 0 ? 'mid' : score > 0 ? 'good' : 'bad');
const mentions = (n) => `${n} menci${n === 1 ? 'ón' : 'ones'}`;

/* ─── Las tres tarjetas ──────────────────────────────────────────────────── */

function AspectKpi({ icon, color, label, aspect, tone, empty }) {
  return (
    <KpiCard icon={<Icon name={icon} size={16} />} color={color} label={label}>
      <div className={`reports-nps-aspect reports-nps-aspect--${aspect ? tone(aspect.score) : 'mid'}`}>
        {aspect ? aspect.label : '—'}
      </div>
      <span className="kpi-card__caption">
        {aspect ? `NPS ${formatNps(aspect.score)} · ${mentions(aspect.mentions)}` : empty}
      </span>
    </KpiCard>
  );
}

export function NpsKpis({ nps, strength, challenge }) {
  const level = npsLevel(nps.score);
  return (
    <div className="kpi-grid kpi-grid--3">
      <KpiCard icon={<Icon name="smile" size={16} />} color="forest" label="NPS">
        <div className={`kpi-card__value reports-nps-score reports-nps-score--${toneOf(nps.score)}`}>
          {formatNps(nps.score)}
        </div>
        <div className="kpi-card__trend">
          {level && <span className={`kpi-pill kpi-pill--${level.tone}`}>{level.label}</span>}
          {nps.small && (
            <span className="kpi-pill kpi-pill--neutral" title={`Menos de ${SMALL_SAMPLE} reseñas: una sola nueva mueve mucho el puntaje.`}>
              Muestra chica
            </span>
          )}
        </div>
        <span className="kpi-card__caption">Si tus clientes te recomendarían, calculado sólo a partir del texto de las reseñas</span>
      </KpiCard>

      <AspectKpi
        icon="trophy" color="forest" label="Fortaleza"
        aspect={strength}
        tone={(s) => (s > 0 ? 'good' : 'mid')}
        empty={`Ningún aspecto con ${MIN_ASPECT_MENTIONS} menciones o más`}
      />
      <AspectKpi
        icon="alert" color="danger" label="Reto a mejorar"
        aspect={challenge}
        tone={(s) => (s < 0 ? 'bad' : 'mid')}
        empty={strength ? 'Hace falta un segundo aspecto para comparar' : `Ningún aspecto con ${MIN_ASPECT_MENTIONS} menciones o más`}
      />
    </div>
  );
}

/* ─── Promotores, pasivos y detractores ──────────────────────────────────── */

export function NpsBreakdown({ nps }) {
  const segments = [
    { key: 'promoters', label: 'Promotores', hint: 'tono positivo', count: nps.promoters },
    { key: 'passives', label: 'Pasivos', hint: 'neutro o mixto', count: nps.passives },
    { key: 'detractors', label: 'Detractores', hint: 'tono negativo', count: nps.detractors },
  ];
  const pcts = sharesOf(segments.map((s) => s.count));
  const summary = segments.map((s, i) => `${s.label}: ${s.count} (${pcts[i]}%)`).join(', ');

  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">Promotores, pasivos y detractores</h3>
          <span className="reports-card__subtitle">
            {nps.total} reseña{nps.total === 1 ? '' : 's'} con texto en el período · NPS = % promotores − % detractores
          </span>
        </div>
      </div>

      <div className="reports-nps-stack" role="img" aria-label={summary}>
        {segments.map((s, i) => s.count > 0 && (
          <div
            key={s.key}
            className={`reports-nps-stack__seg reports-nps-stack__seg--${s.key}`}
            style={{ flexGrow: s.count }}
            title={`${s.label}: ${s.count} (${pcts[i]}%)`}
          />
        ))}
      </div>

      <ul className="reports-nps-legend">
        {segments.map((s, i) => (
          <li key={s.key}>
            <span className={`reports-nps-dot reports-nps-dot--${s.key}`} aria-hidden="true" />
            <strong>{s.label}</strong>
            <span className="reports-nps-legend__value">{s.count} · {pcts[i]}%</span>
            <span className="reports-nps-legend__hint">{s.hint}</span>
          </li>
        ))}
      </ul>

      <p className="reports-nps-footnote">
        No es una encuesta: cada reseña con texto cuenta como promotor, pasivo o detractor según el tono de lo que
        escribió el cliente, leído por una IA. Las reseñas de sólo estrellas no entran.
      </p>
    </div>
  );
}

/* ─── NPS por aspecto ────────────────────────────────────────────────────── */

/* «Mis temas» (temas propios de cada negocio) queda para más adelante: hace
   falta guardarlos por organización, pasárselos a la IA y volver a analizar el
   historial. Mientras tanto el botón está, deshabilitado, como «Escribir con
   IA» en Publicaciones. */
function MyTopicsButton() {
  return (
    <button type="button" className="reports-nps-soon" disabled title="Próximamente">
      <Icon name="tag" size={14} /> Mis temas <SoonBadge />
    </button>
  );
}

function DivergingBar({ score }) {
  const width = `${Math.min(100, Math.abs(score))}%`;
  return (
    <div className="reports-aspect__bar" aria-hidden="true">
      <div className="reports-aspect__half reports-aspect__half--neg">
        {score < 0 && <div className="reports-aspect__fill reports-aspect__fill--neg" style={{ width }} />}
      </div>
      <div className="reports-aspect__half">
        {score > 0 && <div className="reports-aspect__fill reports-aspect__fill--pos" style={{ width }} />}
      </div>
    </div>
  );
}

/* `openTopic` / `onToggle`: qué fila está desplegada. `renderDetail(aspect)`
   dibuja lo de adentro; la maqueta no lo pasa y sus filas no se abren. */
export function AspectList({ aspects, openTopic = null, onToggle, renderDetail }) {
  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">NPS por aspecto</h3>
          <span className="reports-card__subtitle">
            Aspectos mencionados en al menos {MIN_ASPECT_MENTIONS} reseñas, con su índice promotor-detractor (de −100 a +100).
          </span>
        </div>
        <MyTopicsButton />
      </div>

      {aspects.length ? (
        <ul className="reports-aspects">
          {aspects.map((a) => {
            const open = openTopic === a.topic;
            return (
              <li key={a.topic} className="reports-aspect">
                <button
                  type="button"
                  className="reports-aspect__row"
                  aria-expanded={open}
                  onClick={() => onToggle?.(a)}
                >
                  <span className="reports-aspect__name">
                    <span className="reports-aspect__chevron"><Icon name="chevronRight" size={14} /></span>
                    {a.label}
                  </span>
                  <DivergingBar score={a.score} />
                  <span className={`reports-aspect__score reports-aspect__score--${toneOf(a.score)}`}>{formatNps(a.score)}</span>
                  <span className="reports-aspect__mentions">{mentions(a.mentions)}</span>
                </button>
                {open && renderDetail && <div className="reports-aspect__detail">{renderDetail(a)}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="gbm-muted">
          Ningún aspecto tiene {MIN_ASPECT_MENTIONS} menciones o más en este período. Probá con un rango más largo.
        </p>
      )}
    </div>
  );
}

/* Lo de adentro de una fila: las últimas reseñas que mencionan ese aspecto. */
const TONE_LABEL = { positive: 'positivo', neutral: 'neutro', negative: 'negativo' };

export function AspectReviews({ aspect, state, toneOf, total, showLocation }) {
  const rest = state?.status === 'ok' ? total - state.items.length : 0;
  return (
    <>
      <ReviewMentions
        state={state}
        toneOf={toneOf}
        toneLabel={(tone) => `${aspect.label}: ${TONE_LABEL[tone]}`}
        showLocation={showLocation}
        errorText="No pudimos cargar las reseñas. Cerrá y volvé a abrir la fila para reintentar."
      />
      {rest > 0 && (
        <p className="reports-aspect__more">
          Y {rest} reseña{rest === 1 ? '' : 's'} más mencion{rest === 1 ? 'a' : 'an'} {aspect.label.toLowerCase()} en este período.
        </p>
      )}
    </>
  );
}

/* ─── Qué dice tu NPS ────────────────────────────────────────────────────── */

export function NpsInsights({ items }) {
  if (!items.length) return null;
  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">Qué dice tu NPS</h3>
          <span className="reports-card__subtitle">Una lectura de los números de arriba</span>
        </div>
      </div>
      <ul className="gbm-insights">
        {items.map((i) => (
          <li key={i.title}>
            <strong>{i.title}</strong>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
