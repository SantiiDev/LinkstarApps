import './KpiCards.css';

const kpiData = [
  {
    id: 'scans',
    label: 'Total de Escaneos',
    value: '12,847',
    trend: '+18.2%',
    trendDirection: 'up',
    color: 'orange',
    icon: 'scan',
  },
  {
    id: 'reviews',
    label: 'Reseñas Estimadas',
    value: '3,521',
    trend: '+12.5%',
    trendDirection: 'up',
    color: 'gold',
    icon: 'star',
  },
  {
    id: 'devices',
    label: 'Dispositivos Activos',
    value: '24',
    trend: '+3',
    trendDirection: 'up',
    color: 'forest',
    icon: 'device',
  },
  {
    id: 'conversion',
    label: 'Tasa de Conversión',
    value: '27.4%',
    trend: '-1.2%',
    trendDirection: 'down',
    color: 'navy',
    icon: 'percent',
  },
];

function KpiIcon({ name, className }) {
  const icons = {
    scan: (
      <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <line x1="7" y1="12" x2="17" y2="12" />
      </svg>
    ),
    star: (
      <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    device: (
      <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
    percent: (
      <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </svg>
    ),
  };
  return icons[name] || null;
}

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

export default function KpiCards() {
  return (
    <div className="kpi-grid">
      {kpiData.map((kpi, index) => (
        <div
          key={kpi.id}
          className={`kpi-card kpi-card--${kpi.color}`}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="kpi-card__header">
            <div className={`kpi-card__icon-wrapper kpi-card__icon-wrapper--${kpi.color}`}>
              <KpiIcon name={kpi.icon} />
            </div>
            <span className={`kpi-card__badge kpi-card__badge--${kpi.trendDirection}`}>
              <TrendArrow direction={kpi.trendDirection} />
              {kpi.trend}
            </span>
          </div>
          <div className="kpi-card__value">{kpi.value}</div>
          <div className="kpi-card__label">{kpi.label}</div>
        </div>
      ))}
    </div>
  );
}
