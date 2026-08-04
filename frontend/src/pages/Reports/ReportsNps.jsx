import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import TrendChart from '../../components/TrendChart/TrendChart';
import './Reports.css';

const NPS_SCORE = 68;
const BREAKDOWN = [
  { label: 'Promotores', pct: 72, count: 153, color: 'forest' },
  { label: 'Pasivos', pct: 22, count: 47, color: 'gold' },
  { label: 'Detractores', pct: 6, count: 13, color: 'danger' },
];

const NPS_TREND = [58, 60, 63, 65, 64, 68];
const MONTHS = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'];

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    smile: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    meh: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    frown: <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    users: <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  };
  return icons[name] || null;
}

export default function ReportsNps() {
  const totalResponses = BREAKDOWN.reduce((s, b) => s + b.count, 0);
  const level = NPS_SCORE >= 70 ? 'Excelente' : NPS_SCORE >= 50 ? 'Muy bueno' : NPS_SCORE >= 0 ? 'Aceptable' : 'A mejorar';

  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="NPS"
        subtitle="Qué tan probable es que tus clientes te recomienden a otras personas"
      />

      <div className="reports-two-col">
        <div className="reports-card reports-nps-card">
          <span className="reports-nps-card__level">{level}</span>
          <div className="reports-nps-card__score">
            {NPS_SCORE}
            <span className="reports-nps-card__scale">/100</span>
          </div>
          <div className="reports-nps-bar">
            {BREAKDOWN.map((b) => (
              <div key={b.label} className={`reports-nps-bar__seg reports-nps-bar__seg--${b.color}`} style={{ width: `${b.pct}%` }} />
            ))}
          </div>
          <div className="reports-nps-legend">
            {BREAKDOWN.map((b) => (
              <div key={b.label} className="reports-nps-legend__item">
                <span className={`reports-nps-legend__dot reports-nps-legend__dot--${b.color}`} />
                {b.label} <strong>{b.pct}%</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="reports-card">
          <div className="reports-card__header">
            <div>
              <h3 className="reports-card__title">Evolución del NPS</h3>
              <span className="reports-card__subtitle">Últimos 6 meses</span>
            </div>
          </div>
          <TrendChart data={NPS_TREND} labels={MONTHS} color="forest" />
        </div>
      </div>

      <div className="reports-stat-grid">
        <StatCard icon={<Icon name="smile" />} value={BREAKDOWN[0].count} label="Promotores (9-10)" trend="+8%" color="forest" />
        <StatCard icon={<Icon name="meh" />} value={BREAKDOWN[1].count} label="Pasivos (7-8)" color="gold" trendDirection="down" trend="-2%" />
        <StatCard icon={<Icon name="frown" />} value={BREAKDOWN[2].count} label="Detractores (0-6)" color="navy" trendDirection="down" trend="-3%" />
        <StatCard icon={<Icon name="users" />} value={totalResponses} label="Respuestas totales" color="orange" />
      </div>
    </div>
  );
}
