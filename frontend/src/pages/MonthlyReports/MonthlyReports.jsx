import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import './MonthlyReports.css';

const REPORTS = [
  { id: 1, month: 'Julio 2026', reviews: 58, rating: 4.8, scans: 1240, generated: '1 Ago 2026', highlight: true },
  { id: 2, month: 'Junio 2026', reviews: 51, rating: 4.7, scans: 1108, generated: '1 Jul 2026' },
  { id: 3, month: 'Mayo 2026', reviews: 47, rating: 4.7, scans: 987, generated: '1 Jun 2026' },
  { id: 4, month: 'Abril 2026', reviews: 39, rating: 4.6, scans: 892, generated: '1 May 2026' },
  { id: 5, month: 'Marzo 2026', reviews: 34, rating: 4.6, scans: 756, generated: '1 Abr 2026' },
  { id: 6, month: 'Febrero 2026', reviews: 28, rating: 4.5, scans: 640, generated: '1 Mar 2026' },
];

function Icon({ name, ...rest }) {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    fileText: <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
    download: <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
    calendar: <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    star: <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
    scan: <svg {...props}><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="7" y1="12" x2="17" y2="12" /></svg>,
  };
  return icons[name] || null;
}

export default function MonthlyReports() {
  return (
    <div className="mreports-page">
      <PageHeader
        eyebrow="Informes"
        title="Informes mensuales"
        subtitle="Un resumen ejecutivo de tu desempeño, listo para descargar cada mes"
      />

      <div className="mreports-stat-grid">
        <StatCard icon={<Icon name="fileText" />} value={REPORTS.length} label="Informes disponibles" color="orange" />
        <StatCard icon={<Icon name="star" />} value="4.8" label="Rating promedio del mes" trend="+0.1" color="gold" />
        <StatCard icon={<Icon name="scan" />} value="1,240" label="Escaneos este mes" trend="+12%" color="forest" />
        <StatCard icon={<Icon name="calendar" />} value="1 Sep" label="Próximo informe" color="navy" />
      </div>

      <div className="mreports-list">
        {REPORTS.map((r) => (
          <div key={r.id} className={`mreport-card ${r.highlight ? 'mreport-card--highlight' : ''}`}>
            <div className="mreport-card__icon"><Icon name="fileText" width={22} height={22} /></div>
            <div className="mreport-card__body">
              <div className="mreport-card__month">
                {r.month}
                {r.highlight && <span className="mreport-card__badge">Más reciente</span>}
              </div>
              <div className="mreport-card__meta">Generado el {r.generated}</div>
            </div>
            <div className="mreport-card__stats">
              <div><strong>{r.reviews}</strong><span>reseñas</span></div>
              <div><strong>{r.rating} ★</strong><span>rating</span></div>
              <div><strong>{r.scans.toLocaleString()}</strong><span>escaneos</span></div>
            </div>
            <button className="mreport-card__download">
              <Icon name="download" width={15} height={15} /> Descargar PDF
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
