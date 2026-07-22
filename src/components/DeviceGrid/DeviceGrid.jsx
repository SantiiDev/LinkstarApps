import './DeviceGrid.css';

const devices = [
  {
    id: 1,
    name: 'Google NFC #1',
    type: 'nfc',
    location: 'Sucursal Centro — Mesa 5',
    status: 'active',
    scans: 1847,
    reviews: 523,
    conversion: '28.3%',
  },
  {
    id: 2,
    name: 'QR Expositor #1',
    type: 'qr',
    location: 'Sucursal Centro — Entrada',
    status: 'active',
    scans: 1204,
    reviews: 341,
    conversion: '28.3%',
  },
  {
    id: 3,
    name: 'Google NFC #2',
    type: 'nfc',
    location: 'Sucursal Norte — Barra',
    status: 'active',
    scans: 956,
    reviews: 278,
    conversion: '29.1%',
  },
  {
    id: 4,
    name: 'QR Expositor #2',
    type: 'qr',
    location: 'Sucursal Sur — Recepción',
    status: 'inactive',
    scans: 432,
    reviews: 115,
    conversion: '26.6%',
  },
  {
    id: 5,
    name: 'Google NFC #3',
    type: 'nfc',
    location: 'Sucursal Centro — Caja',
    status: 'active',
    scans: 2103,
    reviews: 612,
    conversion: '29.1%',
  },
  {
    id: 6,
    name: 'Google NFC #4',
    type: 'nfc',
    location: 'Sucursal Norte — Mesa 3',
    status: 'active',
    scans: 789,
    reviews: 198,
    conversion: '25.1%',
  },
];

function DeviceIcon({ type, className }) {
  if (type === 'nfc') {
    return (
      <div className={`device-card__icon device-card__icon--nfc`}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
          <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
          <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" />
          <path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`device-card__icon device-card__icon--qr`}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="8" height="8" rx="1" />
        <rect x="14" y="2" width="8" height="8" rx="1" />
        <rect x="2" y="14" width="8" height="8" rx="1" />
        <path d="M14 14h2v2h-2z" />
        <path d="M20 14h2v2h-2z" />
        <path d="M14 20h2v2h-2z" />
        <path d="M20 20h2v2h-2z" />
        <path d="M17 17h2v2h-2z" />
      </svg>
    </div>
  );
}

export default function DeviceGrid() {
  return (
    <div className="devices-section animate-fade-in-up animate-delay-6">
      <div className="devices-section__header">
        <h3 className="devices-section__title">Gestión de Dispositivos</h3>
        <button className="devices-section__add-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Agregar Dispositivo
        </button>
      </div>

      <div className="device-grid">
        {devices.map((device, index) => (
          <div
            key={device.id}
            className="device-card"
            style={{ animationDelay: `${0.6 + index * 0.08}s` }}
          >
            <div className={`device-card__status-bar device-card__status-bar--${device.status}`} />

            <div className="device-card__header">
              <DeviceIcon type={device.type} />
              <span className={`device-card__badge device-card__badge--${device.status}`}>
                <span className={`device-card__badge-dot device-card__badge-dot--${device.status}`} />
                {device.status === 'active' ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <div className="device-card__name">{device.name}</div>
            <div className="device-card__location">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {device.location}
            </div>

            <div className="device-card__stats">
              <div className="device-card__stat">
                <span className="device-card__stat-value">{device.scans.toLocaleString()}</span>
                <span className="device-card__stat-label">Escaneos</span>
              </div>
              <div className="device-card__stat-divider" />
              <div className="device-card__stat">
                <span className="device-card__stat-value">{device.reviews}</span>
                <span className="device-card__stat-label">Reseñas</span>
              </div>
              <div className="device-card__stat-divider" />
              <div className="device-card__stat">
                <span className="device-card__stat-value">{device.conversion}</span>
                <span className="device-card__stat-label">Conversión</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
