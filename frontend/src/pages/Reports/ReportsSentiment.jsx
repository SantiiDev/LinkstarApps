import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import { ALL_REVIEWS, REVIEW_STATS } from '../../data/reviews';
import './Reports.css';

const SENTIMENT_TREND = [68, 71, 70, 74, 75, 77];
const MONTHS = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'];

const THEMES = [
  { label: 'Atención al cliente', positive: 89, mentions: 42 },
  { label: 'Calidad del producto', positive: 84, mentions: 35 },
  { label: 'Ambiente del local', positive: 91, mentions: 24 },
  { label: 'Tiempo de espera', positive: 38, mentions: 18 },
  { label: 'Precios', positive: 62, mentions: 15 },
];

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    smile: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    meh: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    frown: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    tag: <svg {...props}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12.01V2h10.01l8.58 8.58a2 2 0 0 1 0 2.83z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  };
  return icons[name] || null;
}

export default function ReportsSentiment() {
  const total = ALL_REVIEWS.length;
  const positive = ALL_REVIEWS.filter((r) => r.sentiment === 'positive').length;
  const neutral = ALL_REVIEWS.filter((r) => r.sentiment === 'neutral').length;

  const positivePct = Math.round((positive / total) * 100);
  const neutralPct = Math.round((neutral / total) * 100);
  const negativePct = 100 - positivePct - neutralPct;

  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Análisis de Sentimiento"
        subtitle="Cómo se sienten tus clientes, detectado automáticamente con IA sobre cada reseña"
      />

      <div className="reports-stat-grid">
        <StatCard icon={<Icon name="smile" />} value={`${positivePct}%`} label="Sentimiento positivo" trend="+3%" color="forest" />
        <StatCard icon={<Icon name="meh" />} value={`${neutralPct}%`} label="Sentimiento neutro" color="gold" />
        <StatCard icon={<Icon name="frown" />} value={`${negativePct}%`} label="Sentimiento negativo" trendDirection="down" trend="-1%" color="navy" />
        <StatCard icon={<Icon name="tag" />} value={THEMES.length} label="Temas detectados" color="orange" />
      </div>

      <div className="reports-two-col">
        <div className="reports-card">
          <div className="reports-card__header">
            <div>
              <h3 className="reports-card__title">Sentimiento positivo en el tiempo</h3>
              <span className="reports-card__subtitle">Últimos 6 meses · {REVIEW_STATS.totalReviews} reseñas analizadas</span>
            </div>
          </div>
          <TrendChart data={SENTIMENT_TREND} labels={MONTHS} color="orange" />
        </div>

        <div className="reports-card">
          <div className="reports-card__header">
            <div>
              <h3 className="reports-card__title">Distribución</h3>
              <span className="reports-card__subtitle">{total} reseñas clasificadas</span>
            </div>
          </div>
          <div className="reports-sentiment-split">
            <div className="reports-sentiment-split__bar">
              <div className="reports-sentiment-split__seg reports-sentiment-split__seg--forest" style={{ width: `${positivePct}%` }} />
              <div className="reports-sentiment-split__seg reports-sentiment-split__seg--gold" style={{ width: `${neutralPct}%` }} />
              <div className="reports-sentiment-split__seg reports-sentiment-split__seg--danger" style={{ width: `${negativePct}%` }} />
            </div>
            <div className="reports-sentiment-split__legend">
              <span><i className="reports-sentiment-split__dot reports-sentiment-split__dot--forest" />Positivo {positivePct}%</span>
              <span><i className="reports-sentiment-split__dot reports-sentiment-split__dot--gold" />Neutro {neutralPct}%</span>
              <span><i className="reports-sentiment-split__dot reports-sentiment-split__dot--danger" />Negativo {negativePct}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="reports-card">
        <div className="reports-card__header">
          <div>
            <h3 className="reports-card__title">Temas más mencionados</h3>
            <span className="reports-card__subtitle">Qué tan positivo es el sentimiento por tema</span>
          </div>
        </div>
        <div className="reports-themes">
          {THEMES.map((t) => (
            <div key={t.label} className="reports-theme-row">
              <div className="reports-theme-row__top">
                <span>{t.label}</span>
                <span className="reports-theme-row__mentions">{t.mentions} menciones</span>
              </div>
              <div className="reports-theme-row__bar">
                <div
                  className={`reports-theme-row__fill ${t.positive >= 60 ? 'reports-theme-row__fill--forest' : 'reports-theme-row__fill--danger'}`}
                  style={{ width: `${t.positive}%` }}
                />
              </div>
              <span className="reports-theme-row__pct">{t.positive}% positivo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
