import { useMemo, useState } from 'react';
import Icon from '../../components/Icon/Icon';
import SelectField from '../../components/Select/SelectField';

/*
 * Análisis SEO, sólo presentación. Lo usan la pantalla real
 * (GoogleSeoLocalScreen, que pide el análisis al API) y su maqueta de GoogleGate
 * (GoogleSeoLocalMockup), así las dos se ven idénticas — el mismo patrón que
 * GoogleMetricsBlocks. `audit` tiene la forma que devuelve
 * services/api/lib/seoAudit.js.
 */

const GOOGLE_PROFILE_MANAGER = 'https://business.google.com/';

const ACTIONS = {
  profile: { label: 'Mejorar', section: 'gb-profile' },
  posts: { label: 'Publicar', section: 'gb-posts' },
  reviews: { label: 'Responder', section: 'reviews' },
  devices: { label: 'Ver expositores', section: 'devices' },
  google: { label: 'Mejorar en Google', href: GOOGLE_PROFILE_MANAGER },
};

const CATEGORY_ICONS = {
  visual: 'camera',
  keywords: 'search',
  activity: 'activity',
  category: 'tag',
  nap: 'pin',
  reputation: 'message',
};

const pctTone = (score, max) => {
  const p = max ? score / max : 0;
  return p >= 0.67 ? 'good' : p >= 0.34 ? 'mid' : 'bad';
};

