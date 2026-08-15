import { useState, useMemo, useEffect } from 'react';
import { ALL_DEVICES } from '../../data/devices';
import { ALL_LOCATIONS } from '../../data/locations';
import GoogleConnectBanner from '../../components/GoogleConnectBanner/GoogleConnectBanner';
import TrendChart from '../../components/TrendChart/TrendChart';
import Select from '../../components/Select/Select';
import {
  fetchDevicePerformance,
  fetchLocationPerformance,
  fetchDeviceScansSeries,
  fetchScansDaily,
  formatRelativeTime,
  colorForIndex,
  lastNDayLabels,
} from '../../lib/dashboardApi';
import { REDIRECT_DOMAIN } from '../../lib/config';
import { downloadQrPng } from '../../lib/qr';
import './Devices.css';

// Largo de la sparkline de cada tarjeta. Es independiente del selector de
// 7/30 días del gráfico grande de abajo: ese recarga, éste viaja con la carga
// inicial de los dispositivos.
const SPARKLINE_DAYS = 7;

// v_device_performance (0008_dashboard_views.sql) no expone "reseñas" ni
// "conversión" por dispositivo — esa atribución no existe a ese grano en el
// schema (decisión 6: la atribución por dispositivo es un prorrateo que
// todavía no calcula ninguna vista). Se muestra "—" en vez de inventar un
// número.
// `series` es el Map<device_id, number[]> de fetchDeviceScansSeries (0016). Un
// dispositivo sin escaneos en la ventana no está en el Map: siete ceros es la
// respuesta correcta ahí, porque el dato existe y es cero — a diferencia de
// `reviews`/`conversion`, que se dejan en null porque no hay de dónde sacarlos.
function mapDeviceRow(row, series) {
  return {
    id: row.device_id,
    publicId: row.public_id,
    name: row.label,
    type: row.kind === 'instagram' ? 'instagram' : 'google',
    location: row.location_name || 'Sin ubicación asignada',
    status: row.status === 'active' ? 'active' : 'inactive',
    scans: row.total_scans ?? 0,
    reviews: null,
    conversion: null,
    lastScan: formatRelativeTime(row.last_scan_at),
    activeSince: null,
    weeklyScans: series?.get(row.device_id) ?? Array(SPARKLINE_DAYS).fill(0),
  };
}

// El QR siempre codifica ?s=q (medio "qr" en scan_events.medium, 0011). El
// NFC se graba aparte con la misma URL pero ?s=n — no lo genera esta pantalla.
// Los devices mock (fallback si falla la carga real) no tienen public_id, así
// que no hay URL real que codificar: el botón queda deshabilitado para ellos.
function handleDownloadQr(device) {
  if (!device.publicId) return;
  const url = `https://${REDIRECT_DOMAIN}/d/${device.publicId}?s=q`;
  downloadQrPng(url, `linkstar-qr-${device.publicId}.png`).catch(err => {
    console.error('No se pudo generar el QR:', err);
  });
}

