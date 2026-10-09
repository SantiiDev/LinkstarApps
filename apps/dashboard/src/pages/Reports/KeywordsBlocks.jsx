import Icon from '../../components/Icon/Icon';
import ReviewMentions from './ReviewMentions';
import '../GoogleBusiness/GoogleMetrics.css';
import './Reports.css';

/*
 * Los bloques de Palabras clave, sólo presentación (estructura de Tapstar):
 * reciben las palabras ya contadas (keywordStats en lib/reviewInsights.js) y
 * las dibujan. Los usan la pantalla real (ReportsKeywordsScreen) y la maqueta
 * (ReportsKeywordsMockup), así las dos se ven idénticas — el patrón de
 * NpsBlocks y SentimentBlocks.
 *
 * Cada palabra va en la columna de su tono DOMINANTE, pero no se esconde el
 * resto: si «pizza» se elogia 22 veces y se critica 2, la fila lo dice.
 */

export const KEYWORDS_PER_COLUMN = 8;

/* ─── Aviso y resumen ────────────────────────────────────────────────────── */

export function KeywordsHint() {
  return (
    <div className="reports-hint">
      <Icon name="pointer" size={16} />
      <p>Tocá cualquier palabra clave para ver las reseñas que la mencionan.</p>
    </div>
  );
}

export function KeywordsSummary({ text }) {
  return (
    <div className="reports-summary">
      <Icon name="message" size={16} />
      <p>{text}</p>
    </div>
  );
}

/* ─── Las dos columnas ───────────────────────────────────────────────────── */

const COLUMNS = {
  positive: {
    title: 'Lo que más gusta a tus clientes',
    icon: 'heart',
    opposite: 'negative',
    oppositeLabel: 'como queja',
    empty: 'En este período ninguna palabra se menciona sobre todo como elogio.',
  },
  negative: {
    title: 'Lo que necesita mejorar',
    icon: 'alert',
    opposite: 'positive',
    oppositeLabel: 'como elogio',
    empty: 'En este período ninguna palabra se menciona sobre todo como queja.',
  },
};