function Ring({ score, max, size = 44, stroke = 4, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = max ? Math.min(1, score / max) : 0;
  return (
    <span className={`gseo-ring gseo-ring--${pctTone(score, max)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="gseo-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="gseo-ring__value"
          cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c * p} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
      </svg>
      <span className="gseo-ring__inner">{children}</span>
    </span>
  );
}

function ActionButton({ action, onNavigateSection }) {
  const a = ACTIONS[action];
  if (!a) return null;
  if (a.href) {
    return (
      <a className="gseo-action" href={a.href} target="_blank" rel="noopener noreferrer">
        {a.label} <span aria-hidden="true">↗</span>
      </a>
    );
  }
  return (
    <button type="button" className="gseo-action" onClick={() => onNavigateSection?.(a.section)}>
      {a.label} <span aria-hidden="true">→</span>
    </button>
  );
}

function CheckCard({ check, onNavigateSection }) {
  const unknown = check.status === 'unknown';
  return (
    <div className="gseo-check">
      <div className="gseo-check__head">
        <Ring score={check.score} max={check.max}>
          <b>{unknown ? '?' : check.score}</b><small>/{check.max}</small>
        </Ring>
        <div className="gseo-check__titles">
          <span className="gseo-check__label">{check.label}</span>
          <div className="gseo-pills">
            <span className={`gseo-pill gseo-pill--${unknown ? 'muted' : check.status === 'partial' ? 'mid' : 'bad'}`}>
              {unknown ? 'No pudimos medirlo' : check.status === 'partial' ? 'Mejorable' : 'Pendiente'}
            </span>
            {check.current && <span className="gseo-pill gseo-pill--info">{check.current}</span>}
            {check.target && <span className="gseo-pill gseo-pill--target">{check.target}</span>}
          </div>
        </div>
      </div>
      <p className="gseo-check__tip">
        {!unknown && <span className="gseo-check__bulb"><Icon name="bulb" size={14} /></span>}
        <span>{unknown ? 'Google no nos dejó leer este dato ahora. No cuenta en tu puntaje hasta que podamos medirlo.' : check.tip}</span>
      </p>
      {!unknown && (
        <div className="gseo-check__foot">
          <ActionButton action={check.action} onNavigateSection={onNavigateSection} />
        </div>
      )}
    </div>
  );
}

/* El selector de local, como en Métricas y Perfil (aunque haya una sola ficha),
   y «Volver a analizar», que saltea la caché de 10 minutos del API. */
export function SeoToolbar({ locations, selected, onSelect, onRefresh, refreshing }) {
  return (
    <div className="gb-card gbm-toolbar gseo-toolbar">
      <div className="gbm-toolbar__filters">
        <SelectField
          label="Local"
          icon="store"
          value={selected.googleLocationId}
          onChange={onSelect}
          options={locations.map((l) => ({ value: l.googleLocationId, label: l.name }))}
        />
      </div>
      <button type="button" className="gseo-toggle gseo-toolbar__refresh" onClick={onRefresh} disabled={refreshing}>
        <Icon name="refresh" size={14} />
        {refreshing ? 'Actualizando…' : 'Volver a analizar'}
      </button>
    </div>
  );
}

/* El puntaje de la ficha elegida: nivel y cuánto falta para el siguiente. */
export function SeoSummary({ selected }) {
  const audit = selected.audit;
  if (!audit) return null;
  return (
    <div className="gb-card gseo-summary">
      <Ring score={audit.score} max={100} size={104} stroke={8}>
        <b className="gseo-summary__score">{audit.score}</b>
      </Ring>
      <div className="gseo-summary__text">
        <span className="gseo-summary__eyebrow">Tu nivel · {selected.name}</span>
        <p className="gseo-summary__level">{audit.level}</p>
        <p className="gseo-summary__next">
          {audit.next
            ? `Te faltan ${audit.next.points} punto${audit.next.points === 1 ? '' : 's'} para llegar a «${audit.next.level}».`
            : 'Llegaste al nivel más alto. Ahora se trata de sostenerlo.'}
        </p>
        <p className="gbm-note">
          Puntaje Linkstar: Google no publica un «puntaje de SEO local», así que lo armamos con lo que sí se puede
          medir de tu ficha. Cada punto de abajo dice de dónde sale y cómo subirlo.
        </p>
        {audit.closed && (
          <p className="gbm-error">Google muestra esta ficha como cerrada. Si abriste de nuevo, cambialo en Google: una ficha cerrada no aparece en las búsquedas.</p>
        )}
      </div>
    </div>
  );
}

/* `mission` sale de nextMission() (googleSeoModel.js). */
export function NextMission({ mission, onNavigateSection, onShowCategory }) {
  if (!mission) return null;
  const { check, points, categoryId } = mission;
  return (
    <div className="gb-card gseo-mission">
      <div className="gseo-mission__body">
        <span className="gseo-mission__eyebrow">Tu próxima misión · mayor impacto</span>
        <p className="gseo-mission__title">
          {check.label}{check.current ? ` — ${check.current}` : ''}
        </p>
        <p className="gseo-mission__tip">{check.tip}</p>
        <span className="gseo-pill gseo-pill--good">+{points} pts al completar</span>
      </div>
      <div className="gseo-mission__actions">
        <ActionButton action={check.action} onNavigateSection={onNavigateSection} />
        <button type="button" className="gseo-toggle" onClick={() => onShowCategory?.(categoryId)}>
          Ver en el análisis
        </button>
      </div>
    </div>
  );
}

/* Las seis categorías como pestañas y el detalle de la elegida: lo pendiente,
   con su «Mejorar», y aparte lo que ya se cumple. */
export function SeoCategories({ audit, category, onCategory, onNavigateSection }) {
  const pending = category.checks.filter((c) => c.status !== 'ok');
  const done = category.checks.filter((c) => c.status === 'ok');
  const left = category.measuredMax - category.score;

  return (
    <>
      <div className="gseo-tabs" role="tablist" aria-label="Categorías del análisis">
        {audit.categories.map((c) => (
          <button
            type="button"
            role="tab"
            aria-selected={c.id === category.id}
            key={c.id}
            className={`gseo-tab ${c.id === category.id ? 'gseo-tab--active' : ''}`}
            onClick={() => onCategory(c.id)}
          >
            <Ring score={c.score} max={c.measuredMax || c.max} size={42} stroke={4}>
              <Icon name={CATEGORY_ICONS[c.id]} size={16} />
            </Ring>
            <span className="gseo-tab__label">{c.label}</span>
            <span className={`gseo-tab__pts gseo-tab__pts--${pctTone(c.score, c.measuredMax || c.max)}`}>
              {c.score}<small>/{c.max}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="gb-card gseo-detail">
        <div className="gseo-detail__head">
          <Ring score={category.score} max={category.measuredMax || category.max} size={52} stroke={5}>
            <Icon name={CATEGORY_ICONS[category.id]} size={20} />
          </Ring>
          <div className="gseo-detail__heading">
            <h3 className="gseo-detail__title">{category.label}</h3>
            <p className="gb-card__subtitle">
              {left > 0 ? `Te quedan ${left} punto${left === 1 ? '' : 's'} por ganar acá` : 'Ya sumaste todo lo que se puede acá.'}
            </p>
          </div>
          <span className={`gseo-detail__score gseo-tab__pts--${pctTone(category.score, category.measuredMax || category.max)}`}>
            {category.score}<small>/{category.max}</small>
          </span>
        </div>

        {pending.length > 0 && (
          <div className="gseo-checks">
            {pending.map((c) => <CheckCard key={c.id} check={c} onNavigateSection={onNavigateSection} />)}
          </div>
        )}

        {done.length > 0 && (
          <div className="gseo-done">
            <p className="gseo-done__title">✓ Ya lo cumplís</p>
            {done.map((c) => (
              <div key={c.id} className="gseo-done__row">
                <Ring score={c.score} max={c.max} size={38} stroke={3}>
                  <small>{c.score}/{c.max}</small>
                </Ring>
                <div>
                  <span className="gseo-check__label">{c.label}{c.current ? ` · ${c.current}` : ''}</span>
                  <p className="gseo-check__tip">{c.tip}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* La tarjeta Business, vista desde gratis: datos INVENTADOS. Se renderiza sólo
   como `preview` de BusinessLock o dentro de la maqueta de GoogleGate. */
export function MissingTermsPreview() {
  const rows = [['bar con terraza', 420], ['cerveza artesanal', 310], ['happy hour', 180], ['picadas', 95]];
  return (
    <div className="gb-card gseo-terms">
      <h3 className="gb-card__title">Búsquedas que no están en tu descripción</h3>
      <ul className="gseo-terms__list">
        {rows.map(([t, n]) => <li key={t}><span>{t}</span><span>{n} veces</span></li>)}
      </ul>
    </div>
  );
}

export function MissingTermsCard({ terms, onNavigateSection }) {
  return (
    <div className="gb-card gseo-terms">
      <div className="gb-card__header">
        <div>
          <h3 className="gb-card__title">Búsquedas que no están en tu descripción</h3>
          <span className="gb-card__subtitle">
            Lo que escribió la gente en Google cuando apareció tu ficha (últimos 3 meses) y tu descripción no nombra.
          </span>
        </div>
      </div>
      {terms === null || terms.length === 0 ? (
        <p className="gbm-muted">
          {terms === null
            ? 'Todavía no tenemos las búsquedas de esta ficha.'
            : 'Tu descripción ya nombra las búsquedas con las que más te encuentran. Bien ahí.'}
        </p>
      ) : (
        <>
          <ul className="gseo-terms__list">
            {terms.map((t) => (
              <li key={t.term}><span>{t.term}</span><span>{t.impressions} {t.impressions === 1 ? 'vez' : 'veces'}</span></li>
            ))}
          </ul>
          <p className="gseo-terms__hint">
            Sumá las que describan de verdad lo que hacés a tu descripción, con naturalidad: Google la lee para decidir en qué búsquedas mostrarte.
          </p>
          <div className="gseo-check__foot">
            <ActionButton action="profile" onNavigateSection={onNavigateSection} />
          </div>
        </>
      )}
    </div>
  );
}

export function Ranking({ locations, selectedId, onSelect }) {
  const [worstFirst, setWorstFirst] = useState(false);
  const ranked = useMemo(() => {
    const scored = locations.filter((l) => l.audit).sort((a, b) => b.audit.score - a.audit.score);
    const withRank = scored.map((l, i) => ({ ...l, rank: i + 1 }));
    return worstFirst ? [...withRank].reverse() : withRank;
  }, [locations, worstFirst]);

  return (
    <div className="gb-card">
      <div className="gb-card__header gbm-card__header--wrap">
        <div>
          <h3 className="gb-card__title">Ranking entre tus locales</h3>
          <span className="gb-card__subtitle">Puntaje de cada ficha. Tocá una para ver su análisis.</span>
        </div>
        <button type="button" className="gseo-toggle" onClick={() => setWorstFirst((v) => !v)}>
          {worstFirst ? 'Mejores primero' : 'Peores primero'}
        </button>
      </div>
      <div className="gseo-ranking">
        {ranked.map((l) => (
          <button
            type="button"
            key={l.googleLocationId}
            className={`gseo-rank ${l.googleLocationId === selectedId ? 'gseo-rank--active' : ''}`}
            onClick={() => onSelect(l.googleLocationId)}
          >
            <span className="gseo-rank__name"><small>#{l.rank}</small> {l.name}</span>
            <span className="gseo-rank__score"><b>{l.audit.score}</b> /100</span>
            <span className={`gseo-pill gseo-pill--${pctTone(l.audit.score, 100)}`}>{l.audit.level}</span>
            <span className="gseo-rank__bar"><span className={`gseo-rank__fill gseo-rank__fill--${pctTone(l.audit.score, 100)}`} style={{ width: `${l.audit.score}%` }} /></span>
            <span className="gseo-rank__meta"><span>Mejor</span><b>{l.audit.best ?? '—'}</b></span>
            <span className="gseo-rank__meta"><span>A mejorar</span><b>{l.audit.worst ?? '—'}</b></span>
          </button>
        ))}
      </div>
    </div>
  );
}
