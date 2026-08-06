import './TrendChart.css';

const COLOR_VARS = {
  orange: 'var(--color-orange)',
  gold: 'var(--color-gold)',
  forest: 'var(--color-forest)',
  navy: 'var(--color-navy)',
};

export default function TrendChart({ data, labels, color = 'orange' }) {
  const gradientId = `trendFill-${color}`;
  const strokeColor = COLOR_VARS[color] || COLOR_VARS.orange;

  if (!data || data.length === 0) {
    return <div className="trend-chart trend-chart--empty" />;
  }

  const max = Math.max(...data);
  const min = 0;
  const w = 300, h = 120, pad = 8;
  const stepX = (w - pad * 2) / (Math.max(data.length - 1, 1));
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return [x, y];
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0]},${h - pad} L${points[0][0]},${h - pad} Z`;

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="trend-chart__svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--color-white)" stroke={strokeColor} strokeWidth="2" />
        ))}
      </svg>
      {labels && (
        <div className="trend-chart__labels">
          {labels.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