function KeywordColumn({ tone, items, selected, onSelect }) {
  const c = COLUMNS[tone];
  // Como Tapstar: las menciones de las palabras que se muestran.
  const total = items.reduce((sum, k) => sum + k.count, 0);
  return (
    <div className={`reports-kw-col reports-kw-col--${tone}`}>
      <div className="reports-kw-col__head">
        <span className="reports-kw-col__icon"><Icon name={c.icon} size={18} /></span>
        <div>
          <p className="reports-kw-col__title">{c.title}</p>
          <span className="reports-kw-col__total">{total} menci{total === 1 ? 'ón' : 'ones'}</span>
        </div>
      </div>
      {items.length ? (
        <ol className="reports-kw-col__list">
          {items.map((k, i) => {
            const opposite = k[c.opposite];
            const isSelected = selected === k.term;
            return (
              <li key={k.term}>
                <button
                  type="button"
                  className={`reports-kw-item${isSelected ? ' reports-kw-item--selected' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelect?.(k)}
                >
                  <span className="reports-kw-item__rank">{String(i + 1).padStart(2, '0')}</span>
                  <span className="reports-kw-item__term">
                    {k.term}
                    {opposite > 0 && <small> · {opposite} {c.oppositeLabel}</small>}
                  </span>
                  <span className="reports-kw-item__count" title={`${k.count} reseña${k.count === 1 ? '' : 's'}`}>
                    <Icon name="message" size={12} /> {k.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="reports-kw-col__empty">{c.empty}</p>
      )}
    </div>
  );
}

export function KeywordColumns({ praised, complaints, selected, onSelect }) {
  return (
    <div className="reports-two-col reports-two-col--even">
      <KeywordColumn tone="positive" items={praised} selected={selected} onSelect={onSelect} />
      <KeywordColumn tone="negative" items={complaints} selected={selected} onSelect={onSelect} />
    </div>
  );
}

/* ─── Panel de reseñas de la palabra elegida ─────────────────────────────── */

const TONE_TEXT = { positive: 'La menciona como elogio', neutral: 'La menciona sin un tono claro', negative: 'La menciona como queja' };

function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="gbm-pager">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0}>Anterior</button>
      <span>Página {page + 1} de {pages}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page + 1 >= pages}>Siguiente</button>
    </div>
  );
}

/* `keyword` null → todavía no se eligió ninguna. `reviewCount` son las reseñas
   distintas que la nombran; `state`, las de la página actual. */
export function KeywordReviewsPanel({ panelRef, keyword, reviewCount, state, toneOf, page, pages, onPage, showLocation }) {
  if (!keyword) {
    return (
      <div ref={panelRef} className="reports-card reports-kw-panel reports-kw-panel--empty">
        <Icon name="pointer" size={20} />
        <p>Tocá una palabra para ver las reseñas que la mencionan.</p>
      </div>
    );
  }

  const parts = [`${reviewCount} reseña${reviewCount === 1 ? '' : 's'}`];
  if (keyword.positive) parts.push(`${keyword.positive} como elogio`);
  if (keyword.negative) parts.push(`${keyword.negative} como queja`);
  if (keyword.neutral) parts.push(`${keyword.neutral} sin un tono claro`);

  return (
    <div ref={panelRef} className="reports-card reports-kw-panel">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">Reseñas que mencionan «{keyword.term}»</h3>
          <span className="reports-card__subtitle">{parts.join(' · ')}</span>
        </div>
      </div>
      <ReviewMentions
        state={state}
        toneOf={toneOf}
        toneLabel={(tone) => TONE_TEXT[tone]}
        showLocation={showLocation}
        highlight={keyword.term}
      />
      <Pager page={page} pages={pages} onPage={onPage} />
    </div>
  );
}

/* ─── Todas las palabras ─────────────────────────────────────────────────── */

export const RANKING_PAGE = 15;

const DOMINANT_LABEL = {
  positive: 'mencionada sobre todo como elogio',
  neutral: 'mencionada sin un tono claro',
  negative: 'mencionada sobre todo como queja',
};

export function KeywordRanking({ keywords, page, onPage, selected, onSelect }) {
  const max = Math.max(1, ...keywords.map((k) => k.count));
  const pages = Math.ceil(keywords.length / RANKING_PAGE);
  const rows = keywords.slice(page * RANKING_PAGE, (page + 1) * RANKING_PAGE);
  return (
    <div className="reports-card">
      <div className="reports-card__header">
        <div>
          <h3 className="reports-card__title">Todas las palabras</h3>
          <span className="reports-card__subtitle">
            En cuántas reseñas aparece cada una. El color dice si se la menciona como elogio, como queja o sin un tono claro.
          </span>
        </div>
      </div>
      <div className="reports-keywords-list">
        {rows.map((k) => (
          <button
            key={k.term}
            type="button"
            className={`reports-keyword-row reports-keyword-row--button${selected === k.term ? ' reports-keyword-row--selected' : ''}`}
            title={`${k.term}: ${DOMINANT_LABEL[k.dominant]}`}
            aria-pressed={selected === k.term}
            onClick={() => onSelect?.(k)}
          >
            <span className={`reports-keyword-row__dot reports-keyword-row__dot--${k.dominant}`} />
            <span className="reports-keyword-row__term">{k.term}</span>
            <span className="reports-keyword-row__bar">
              <span
                className={`reports-keyword-row__fill reports-keyword-row__fill--${k.dominant}`}
                style={{ width: `max(3px, ${(k.count / max) * 100}%)` }}
              />
            </span>
            <span className="reports-keyword-row__count">{k.count} reseña{k.count === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>
      <Pager page={page} pages={pages} onPage={onPage} />
    </div>
  );
}
