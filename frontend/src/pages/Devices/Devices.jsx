import { useState, useMemo } from 'react';
import { ALL_DEVICES } from '../../data/devices';
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

/* ─── Main Page ─────────────────────────────────────────────── */
const FILTER_TABS = [
  { id: 'all',      label: 'Todos' },
  { id: 'nfc',      label: 'NFC' },
  { id: 'qr',       label: 'QR' },
  { id: 'active',   label: 'Activos' },
  { id: 'inactive', label: 'Inactivos' },
];

export default function DevicesPage() {
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [viewMode, setViewMode]     = useState('grid');   // 'grid' | 'table'
  const [selected, setSelected]     = useState(null);

  /* Derived stats */
  const totalActive   = ALL_DEVICES.filter(d => d.status === 'active').length;
  const totalNfc      = ALL_DEVICES.filter(d => d.type === 'nfc').length;
  const totalQr       = ALL_DEVICES.filter(d => d.type === 'qr').length;

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

  return (
    <div className="devices-page">

      {/* ── Header ── */}
      <div className="devices-page__header">
        <div className="devices-page__title-block">
          <div className="devices-page__eyebrow">
            <span className="devices-page__eyebrow-dot" />
            Gestión de dispositivos
          </div>
          <h1 className="devices-page__title">Dispositivos NFC &amp; QR</h1>
          <p className="devices-page__subtitle">
            {ALL_DEVICES.length} dispositivos registrados · {totalActive} activos en este momento
          </p>
        </div>

        <div className="devices-page__actions">
          <button className="devices-page__btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar
          </button>
          <button className="devices-page__btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo Dispositivo
          </button>
        </div>
      </div>

      {/* ── Stats Strip ── */}
      <div className="devices-stats">
        {[
          { icon: 'total',  label: 'Total dispositivos', value: ALL_DEVICES.length, color: 'total' },
          { icon: 'active', label: 'Activos ahora',       value: totalActive,        color: 'active' },
          { icon: 'nfc',    label: 'Tarjetas NFC',        value: totalNfc,           color: 'nfc' },
          { icon: 'qr',     label: 'Expositores QR',      value: totalQr,            color: 'qr' },
        ].map((s, i) => (
          <div key={s.icon} className="devices-stat-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className={`devices-stat-card__icon devices-stat-card__icon--${s.color}`}>
              {s.icon === 'total'  && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>}
              {s.icon === 'active' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
              {s.icon === 'nfc'    && <NfcIcon size={20} />}
              {s.icon === 'qr'     && <QrIcon size={20} />}
            </div>
            <div className="devices-stat-card__body">
              <span className="devices-stat-card__value">{s.value}</span>
              <span className="devices-stat-card__label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
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

      {/* ── Content ── */}
      {viewMode === 'grid'
        ? <DeviceCardGrid devices={filtered} onSelect={setSelected} />
        : <DeviceTable    devices={filtered} onSelect={setSelected} />
      }

      {/* ── Footer ── */}
      <div className="devices-page__footer">
        <p className="devices-page__footer-text">
          © 2026 <span className="devices-page__footer-brand">linkstar<span className="devices-page__footer-dot">.</span></span> — Panel de gestión de reseñas
        </p>
      </div>

      {/* ── Detail Modal ── */}
      {selected && <DeviceModal device={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
