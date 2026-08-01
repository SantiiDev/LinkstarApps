import './RecentActivity.css';

const activityData = [
  {
    id: 1,
    type: 'scan',
    title: 'Google NFC #1 — Mesa 5',
    description: 'Cliente escaneó la tarjeta NFC en sucursal Centro',
    time: 'Hace 2 min',
    badge: 'Escaneo',
  },
  {
    id: 2,
    type: 'review',
    title: 'Nueva reseña ★★★★★',
    description: '"Excelente servicio, muy recomendado" — María G.',
    time: 'Hace 8 min',
    badge: 'Reseña',
  },
  {
    id: 3,
    type: 'scan',
    title: 'QR Expositor #3 — Entrada',
    description: 'Escaneo desde expositor de acrílico en recepción',
    time: 'Hace 15 min',
    badge: 'Escaneo',
  },
  {
    id: 4,
    type: 'device',
    title: 'Dispositivo NFC #7 conectado',
    description: 'Tarjeta NFC activada en sucursal Norte',
    time: 'Hace 32 min',
    badge: 'Dispositivo',
  },
  {
    id: 5,
    type: 'review',
    title: 'Nueva reseña ★★★★☆',
    description: '"Buen lugar, volvería sin duda" — Carlos R.',
    time: 'Hace 1 h',
    badge: 'Reseña',
  },
  {
    id: 6,
    type: 'scan',
    title: 'Google NFC #4 — Barra',
    description: 'Escaneo detectado en zona de barra principal',
    time: 'Hace 1.5 h',
    badge: 'Escaneo',
  },
];

export default function RecentActivity() {
  return (
    <div className="activity-card animate-fade-in-up animate-delay-5">
      <div className="activity-card__header">
        <h3 className="activity-card__title">Actividad Reciente</h3>
        <button className="activity-card__view-all">Ver todo</button>
      </div>

      <div className="activity-list">
        {activityData.map((item, index) => (
          <div
            key={item.id}
            className="activity-item"
            style={{ animationDelay: `${0.5 + index * 0.08}s` }}
          >
            <span className={`activity-item__dot activity-item__dot--${item.type}`}></span>
            <div className="activity-item__content">
              <div className="activity-item__title">{item.title}</div>
              <div className="activity-item__description">{item.description}</div>
            </div>
            <div className="activity-item__meta">
              <span className="activity-item__time">{item.time}</span>
              <span className={`activity-item__badge activity-item__badge--${item.type}`}>
                {item.badge}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
