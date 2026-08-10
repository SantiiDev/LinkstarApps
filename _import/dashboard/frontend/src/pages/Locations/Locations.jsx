import { useState, useMemo, useEffect } from 'react';
import { ALL_LOCATIONS } from '../../data/locations';
import {
  fetchLocationPerformance,
  fetchDevicePerformance,
  fetchEmployeeLeaderboard,
  formatRelativeTime,
  colorForIndex,
} from '../../lib/dashboardApi';
import './Locations.css';

/* ─── Helpers ──────────────────────────────────────────────── */
function pct(current, goal) {
  return Math.min(Math.round((current / goal) * 100), 100);
}

// "—" para campos sin dato real (null) en vez de "null" o "%" solo.
function stat(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${value}${suffix}`;
}

// v_location_performance (0008_dashboard_views.sql) no expone dirección,
// encargado, teléfono, zonas ni meta mensual — esos campos no existen a ese
// grano en el schema. Se cruza con v_device_performance/v_employee_leaderboard
// para armar listas reales de dispositivos/empleados y la última actividad.
function mapLocationRow(row, { devicesByLocation, employeesByLocation, index }) {
  const myDevices = devicesByLocation.get(row.location_id) || [];
  const myEmployees = employeesByLocation.get(row.location_id) || [];
  const lastScanAt = myDevices.reduce((latest, d) => {
    if (!d.last_scan_at) return latest;
    return !latest || d.last_scan_at > latest ? d.last_scan_at : latest;
  }, null);

  return {
    id: row.location_id,
    name: row.name,
    address: '—',
    city: row.city || '—',
    // La vista sólo excluye locations con deleted_at (soft-delete) — no hay
    // un flag real de "operativa/cerrada" más allá de eso.
    status: 'active',
    manager: '—',
    phone: '—',
    email: '—',
    openSince: '—',
    lastActivity: formatRelativeTime(lastScanAt),
    totalDevices: myDevices.length,
    activeDevices: myDevices.filter(d => d.status === 'active').length,
    totalEmployees: myEmployees.length,
    totalScans: row.unique_scans_30d ?? 0,
    totalReviews: row.new_reviews_30d ?? 0,
    avgConversion: row.conversion_rate,
    avgRating: row.average_rating,
    monthlyGoal: 100,
    weeklyScans: Array(7).fill(0),
    weeklyReviews: Array(7).fill(0),
    zones: [],
    devices: myDevices.map(d => d.label),
    employees: myEmployees.map(e => e.full_name),
    coordinates: null,
    color: colorForIndex(index),
  };
}

/* ─── Location Detail Modal ────────────────────────────────── */
function LocationModal({ location, onClose }) {
  if (!location) return null;
  const maxScans = Math.max(...location.weeklyScans, 1);
  const maxReviews = Math.max(...location.weeklyReviews, 1);
  const progress = pct(location.totalReviews, location.monthlyGoal);
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <div className="loc-modal-overlay" onClick={onClose}>
      <div className="loc-modal" onClick={e => e.stopPropagation()}>

        {/* Hero */}
        <div className="loc-modal__hero">
          <div
            className="loc-modal__avatar"
            style={{ background: location.color }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>

          <div className="loc-modal__hero-info">
            <div className="loc-modal__name">{location.name}</div>
            <div className="loc-modal__address">{location.address}</div>
            <div className="loc-modal__hero-badges">
              <span className={`loc-card__status loc-card__status--${location.status}`}>
                <span className="loc-card__status-dot" />
                {location.status === 'active' ? 'Operativa' : 'Cerrada'}
              </span>
              <span className="loc-card__rating">⭐ {stat(location.avgRating)}</span>
            </div>
          </div>

          <button className="loc-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="loc-modal__body">

          {/* Stats row */}
          <div className="loc-modal__stats">
            <div className="loc-modal__stat-box">
              <span className="loc-modal__stat-val" style={{ color: 'var(--color-orange)' }}>
                {location.totalScans.toLocaleString()}
              </span>
              <span className="loc-modal__stat-lbl">Escaneos</span>
            </div>
            <div className="loc-modal__stat-box">
              <span className="loc-modal__stat-val" style={{ color: 'var(--color-gold)' }}>
                {location.totalReviews.toLocaleString()}
              </span>
              <span className="loc-modal__stat-lbl">Reseñas (estimado)</span>
            </div>
            <div className="loc-modal__stat-box">
              <span className="loc-modal__stat-val" style={{ color: 'var(--color-forest)' }}>
                {stat(location.avgConversion, '%')}
              </span>
              <span className="loc-modal__stat-lbl">Conversión</span>
            </div>
          </div>

          {/* Goal progress */}
          <div className="loc-modal__goal-section">
            <div className="loc-modal__goal-header">
              <span className="loc-modal__goal-label">Meta mensual de reseñas (estimado)</span>
              <span className="loc-modal__goal-val">{location.totalReviews} / {location.monthlyGoal} · {progress}%</span>
            </div>
            <div className="loc-modal__goal-track">
              <div className="loc-modal__goal-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Info grid */}
          <div className="loc-modal__info-grid">
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Encargado</div>
              <div className="loc-modal__info-val">{location.manager}</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Dispositivos</div>
              <div className="loc-modal__info-val">{location.activeDevices} activos / {location.totalDevices} total</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Empleados</div>
              <div className="loc-modal__info-val">{location.totalEmployees}</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Rating promedio</div>
              <div className="loc-modal__info-val">⭐ {stat(location.avgRating)} / 5</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Abierta desde</div>
              <div className="loc-modal__info-val">{location.openSince}</div>
            </div>
            <div className="loc-modal__info-item">
              <div className="loc-modal__info-key">Última actividad</div>
              <div className="loc-modal__info-val">{location.lastActivity}</div>
            </div>
          </div>

          {/* Zones */}
          <div className="loc-modal__section-title">Zonas</div>
          <div className="loc-modal__tags-list">
            {location.zones.map(z => (
              <span key={z} className="loc-modal__zone-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
                {z}
              </span>
            ))}
          </div>

          {/* Devices */}
          <div className="loc-modal__section-title">Dispositivos asignados</div>
          <div className="loc-modal__tags-list">
            {location.devices.map(d => (
              <span key={d} className="loc-modal__device-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
                  <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
                  <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" />
                </svg>
                {d}
              </span>
            ))}
          </div>

          {/* Employees */}
          <div className="loc-modal__section-title">Equipo</div>
          <div className="loc-modal__tags-list">
            {location.employees.map(e => (
              <span key={e} className="loc-modal__employee-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                {e}
              </span>
            ))}
          </div>

          {/* Weekly charts */}
          <div className="loc-modal__charts-row">
            <div className="loc-modal__chart-block">
              <div className="loc-modal__chart-title">Escaneos — últimos 7 días</div>
              <div className="loc-modal__chart">
                {location.weeklyScans.map((v, i) => (
                  <div
                    key={i}
                    className="loc-modal__chart-bar loc-modal__chart-bar--scans"
                    style={{ height: `${(v / maxScans) * 100}%` }}
                    title={`${days[i]}: ${v} escaneos`}
                  />
                ))}
              </div>
            </div>
            <div className="loc-modal__chart-block">
              <div className="loc-modal__chart-title">Reseñas — últimos 7 días</div>
              <div className="loc-modal__chart">
                {location.weeklyReviews.map((v, i) => (
                  <div
                    key={i}
                    className="loc-modal__chart-bar loc-modal__chart-bar--reviews"
                    style={{ height: `${(v / maxReviews) * 100}%` }}
                    title={`${days[i]}: ${v} reseñas`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="loc-modal__footer">
          <button className="loc-modal__action-btn loc-modal__action-btn--primary">
            Ver historial completo
          </button>
          <button className="loc-modal__action-btn loc-modal__action-btn--secondary">
            Editar ubicación
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Card View ─────────────────────────────────────────────── */
function LocationCardGrid({ locations, onSelect }) {
  if (locations.length === 0) {
    return (
      <div className="loc-grid">
        <div className="loc-empty">
          <div className="loc-empty__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div className="loc-empty__title">Sin resultados</div>
          <div className="loc-empty__text">No hay ubicaciones que coincidan con tu búsqueda.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="loc-grid">
      {locations.map((loc, index) => {
        const maxScans = Math.max(...loc.weeklyScans, 1);
        const progress = pct(loc.totalReviews, loc.monthlyGoal);

        return (
          <div
            key={loc.id}
            className="loc-card"
            style={{ animationDelay: `${index * 0.07}s` }}
            onClick={() => onSelect(loc)}
          >
            {/* Accent stripe */}
            <div
              className="loc-card__accent"
              style={{ background: `linear-gradient(to bottom, ${loc.color}, ${loc.color}44)` }}
            />

            <div className="loc-card__body">
              {/* Top row */}
              <div className="loc-card__top">
                <div
                  className="loc-card__icon-wrap"
                  style={{ background: `${loc.color}18`, color: loc.color }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="loc-card__status-group">
                  <span className={`loc-card__status loc-card__status--${loc.status}`}>
                    <span className="loc-card__status-dot" />
                    {loc.status === 'active' ? 'Operativa' : 'Cerrada'}
                  </span>
                  <span className="loc-card__rating">⭐ {stat(loc.avgRating)}</span>
                </div>
              </div>

              {/* Name & address */}
              <div className="loc-card__name">{loc.name}</div>
              <div className="loc-card__address">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {loc.address}
              </div>

              {/* Manager */}
              <div className="loc-card__manager">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                {loc.manager}
              </div>

              {/* Goal progress */}
              <div className="loc-card__goal">
                <div className="loc-card__goal-header">
                  <span className="loc-card__goal-label">Meta mensual</span>
                  <span className="loc-card__goal-pct">{progress}%</span>
                </div>
                <div className="loc-card__goal-track">
                  <div className="loc-card__goal-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Sparkline */}
              <div className="loc-card__sparkline">
                {loc.weeklyScans.map((v, i) => (
                  <div
                    key={i}
                    className="loc-card__spark-bar"
                    style={{ height: `${(v / maxScans) * 100}%` }}
                  />
                ))}
              </div>

              {/* Resources row */}
              <div className="loc-card__resources">
                <div className="loc-card__resource">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
                  </svg>
                  <span>{loc.activeDevices}/{loc.totalDevices}</span>
                </div>
                <div className="loc-card__resource">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  </svg>
                  <span>{loc.totalEmployees}</span>
                </div>
                <div className="loc-card__resource">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  </svg>
                  <span>{loc.zones.length} zonas</span>
                </div>
              </div>

              {/* Stats */}
              <div className="loc-card__stats">
                <div className="loc-card__stat">
                  <span className="loc-card__stat-value loc-card__stat-value--orange">
                    {loc.totalScans.toLocaleString()}
                  </span>
                  <span className="loc-card__stat-label">Escaneos</span>
                </div>
                <div className="loc-card__stat">
                  <span className="loc-card__stat-value loc-card__stat-value--gold">
                    {loc.totalReviews.toLocaleString()}
                  </span>
                  <span className="loc-card__stat-label">Reseñas (est.)</span>
                </div>
                <div className="loc-card__stat">
                  <span className="loc-card__stat-value loc-card__stat-value--forest">
                    {stat(loc.avgConversion, '%')}
                  </span>
                  <span className="loc-card__stat-label">Conversión</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="loc-card__footer">
              <span className="loc-card__last-activity">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                {loc.lastActivity}
              </span>
              <button
                className="loc-card__menu-btn"
                onClick={e => { e.stopPropagation(); onSelect(loc); }}
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
function LocationTable({ locations, onSelect }) {
  return (
    <div className="loc-table-wrap">
      <table className="loc-table">
        <thead>
          <tr>
            <th>Ubicación</th>
            <th>Estado</th>
            <th>Encargado</th>
            <th>Dispositivos</th>
            <th>Escaneos</th>
            <th>Reseñas (estimado)</th>
            <th>Conversión</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {locations.map(loc => (
            <tr key={loc.id} onClick={() => onSelect(loc)}>
              <td>
                <div className="loc-table__location">
                  <div className="loc-table__icon" style={{ background: `${loc.color}18`, color: loc.color }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div>
                    <div className="loc-table__name">{loc.name}</div>
                    <div className="loc-table__address">{loc.address}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className={`loc-table__badge-status loc-table__badge-status--${loc.status}`}>
                  <span className="loc-table__badge-dot" />
                  {loc.status === 'active' ? 'Operativa' : 'Cerrada'}
                </span>
              </td>
              <td>{loc.manager}</td>
              <td>
                <span className="loc-table__devices-count">
                  {loc.activeDevices} <span className="loc-table__devices-sep">/</span> {loc.totalDevices}
                </span>
              </td>
              <td><span className="loc-table__stat--orange">{loc.totalScans.toLocaleString()}</span></td>
              <td><span className="loc-table__stat--gold">{loc.totalReviews.toLocaleString()}</span></td>
              <td><span className="loc-table__stat--forest">{stat(loc.avgConversion, '%')}</span></td>
              <td><span className="loc-table__rating-cell">⭐ {stat(loc.avgRating)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
const FILTER_TABS = [
  { id: 'all',      label: 'Todas' },
  { id: 'active',   label: 'Operativas' },
  { id: 'inactive', label: 'Cerradas' },
];

const SORT_OPTIONS = [
  { value: 'totalReviews', label: 'Por reseñas' },
  { value: 'totalScans',   label: 'Por escaneos' },
  { value: 'avgConversion',label: 'Por conversión' },
  { value: 'avgRating',    label: 'Por rating' },
];

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all');
  const [sort, setSort]         = useState('totalReviews');
  const [viewMode, setViewMode] = useState('grid');
  const [selected, setSelected] = useState(null);

  /* Carga real desde Supabase (v_location_performance, cruzada con
     v_device_performance/v_employee_leaderboard para dispositivos/equipo
     asignados y última actividad). Si falla, mock completo — un resultado
     vacío (org sin ubicaciones todavía) no es una falla. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [locationRows, deviceRows, employeeRows] = await Promise.all([
          fetchLocationPerformance(),
          fetchDevicePerformance(),
          fetchEmployeeLeaderboard(),
        ]);
        if (cancelled) return;

        const devicesByLocation = new Map();
        deviceRows.forEach(d => {
          if (!d.location_id) return;
          if (!devicesByLocation.has(d.location_id)) devicesByLocation.set(d.location_id, []);
          devicesByLocation.get(d.location_id).push(d);
        });

        const employeesByLocation = new Map();
        employeeRows.forEach(e => {
          if (!e.location_id) return;
          if (!employeesByLocation.has(e.location_id)) employeesByLocation.set(e.location_id, []);
          employeesByLocation.get(e.location_id).push(e);
        });

        setLocations(locationRows.map((row, index) =>
          mapLocationRow(row, { devicesByLocation, employeesByLocation, index })
        ));
      } catch (err) {
        console.error('No se pudieron cargar las ubicaciones reales, muestro datos de ejemplo:', err);
        if (cancelled) return;
        setLocations(ALL_LOCATIONS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Derived stats */
  const totalActive    = locations.filter(l => l.status === 'active').length;
  const totalDevices   = locations.reduce((s, l) => s + l.totalDevices, 0);
  const totalReviews   = locations.reduce((s, l) => s + l.totalReviews, 0);
  const totalScans     = locations.reduce((s, l) => s + l.totalScans, 0);

  /* Filtered + sorted list */
  const displayed = useMemo(() => {
    let list = locations.filter(l => {
      const q = search.toLowerCase();
      const matchSearch =
        l.name.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        l.manager.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q);

      const matchFilter =
        filter === 'all'      ? true :
        filter === 'active'   ? l.status === 'active' :
        filter === 'inactive' ? l.status === 'inactive' : true;

      return matchSearch && matchFilter;
    });

    list = [...list].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0));
    return list;
  }, [locations, search, filter, sort]);

  if (loading) {
    return <div className="app-loading">Cargando…</div>;
  }

  return (
    <div className="loc-page">

      {/* ── Header ── */}
      <div className="loc-page__header">
        <div className="loc-page__title-block">
          <div className="loc-page__eyebrow">
            <span className="loc-page__eyebrow-dot" />
            Gestión de sucursales
          </div>
          <h1 className="loc-page__title">Ubicaciones</h1>
          <p className="loc-page__subtitle">
            {locations.length} sucursales registradas · {totalActive} operativas · {totalDevices} dispositivos desplegados
          </p>
        </div>

        <div className="loc-page__actions">
          <button className="loc-page__btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar
          </button>
          <button className="loc-page__btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nueva Ubicación
          </button>
        </div>
      </div>

      {/* ── Stats Strip ── */}
      <div className="loc-stats">
        {[
          { key: 'total',    icon: 'map',     label: 'Total sucursales',  value: locations.length, color: 'navy' },
          { key: 'active',   icon: 'check',   label: 'Operativas',        value: totalActive,           color: 'forest' },
          { key: 'scans',    icon: 'scan',     label: 'Escaneos totales',  value: totalScans.toLocaleString(), color: 'orange' },
          { key: 'reviews',  icon: 'star',     label: 'Reseñas totales (estimado)', value: totalReviews.toLocaleString(), color: 'gold' },
        ].map((s, i) => (
          <div key={s.key} className="loc-stat-card" style={{ animationDelay: `${i * 0.07}s` }}>
            <div className={`loc-stat-icon loc-stat-icon--${s.color}`}>
              {s.icon === 'map'   && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>}
              {s.icon === 'check' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
              {s.icon === 'scan'  && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" /><path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" /><path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" /><path d="M16.37 2a20.16 20.16 0 0 1 0 20" /></svg>}
              {s.icon === 'star'  && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
            </div>
            <div className="loc-stat-body">
              <span className="loc-stat-value">{s.value}</span>
              <span className="loc-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="loc-toolbar">
        {/* Search */}
        <div className="loc-search">
          <svg className="loc-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="loc-search__input"
            type="text"
            placeholder="Buscar por nombre, dirección o encargado…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filter tabs */}
        <div className="loc-filters">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              className={`loc-filter-tab ${filter === tab.id ? 'loc-filter-tab--active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          className="loc-sort"
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="loc-view-toggle">
          <button
            className={`loc-view-btn ${viewMode === 'grid' ? 'loc-view-btn--active' : ''}`}
            onClick={() => setViewMode('grid')}
            aria-label="Vista grilla"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            className={`loc-view-btn ${viewMode === 'table' ? 'loc-view-btn--active' : ''}`}
            onClick={() => setViewMode('table')}
            aria-label="Vista tabla"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {viewMode === 'grid'
        ? <LocationCardGrid locations={displayed} onSelect={setSelected} />
        : <LocationTable    locations={displayed} onSelect={setSelected} />
      }

      {/* ── Footer ── */}
      <div className="loc-page__footer">
        <p className="loc-page__footer-text">
          © 2026 <span className="loc-page__footer-brand">
            linkstar<span className="loc-page__footer-dot">.</span>
          </span> — Panel de gestión de reseñas
        </p>
      </div>

      {/* ── Modal ── */}
      {selected && (
        <LocationModal
          location={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
