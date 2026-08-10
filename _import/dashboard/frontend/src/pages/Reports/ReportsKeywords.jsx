import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import { ALL_REVIEWS } from '../../data/reviews';
import './Reports.css';

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    hash: <svg {...props}><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>,
    trend: <svg {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>,
    tag: <svg {...props}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12.01V2h10.01l8.58 8.58a2 2 0 0 1 0 2.83z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  };
  return icons[name] || null;
}

/* Aggregate keyword frequency + dominant sentiment straight from the reviews mock data */
function buildKeywordStats() {
  const map = new Map();
  ALL_REVIEWS.forEach((review) => {
    review.keywords.forEach((keyword) => {
      if (!map.has(keyword)) {
        map.set(keyword, { term: keyword, count: 0, positive: 0, negative: 0, neutral: 0 });
      }
      const entry = map.get(keyword);
      entry.count += 1;
      entry[review.sentiment] += 1;
    });
  });
  return [...map.values()]
    .map((entry) => {
      const dominant = entry.positive >= entry.negative && entry.positive >= entry.neutral
        ? 'positive'
        : entry.negative >= entry.neutral ? 'negative' : 'neutral';
      return { ...entry, dominant };
    })
    .sort((a, b) => b.count - a.count);
}

export default function ReportsKeywords() {
  const keywords = buildKeywordStats();
  const maxCount = Math.max(...keywords.map((k) => k.count));
  const topTerm = keywords[0];

  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Palabras Clave"
        subtitle="Los temas y términos que más mencionan tus clientes en sus reseñas"
      />

      <div className="reports-stat-grid">
        <StatCard icon={<Icon name="hash" />} value={keywords.length} label="Palabras clave detectadas" color="orange" />
        <StatCard icon={<Icon name="trend" />} value={topTerm?.term ?? '—'} label="Mención más frecuente" color="gold" />
        <StatCard icon={<Icon name="tag" />} value={ALL_REVIEWS.length} label="Reseñas analizadas" color="forest" />
        <StatCard icon={<Icon name="hash" />} value={`${Math.round((keywords.filter((k) => k.dominant === 'positive').length / keywords.length) * 100)}%`} label="Palabras con contexto positivo" color="navy" />
      </div>

      <div className="reports-card">
        <div className="reports-card__header">
          <div>
            <h3 className="reports-card__title">Ranking de palabras clave</h3>
            <span className="reports-card__subtitle">Ordenadas por frecuencia de mención</span>
          </div>
        </div>
        <div className="reports-keywords-list">
          {keywords.map((k) => (
            <div key={k.term} className="reports-keyword-row">
              <span className={`reports-keyword-row__dot reports-keyword-row__dot--${k.dominant}`} />
              <span className="reports-keyword-row__term">{k.term}</span>
              <div className="reports-keyword-row__bar">
                <div className={`reports-keyword-row__fill reports-keyword-row__fill--${k.dominant}`} style={{ width: `${(k.count / maxCount) * 100}%` }} />
              </div>
              <span className="reports-keyword-row__count">{k.count} mención{k.count > 1 ? 'es' : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
