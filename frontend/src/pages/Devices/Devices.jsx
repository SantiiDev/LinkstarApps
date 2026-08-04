import { useState, useMemo } from 'react';
import { ALL_DEVICES } from '../../data/devices';
import { ALL_LOCATIONS } from '../../data/locations';
import GoogleConnectBanner from '../../components/GoogleConnectBanner/GoogleConnectBanner';
import TrendChart from '../../components/TrendChart/TrendChart';
import './Devices.css';

/* ─── Shared icons ─────────────────────────────────────────── */
function NfcIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
      <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
      <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" />
      <path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
    </svg>
  );
}

function QrIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="8" height="8" rx="1" />
      <rect x="14" y="2" width="8" height="8" rx="1" />
      <rect x="2" y="14" width="8" height="8" rx="1" />
      <path d="M14 14h2v2h-2zM20 14h2v2h-2zM14 20h2v2h-2zM20 20h2v2h-2zM17 17h2v2h-2z" />
    </svg>
  );
}

function DeviceTypeIcon({ type, size = 24 }) {
  return type === 'nfc' ? <NfcIcon size={size} /> : <QrIcon size={size} />;
}

/* ─── Sparkline bar mini-chart ──────────────────────────────── */
function SparkLine({ data, inactive, className = '' }) {
  const max = Math.max(...data, 1);
  return (
    <div className={`device-full-card__sparkline ${className}`}>
      {data.map((v, i) => (
        <div
          key={i}
          className={`device-full-card__spark-bar ${inactive ? 'device-full-card__spark-bar--inactive' : ''}`}
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

/* ─── Device Detail Modal ────────────────────────────────────── */
function DeviceModal({ device, onClose }) {
  if (!device) return null;
  const max = Math.max(...device.weeklyScans, 1);
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <div className="device-modal-overlay" onClick={onClose}>
      <div className="device-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="device-modal__header">
          <div className="device-modal__header-left">
            <div className={`device-modal__icon device-modal__icon--${device.type}`}>
              <DeviceTypeIcon type={device.type} size={28} />
            </div>
            <div>
              <div className="device-modal__name">{device.name}</div>
              <span className={`table-badge table-badge--${device.status}`}>
                <span className="table-badge-dot" />
                {device.status === 'active' ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
          <button className="device-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="device-modal__body">
          {/* KPI row */}
          <div className="device-modal__stats-row">
            <div className="device-modal__stat-box">
              <span className="device-modal__stat-val" style={{ color: 'var(--color-orange)' }}>
                {device.scans.toLocaleString()}
              </span>
              <span className="device-modal__stat-lbl">Escaneos</span>
            </div>
            <div className="device-modal__stat-box">
              <span className="device-modal__stat-val" style={{ color: 'var(--color-gold)' }}>
                {device.reviews}
              </span>
              <span className="device-modal__stat-lbl">Reseñas</span>
            </div>
            <div className="device-modal__stat-box">
              <span className="device-modal__stat-val" style={{ color: 'var(--color-forest)' }}>
                {device.conversion}%
              </span>
              <span className="device-modal__stat-lbl">Conversión</span>
            </div>
          </div>

          {/* Info grid */}
          <div className="device-modal__info-grid">
            <div className="device-modal__info-item">
              <div className="device-modal__info-key">Ubicación</div>
              <div className="device-modal__info-val">{device.location}</div>
            </div>
            <div className="device-modal__info-item">
              <div className="device-modal__info-key">Zona</div>
              <div className="device-modal__info-val">{device.zone}</div>
            </div>
            <div className="device-modal__info-item">
              <div className="device-modal__info-key">Empleado asignado</div>
              <div className="device-modal__info-val">{device.assignedTo}</div>
            </div>
            <div className="device-modal__info-item">
              <div className="device-modal__info-key">Activo desde</div>
              <div className="device-modal__info-val">{device.activeSince}</div>
            </div>
            <div className="device-modal__info-item">
              <div className="device-modal__info-key">Último escaneo</div>
              <div className="device-modal__info-val">{device.lastScan}</div>
            </div>
            <div className="device-modal__info-item">
              <div className="device-modal__info-key">Tipo</div>
              <div className="device-modal__info-val">{device.type === 'nfc' ? 'Tarjeta NFC' : 'QR Expositor'}</div>
            </div>
          </div>

          {/* Mini chart */}
          <div className="device-modal__chart-title">Escaneos últimos 7 días</div>
          <div className="device-modal__sparkline">
            {device.weeklyScans.map((v, i) => (
              <div
                key={i}
                className="device-modal__spark-bar"
                style={{ height: `${(v / max) * 100}%` }}
                title={`${days[i]}: ${v}`}
              />
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="device-modal__footer">
          <button className="device-modal__action-btn device-modal__action-btn--primary">
            Ver historial completo
          </button>
          <button className="device-modal__action-btn device-modal__action-btn--secondary">
            Editar
          </button>
          <button className="device-modal__action-btn device-modal__action-btn--danger">
            {device.status === 'active' ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Card View ─────────────────────────────────────────────── */
function DeviceCardGrid({ devices, onSelect }) {
  if (devices.length === 0) {
    return (
      <div className="devices-grid">
        <div className="devices-empty">
          <div className="devices-empty__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div className="devices-empty__title">Sin resultados</div>
          <div className="devices-empty__text">No hay dispositivos que coincidan con tu búsqueda.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="devices-grid">
      {devices.map((device, index) => {
        const max = Math.max(...device.weeklyScans, 1);
        return (
          <div
            key={device.id}
            className="device-full-card"
            style={{ animationDelay: `${index * 0.07}s` }}
            onClick={() => onSelect(device)}
          >
            <div className={`device-full-card__accent device-full-card__accent--${device.status}`} />

            <div className="device-full-card__body">
              {/* Top row */}
              <div className="device-full-card__top">
                <div className={`device-full-card__icon-wrap device-full-card__icon-wrap--${device.type}`}>
                  <DeviceTypeIcon type={device.type} size={26} />
                </div>
                <span className={`device-full-card__badge device-full-card__badge--${device.status}`}>
                  <span className="device-full-card__badge-pulse" />
                  {device.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="device-full-card__name">{device.name}</div>

              <div className="device-full-card__location">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {device.location} — {device.zone}
              </div>

              <div className="device-full-card__assigned">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                {device.assignedTo}
              </div>

              {/* Sparkline */}
              <SparkLine data={device.weeklyScans} inactive={device.status === 'inactive'} />

              {/* Stats */}
              <div className="device-full-card__stats">
                <div className="device-full-card__stat">
                  <span className="device-full-card__stat-value device-full-card__stat-value--orange">
                    {device.scans.toLocaleString()}
                  </span>
                  <span className="device-full-card__stat-label">Escaneos</span>
                </div>
                <div className="device-full-card__stat">
                  <span className="device-full-card__stat-value device-full-card__stat-value--gold">
                    {device.reviews}
                  </span>
                  <span className="device-full-card__stat-label">Reseñas</span>
                </div>
                <div className="device-full-card__stat">
                  <span className="device-full-card__stat-value device-full-card__stat-value--forest">
                    {device.conversion}%
                  </span>
                  <span className="device-full-card__stat-label">Conversión</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="device-full-card__footer">
              <span className="device-full-card__last-scan">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                {device.lastScan}
              </span>
              <button
                className="device-full-card__menu-btn"
                onClick={e => { e.stopPropagation(); onSelect(device); }}
                aria-label="Ver detalle"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Table View ────────────────────────────────────────────── */
function DeviceTable({ devices, onSelect }) {
  return (
    <div className="devices-table-wrap">
      <table className="devices-table">
        <thead>
          <tr>
            <th>Dispositivo</th>
            <th>Ubicación</th>
            <th>Estado</th>
            <th>Escaneos</th>
            <th>Reseñas</th>
            <th>Conversión</th>
            <th>Último escaneo</th>
          </tr>
        </thead>
        <tbody>
          {devices.map(device => (
            <tr key={device.id} onClick={() => onSelect(device)}>
              <td>
                <div className="table-device-name">
                  <div className={`table-device-icon table-device-icon--${device.type}`}>
                    <DeviceTypeIcon type={device.type} size={18} />
                  </div>
                  <div>
                    <div className="table-name">{device.name}</div>
                    <div className="table-type">{device.type === 'nfc' ? 'Tarjeta NFC' : 'QR Expositor'}</div>
                  </div>
                </div>
              </td>
              <td>{device.location} — {device.zone}</td>
              <td>
                <span className={`table-badge table-badge--${device.status}`}>
                  <span className="table-badge-dot" />
                  {device.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td><span className="table-stat table-stat--orange">{device.scans.toLocaleString()}</span></td>
              <td><span className="table-stat table-stat--gold">{device.reviews}</span></td>
              <td><span className="table-stat table-stat--forest">{device.conversion}%</span></td>
              <td>{device.lastScan}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Claim device modal (Escanear QR) ───────────────────────── */
function ClaimDeviceModal({ onClose }) {
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setSuccess(true);
  }

  return (
    <div className="device-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()}>
        <button className="claim-modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {!success ? (
          <>
            <div className="claim-modal__icon"><QrIcon size={26} /></div>
            <h3 className="claim-modal__title">Vincular un dispositivo</h3>
            <p className="claim-modal__text">
              Escaneá el código QR o acercá el NFC impreso en tu dispositivo Linkstar, o ingresá el código manualmente.
            </p>
            <form className="claim-modal__form" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Código de vinculación (ej. LNK-4F2A9C)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoFocus
              />
              <button type="submit" className="claim-modal__submit" disabled={!code.trim()}>
                Vincular dispositivo
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="claim-modal__icon claim-modal__icon--success">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="claim-modal__title">¡Dispositivo vinculado!</h3>
            <p className="claim-modal__text">En unos minutos vas a ver sus estadísticas acá mismo.</p>
            <button className="claim-modal__submit" onClick={onClose}>Listo</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
const FILTER_TABS = [
  { id: 'all',      label: 'Todos' },
  { id: 'nfc',      label: 'NFC' },
  { id: 'qr',       label: 'QR' },
  { id: 'active',   label: 'Activos' },
  { id: 'inactive', label: 'Inactivos' },
];

/* Last 7 calendar days of aggregate scans across all devices, for the activity chart */
function buildDailyScans() {
  const days = ALL_DEVICES[0]?.weeklyScans.length ?? 7;
  const totals = Array.from({ length: days }, (_, i) =>
    ALL_DEVICES.reduce((sum, d) => sum + (d.weeklyScans[i] ?? 0), 0)
  );
  const today = new Date();
  const labels = totals.map((_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - i));
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
  });
  return { totals, labels };
}

export default function DevicesPage({ onNavigate, onNavigateSettings }) {
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [viewMode, setViewMode]     = useState('grid');   // 'grid' | 'table'
  const [selected, setSelected]     = useState(null);
  const [claiming, setClaiming]     = useState(false);

  /* Derived stats */
  const totalActive = ALL_DEVICES.filter(d => d.status === 'active').length;
  const totalScans  = ALL_DEVICES.reduce((sum, d) => sum + d.scans, 0);

  /* Filtered list */
  const filtered = useMemo(() => {
    return ALL_DEVICES.filter(d => {
      const matchSearch =
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.location.toLowerCase().includes(search.toLowerCase()) ||
        d.zone.toLowerCase().includes(search.toLowerCase()) ||
        d.assignedTo.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        filter === 'all'      ? true :
        filter === 'nfc'      ? d.type === 'nfc' :
        filter === 'qr'       ? d.type === 'qr' :
        filter === 'active'   ? d.status === 'active' :
        filter === 'inactive' ? d.status === 'inactive' : true;

      return matchSearch && matchFilter;
    });
  }, [search, filter]);

  const { totals: dailyScans, labels: dayLabels } = useMemo(buildDailyScans, []);

  const topLocations = useMemo(
    () => [...ALL_LOCATIONS].sort((a, b) => b.totalScans - a.totalScans).slice(0, 3),
    []
  );

  return (
    <div className="devices-page">

      {/* ── Header ── */}
      <div className="devices-page__header">
        <div className="devices-page__title-block">
          <h1 className="devices-page__title">Dispositivos</h1>
          <p className="devices-page__subtitle">Gestión de dispositivos NFC y QR de Linkstar</p>
        </div>

        <div className="devices-page__actions">
          <button className="devices-page__btn-icon" title="Cada dispositivo NFC o QR redirige a tu ficha de Google para sumar reseñas." aria-label="Información">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          <button className="devices-page__btn-primary" onClick={() => setClaiming(true)}>
            <QrIcon size={15} />
            Escanear QR
          </button>
        </div>
      </div>

      <GoogleConnectBanner />

      {/* ── Devices card ── */}
      <div className="devices-card">
        <div className="devices-card__header">
          <div className="devices-card__header-left">
            <span className="devices-card__header-icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" /><path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
                <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" /><path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
              </svg>
            </span>
            Dispositivos
          </div>
          <div className="devices-card__header-stats">
            <span>{totalActive} dispositivos activos</span>
            <span className="devices-card__divider" />
            <span>{totalScans.toLocaleString()} escaneos totales</span>
          </div>
        </div>

        <div className="devices-card__body">
          {/* Toolbar */}
          <div className="devices-toolbar">
            {/* Search */}
            <div className="devices-search">
              <svg className="devices-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="devices-search__input"
                type="text"
                placeholder="Buscar por nombre, ubicación, empleado…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Filter tabs */}
            <div className="devices-filters">
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`devices-filter-tab ${filter === tab.id ? 'devices-filter-tab--active' : ''}`}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="devices-view-toggle">
              <button
                className={`devices-view-btn ${viewMode === 'grid' ? 'devices-view-btn--active' : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Vista grilla"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              </button>
              <button
                className={`devices-view-btn ${viewMode === 'table' ? 'devices-view-btn--active' : ''}`}
                onClick={() => setViewMode('table')}
                aria-label="Vista tabla"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          {viewMode === 'grid'
            ? <DeviceCardGrid devices={filtered} onSelect={setSelected} />
            : <DeviceTable    devices={filtered} onSelect={setSelected} />
          }
        </div>
      </div>

      {/* ── Ranking de Empleados teaser ── */}
      <button className="devices-teaser" onClick={() => onNavigateSettings ? onNavigateSettings('employees') : onNavigate?.('settings')}>
        <span className="devices-teaser__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <span className="devices-teaser__body">
          <span className="devices-teaser__title">Ranking de Empleados</span>
          <span className="devices-teaser__text">Controlá qué empleado consigue más reseñas en Google con cada dispositivo Linkstar.</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
        </svg>
      </button>

      {/* ── Actividad de Dispositivos ── */}
      <div className="devices-card devices-activity">
        <div className="devices-activity__header">
          <div>
            <h3 className="devices-activity__title">Actividad de Dispositivos</h3>
            <span className="devices-activity__subtitle">Escaneos únicos en el período seleccionado</span>
          </div>
          <select className="devices-period-select" defaultValue="7">
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
          </select>
        </div>
        <TrendChart data={dailyScans} labels={dayLabels} color="orange" />
      </div>

      {/* ── Ranking de ubicaciones ── */}
      <div className="devices-card devices-locations">
        <div className="devices-locations__header">
          <h3 className="devices-activity__title">Ranking de ubicaciones</h3>
          <button className="devices-locations__link" onClick={() => onNavigateSettings ? onNavigateSettings('locations') : onNavigate?.('settings')}>
            Ver más
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
        <table className="devices-locations-table">
          <thead>
            <tr>
              <th>Nombre del local</th>
              <th>Escaneos</th>
              <th>Reseñas</th>
            </tr>
          </thead>
          <tbody>
            {topLocations.map((loc) => (
              <tr key={loc.id}>
                <td>
                  <div className="devices-locations-table__name">
                    <span className="devices-locations-table__dot" style={{ background: loc.color }} />
                    {loc.name}
                  </div>
                </td>
                <td><span className="table-stat table-stat--orange">{loc.totalScans.toLocaleString()}</span></td>
                <td><span className="table-stat table-stat--gold">{loc.totalReviews}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="devices-page__footer">
        <p className="devices-page__footer-text">
          © 2026 <span className="devices-page__footer-brand">linkstar<span className="devices-page__footer-dot">.</span></span> — Panel de gestión de reseñas
        </p>
      </div>

      {/* ── Detail Modal ── */}
      {selected && <DeviceModal device={selected} onClose={() => setSelected(null)} />}

      {/* ── Claim device modal ── */}
      {claiming && <ClaimDeviceModal onClose={() => setClaiming(false)} />}
    </div>
  );
}
