import './StatCard.css';

function TrendArrow({ direction }) {
  if (direction === 'up') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function StatCard({ icon, label, value, trend, trendDirection = 'up', color = 'orange', delay = 0 }) {
  return (
    <div className={`stat-card stat-card--${color}`} style={{ animationDelay: `${delay}s` }}>
      <div className="stat-card__header">
        <div className={`stat-card__icon-wrapper stat-card__icon-wrapper--${color}`}>{icon}</div>
        {trend && (
          <span className={`stat-card__badge stat-card__badge--${trendDirection}`}>
            <TrendArrow direction={trendDirection} />
            {trend}
          </span>
        )}
      </div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}