// "—" para campos sin dato real (null) en vez de renderizar "null" o "%" solo.
function stat(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${value}${suffix}`;
}

// Shape mínima que necesita el mini-ranking de abajo de esta página.
function mapLocationForRanking(row, index) {
  return {
    id: row.location_id,
    name: row.name,
    totalScans: row.unique_scans_30d ?? 0,
    totalReviews: row.new_reviews_30d ?? 0,
    color: colorForIndex(index),
  };
}

const DEVICE_TYPE_OPTIONS = [
  { value: 'google', label: 'Expositor Google Maps' },
  { value: 'instagram', label: 'Expositor Instagram' },
];

const ACTIVITY_PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
];

/* ─── Shared icons ─────────────────────────────────────────── */
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

function GoogleMapsIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function InstagramIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="6" />
      <circle cx="12" cy="12" r="4.5" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

/* `type` is the destination the expositor's NFC/QR redirects to — every
   Linkstar device has both built in, this isn't hardware. */
function DeviceTypeIcon({ type, size = 24 }) {
  return type === 'google' ? <GoogleMapsIcon size={size} /> : <InstagramIcon size={size} />;
}

const TYPE_LABELS = { google: 'Expositor Google Maps', instagram: 'Expositor Instagram' };

/* ─── Sparkline bar mini-chart ──────────────────────────────── */
/* max(2px, …) para que un día sin escaneos siga dibujando una barra al ras.
   Con datos reales una organización nueva tiene la serie entera en cero, y sin
   ese piso las barras desaparecen: la franja queda vacía y se lee como un
   gráfico roto en vez de como "no hubo actividad". Mismo criterio que la
   distribución por estrellas de Mi Empresa. */
function SparkLine({ data, inactive, className = '' }) {
  const max = Math.max(...data, 1);
  return (
    <div className={`device-full-card__sparkline ${className}`}>
      {data.map((v, i) => (
        <div
          key={i}
          className={`device-full-card__spark-bar ${inactive ? 'device-full-card__spark-bar--inactive' : ''}`}
          style={{ height: `max(2px, ${(v / max) * 100}%)` }}
        />
      ))}
    </div>
  );
}

/* ─── Device Detail Modal ────────────────────────────────────── */
function DeviceModal({ device, onClose, onSave, onToggleStatus }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  if (!device) return null;
  const max = Math.max(...device.weeklyScans, 1);
  const days = lastNDayLabels(device.weeklyScans.length);

  function startEditing() {
    setForm({ name: device.name, location: device.location, type: device.type });
    setEditing(true);
  }

  function handleSave(e) {
    e.preventDefault();
    onSave({ ...device, ...form });
    setEditing(false);
  }

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
          {editing ? (
            /* Edit form */
            <form id="device-edit-form" className="device-edit-form" onSubmit={handleSave}>
              <label className="device-edit-form__field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                />
              </label>
              <div className="device-edit-form__field">
                <span>Ubicación</span>
                <Select
                  value={form.location}
                  onChange={v => setForm(f => ({ ...f, location: v }))}
                  options={ALL_LOCATIONS.map(l => ({ value: l.name, label: l.name }))}
                  triggerClassName="device-edit-form__select-trigger"
                />
              </div>
              <div className="device-edit-form__field">
                <span>Tipo</span>
                <Select
                  value={form.type}
                  onChange={v => setForm(f => ({ ...f, type: v }))}
                  options={DEVICE_TYPE_OPTIONS}
                  triggerClassName="device-edit-form__select-trigger"
                />
              </div>
            </form>
          ) : (
            <>
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
                    {stat(device.reviews)}
                  </span>
                  <span className="device-modal__stat-lbl">Reseñas</span>
                </div>
                <div className="device-modal__stat-box">
                  <span className="device-modal__stat-val" style={{ color: 'var(--color-forest)' }}>
                    {stat(device.conversion, '%')}
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
                  <div className="device-modal__info-key">Activo desde</div>
                  <div className="device-modal__info-val">{stat(device.activeSince)}</div>
                </div>
                <div className="device-modal__info-item">
                  <div className="device-modal__info-key">Último escaneo</div>
                  <div className="device-modal__info-val">{device.lastScan}</div>
                </div>
                <div className="device-modal__info-item">
                  <div className="device-modal__info-key">Tipo</div>
                  <div className="device-modal__info-val">{TYPE_LABELS[device.type]}</div>
                </div>
              </div>

              {/* Mini chart */}
              <div className="device-modal__chart-title">
                Escaneos últimos {device.weeklyScans.length} días
              </div>
              <div className="device-modal__sparkline">
                {device.weeklyScans.map((v, i) => (
                  <div
                    key={i}
                    className="device-modal__spark-bar"
                    style={{ height: `max(2px, ${(v / max) * 100}%)` }}
                    title={`${days[i]}: ${v}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="device-modal__footer">
          {editing ? (
            <>
              <button type="button" className="device-modal__action-btn device-modal__action-btn--secondary" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button type="submit" form="device-edit-form" className="device-modal__action-btn device-modal__action-btn--primary">
                Guardar cambios
              </button>
            </>
          ) : (
            <>
              <button
                className="device-modal__action-btn device-modal__action-btn--secondary"
                onClick={() => handleDownloadQr(device)}
                disabled={!device.publicId}
                title={device.publicId ? undefined : 'QR no disponible (dato de ejemplo)'}
              >
                Descargar QR
              </button>
              <button className="device-modal__action-btn device-modal__action-btn--secondary" onClick={startEditing}>
                Editar
              </button>
              <button className="device-modal__action-btn device-modal__action-btn--danger" onClick={() => onToggleStatus(device)}>
                {device.status === 'active' ? 'Desactivar' : 'Activar'}
              </button>
            </>
          )}
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
                {device.location}
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
                    {stat(device.reviews)}
                  </span>
                  <span className="device-full-card__stat-label">Reseñas</span>
                </div>
                <div className="device-full-card__stat">
                  <span className="device-full-card__stat-value device-full-card__stat-value--forest">
                    {stat(device.conversion, '%')}
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
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  className="device-full-card__menu-btn"
                  onClick={e => { e.stopPropagation(); handleDownloadQr(device); }}
                  disabled={!device.publicId}
                  aria-label="Descargar QR"
                  title={device.publicId ? 'Descargar QR' : 'QR no disponible (dato de ejemplo)'}
                >
                  <QrIcon size={14} />
                </button>
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
            <th>QR</th>
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
                    <div className="table-type">{TYPE_LABELS[device.type]}</div>
                  </div>
                </div>
              </td>
              <td>{device.location}</td>
              <td>
                <span className={`table-badge table-badge--${device.status}`}>
                  <span className="table-badge-dot" />
                  {device.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td><span className="table-stat table-stat--orange">{device.scans.toLocaleString()}</span></td>
              <td><span className="table-stat table-stat--gold">{stat(device.reviews)}</span></td>
              <td><span className="table-stat table-stat--forest">{stat(device.conversion, '%')}</span></td>
              <td>{device.lastScan}</td>
              <td>
                <button
                  className="device-full-card__menu-btn"
                  onClick={e => { e.stopPropagation(); handleDownloadQr(device); }}
                  disabled={!device.publicId}
                  aria-label="Descargar QR"
                  title={device.publicId ? 'Descargar QR' : 'QR no disponible (dato de ejemplo)'}
                >
                  <QrIcon size={14} />
                </button>
              </td>
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
  { id: 'all',       label: 'Todos' },
  { id: 'google',    label: 'Google Maps' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'active',    label: 'Activos' },
  { id: 'inactive',  label: 'Inactivos' },
];

/* Last 7 calendar days of aggregate scans across mock devices — sólo se usa
   si falla la carga real (ver fetchScansDaily más abajo). */
function buildDailyScansMock() {
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

/* v_scans_daily trae un total por día ya agregado para toda la organización
   (decisión 2: nunca se consulta scan_events/scan_daily_rollups directo). Se
   rellenan con 0 los días sin fila (sin escaneos ese día). */
function buildDailyScansFromRows(rows, days) {
  const byDay = new Map(rows.map(r => [r.day, r.scans]));
  const today = new Date();
  const totals = [];
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    totals.push(byDay.get(key) ?? 0);
    labels.push(date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', ''));
  }
  return { totals, labels };
}

export default function DevicesPage({ onNavigate, onNavigateSettings }) {
  const [devices, setDevices]       = useState([]);
  const [locations, setLocations]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [viewMode, setViewMode]     = useState('grid');   // 'grid' | 'table'
  const [selected, setSelected]     = useState(null);
  const [claiming, setClaiming]     = useState(false);

  /* Carga real desde Supabase (v_device_performance / v_location_performance).
     Si la query falla (red, RLS, lo que sea) se cae de vuelta al mock — nunca
     se deja la pantalla en blanco. Un resultado vacío (org sin dispositivos
     todavía) NO es una falla: se muestra tal cual, vacío. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deviceRows, locationRows, deviceSeries] = await Promise.all([
          fetchDevicePerformance(),
          fetchLocationPerformance(),
          // La serie tiene su propio catch a propósito: si falla (típicamente
          // porque la migración 0016 todavía no se aplicó en este entorno),
          // las sparklines quedan planas pero el resto de la pantalla sigue
          // mostrando datos reales. Sin esto, una vista faltante tiraba toda
          // la carga al mock y escondía totales que sí eran verdaderos.
          fetchDeviceScansSeries(SPARKLINE_DAYS).catch(err => {
            console.error('No se pudo cargar la serie diaria por dispositivo, las sparklines quedan en cero:', err);
            return new Map();
          }),
        ]);
        if (cancelled) return;
        setDevices(deviceRows.map(row => mapDeviceRow(row, deviceSeries)));
        setLocations(locationRows.map(mapLocationForRanking));
      } catch (err) {
        console.error('No se pudieron cargar los dispositivos reales, muestro datos de ejemplo:', err);
        if (cancelled) return;
        setDevices(ALL_DEVICES);
        setLocations(ALL_LOCATIONS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Derived stats */
  const totalActive = devices.filter(d => d.status === 'active').length;
  const totalScans  = devices.reduce((sum, d) => sum + d.scans, 0);

  /* Filtered list */
  const filtered = useMemo(() => {
    return devices.filter(d => {
      const matchSearch =
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.location.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        filter === 'all'       ? true :
        filter === 'google'    ? d.type === 'google' :
        filter === 'instagram' ? d.type === 'instagram' :
        filter === 'active'    ? d.status === 'active' :
        filter === 'inactive'  ? d.status === 'inactive' : true;

      return matchSearch && matchFilter;
    });
  }, [devices, search, filter]);

  const [activityPeriod, setActivityPeriod] = useState('7');
  const [dailyScans, setDailyScans] = useState({ totals: [], labels: [] });

  /* El gráfico de actividad se recarga cada vez que cambia el período
     (7/30 días) — v_scans_daily se filtra client-side a ese rango. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const days = Number(activityPeriod);
      try {
        const rows = await fetchScansDaily(days);
        if (cancelled) return;
        setDailyScans(buildDailyScansFromRows(rows, days));
      } catch (err) {
        console.error('No se pudo cargar la actividad diaria real, muestro datos de ejemplo:', err);
        if (cancelled) return;
        setDailyScans(buildDailyScansMock());
      }
    })();
    return () => { cancelled = true; };
  }, [activityPeriod]);

  function handleSaveDevice(updated) {
    setDevices(prev => prev.map(d => (d.id === updated.id ? updated : d)));
    setSelected(updated);
  }

  function handleToggleStatus(device) {
    const updated = { ...device, status: device.status === 'active' ? 'inactive' : 'active' };
    setDevices(prev => prev.map(d => (d.id === updated.id ? updated : d)));
    setSelected(updated);
  }

  const topLocations = useMemo(
    () => [...locations].sort((a, b) => b.totalScans - a.totalScans).slice(0, 3),
    [locations]
  );

  if (loading) {
    return <div className="app-loading">Cargando…</div>;
  }

  return (
    <div className="devices-page">

      {/* ── Header ── */}
      <div className="devices-page__header">
        <div className="devices-page__title-block">
          <h1 className="devices-page__title">Dispositivos</h1>
          <p className="devices-page__subtitle">Gestión de expositores Linkstar (NFC + QR en un mismo dispositivo)</p>
        </div>

        <div className="devices-page__actions">
          <button className="devices-page__btn-icon" title="Cada expositor tiene NFC y QR incorporados, y redirige a tu ficha de Google Maps o a tu Instagram según el tipo." aria-label="Información">
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
                placeholder="Buscar por nombre o ubicación…"
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
          <span className="devices-teaser__title">
            Ranking de Empleados
            <span className="devices-teaser__badge">Próximamente</span>
          </span>
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
            <span className="devices-activity__subtitle">Escaneos totales por día en el período seleccionado</span>
          </div>
          <Select
            value={activityPeriod}
            onChange={setActivityPeriod}
            options={ACTIVITY_PERIOD_OPTIONS}
            triggerClassName="devices-period-select"
          />
        </div>
        <TrendChart
          data={dailyScans.totals}
          labels={dailyScans.labels}
          color="orange"
          seriesName="Escaneos"
          xLabel="Día"
          yLabel="Escaneos"
        />
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
        {/* Envoltorio con scroll horizontal: en teléfonos la tabla no entra y
            antes se ocultaba la columna de reseñas, que es justamente el dato. */}
        <div className="devices-locations-table-wrap">
          <table className="devices-locations-table">
            <thead>
              <tr>
                <th>Nombre del local</th>
                <th>Escaneos</th>
                <th>Reseñas (estimado)</th>
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
      </div>

      {/* ── Footer ── */}
      <div className="devices-page__footer">
        <p className="devices-page__footer-text">
          © 2026 <span className="devices-page__footer-brand">linkstar<span className="devices-page__footer-dot">.</span></span> — Panel de gestión de reseñas
        </p>
      </div>

      {/* ── Detail Modal ── */}
      {selected && (
        <DeviceModal
          device={selected}
          onClose={() => setSelected(null)}
          onSave={handleSaveDevice}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {/* ── Claim device modal ── */}
      {claiming && <ClaimDeviceModal onClose={() => setClaiming(false)} />}
    </div>
  );
}
