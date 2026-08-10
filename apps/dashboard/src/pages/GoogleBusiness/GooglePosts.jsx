import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import './GoogleBusiness.css';

const POSTS = [
  {
    id: 1,
    type: 'Oferta',
    title: '20% off en tu primera visita',
    text: 'Presentá este cupón mostrando tu reseña en Google y obtené 20% de descuento.',
    range: '1 – 30 Ago 2026',
    status: 'active',
    views: 1240,
    clicks: 98,
    color: '#F58529',
  },
  {
    id: 2,
    type: 'Novedad',
    title: 'Nuevo horario de fin de semana',
    text: 'Ahora abrimos también los domingos de 9 a 20 hs para toda la familia.',
    range: '15 Jul 2026',
    status: 'active',
    views: 620,
    clicks: 41,
    color: '#1A2639',
  },
  {
    id: 3,
    type: 'Evento',
    title: 'Noche de café de especialidad',
    text: 'Sumate a nuestra cata guiada de cafés de origen el próximo viernes.',
    range: '9 Ago 2026',
    status: 'active',
    views: 280,
    clicks: 47,
    color: '#10B981',
  },
  {
    id: 4,
    type: 'Oferta',
    title: '2x1 en postres los martes',
    text: 'Válido de 16 a 19 hs en todas nuestras sucursales.',
    range: '1 – 30 Jun 2026',
    status: 'expired',
    views: 890,
    clicks: 63,
    color: '#F59E0B',
  },
];

function Icon({ name, ...rest }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    plus: <svg {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    posts: <svg {...props}><rect x="3" y="4" width="18" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="18" x2="12" y2="21" /></svg>,
    eye: <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    click: <svg {...props}><path d="M9 9l6.17 14.34L17 17l6.34-1.83z" /><path d="M13 13l6 6" /></svg>,
    clock: <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  };
  return icons[name] || null;
}

export default function GooglePosts() {
  const active = POSTS.filter((p) => p.status === 'active');
  const totalViews = POSTS.reduce((s, p) => s + p.views, 0);
  const totalClicks = POSTS.reduce((s, p) => s + p.clicks, 0);

  return (
    <div className="gb-page">
      <PageHeader
        eyebrow="Google Business"
        title="Publicaciones"
        subtitle="Novedades, ofertas y eventos activos en tu ficha de Google"
        actions={
          <button className="gb-btn-primary"><Icon name="plus" /> Crear publicación</button>
        }
      />

      <div className="gb-stat-grid">
        <StatCard icon={<Icon name="posts" />} value={active.length} label="Publicaciones activas" color="orange" />
        <StatCard icon={<Icon name="eye" />} value={totalViews.toLocaleString()} label="Vistas totales" color="navy" />
        <StatCard icon={<Icon name="click" />} value={totalClicks} label="Clics totales" color="forest" />
        <StatCard icon={<Icon name="clock" />} value="4 días" label="Próxima en expirar" color="gold" />
      </div>

      <div className="gb-posts-list">
        {POSTS.map((p) => (
          <div key={p.id} className="gb-post-card">
            <div className="gb-post-card__thumb" style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)` }}>
              <Icon name="posts" width={22} height={22} />
            </div>
            <div className="gb-post-card__body">
              <div className="gb-post-card__top">
                <span className="gb-post-card__type">{p.type}</span>
                <span className={`gb-post-card__status gb-post-card__status--${p.status}`}>
                  {p.status === 'active' ? 'Activa' : 'Expirada'}
                </span>
              </div>
              <h3 className="gb-post-card__title">{p.title}</h3>
              <p className="gb-post-card__text">{p.text}</p>
              <span className="gb-post-card__range">{p.range}</span>
            </div>
            <div className="gb-post-card__stats">
              <div><strong>{p.views}</strong><span>vistas</span></div>
              <div><strong>{p.clicks}</strong><span>clics</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
