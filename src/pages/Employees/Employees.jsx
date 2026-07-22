import { useState, useMemo } from 'react';
import { ALL_EMPLOYEES } from '../../data/employees';
import './Employees.css';

/* ─── Helpers ──────────────────────────────────────────────── */
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function pct(reviews, goal) {
  return Math.min(Math.round((reviews / goal) * 100), 100);
}

function rankClass(rank) {
  if (rank === 1) return '1';
  if (rank === 2) return '2';
  if (rank === 3) return '3';
  return 'other';
}

/* ─── Employee Detail Modal ─────────────────────────────────── */
function EmployeeModal({ employee, rank, onClose }) {
  if (!employee) return null;
  const max = Math.max(...employee.weeklyReviews, 1);
  const progress = pct(employee.reviews, employee.goal);

  return (
    <div className="emp-modal-overlay" onClick={onClose}>
      <div className="emp-modal" onClick={e => e.stopPropagation()}>

        {/* Hero */}
        <div className="emp-modal__hero">
          <div
            className="emp-modal__avatar"
            style={{ background: employee.color }}
          >
            {employee.initials}
          </div>

          <div className="emp-modal__hero-info">
            <div className="emp-modal__name">{employee.name}</div>
            <div className="emp-modal__role">{employee.role} · {employee.location}</div>
            <div className="emp-modal__hero-badges">
              <span className={`emp-card__status emp-card__status--${employee.status}`}>
                <span className="emp-card__status-dot" />
                {employee.status === 'active' ? 'Activo' : 'Inactivo'}
              </span>
              {employee.streak > 0 && (
                <span className="emp-card__streak">🔥 {employee.streak} días</span>
              )}
            </div>
          </div>

          <button className="emp-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="emp-modal__body">

          {/* Stats row */}
          <div className="emp-modal__stats">
            <div className="emp-modal__stat-box">
              <span className="emp-modal__stat-val" style={{ color: 'var(--color-gold)' }}>
                {employee.reviews}
              </span>
              <span className="emp-modal__stat-lbl">Reseñas</span>
            </div>
            <div className="emp-modal__stat-box">
              <span className="emp-modal__stat-val" style={{ color: 'var(--color-orange)' }}>
                {employee.scans}
              </span>
              <span className="emp-modal__stat-lbl">Escaneos</span>
            </div>
            <div className="emp-modal__stat-box">
              <span className="emp-modal__stat-val" style={{ color: 'var(--color-forest)' }}>
                {employee.conversion}%
              </span>
              <span className="emp-modal__stat-lbl">Conversión</span>
            </div>
          </div>

          {/* Goal progress */}
          <div className="emp-modal__goal-section">
            <div className="emp-modal__goal-header">
              <span className="emp-modal__goal-label">Progreso hacia meta</span>
              <span className="emp-modal__goal-val">{employee.reviews} / {employee.goal} reseñas · {progress}%</span>
            </div>
            <div className="emp-modal__goal-track">
              <div className="emp-modal__goal-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Info grid */}
          <div className="emp-modal__info-grid">
            <div className="emp-modal__info-item">
              <div className="emp-modal__info-key">Sucursal</div>
              <div className="emp-modal__info-val">{employee.location}</div>
            </div>
            <div className="emp-modal__info-item">
              <div className="emp-modal__info-key">Posición en ranking</div>
              <div className="emp-modal__info-val">#{rank} de {ALL_EMPLOYEES.length}</div>
            </div>
            <div className="emp-modal__info-item">
              <div className="emp-modal__info-key">Racha activa</div>
              <div className="emp-modal__info-val">
                {employee.streak > 0 ? `🔥 ${employee.streak} días consecutivos` : 'Sin racha activa'}
              </div>
            </div>
            <div className="emp-modal__info-item">
              <div className="emp-modal__info-key">Desde</div>
              <div className="emp-modal__info-val">{employee.joinDate}</div>
            </div>
            <div className="emp-modal__info-item">
              <div className="emp-modal__info-key">Última actividad</div>
              <div className="emp-modal__info-val">{employee.lastActivity}</div>
            </div>
            <div className="emp-modal__info-item">
              <div className="emp-modal__info-key">Meta mensual</div>
              <div className="emp-modal__info-val">{employee.goal} reseñas</div>
            </div>
          </div>

          {/* Devices */}
          <div className="emp-modal__devices-title">Dispositivos asignados</div>
          <div className="emp-modal__devices-list">
            {employee.devices.length > 0
              ? employee.devices.map(d => (
                  <span key={d} className="emp-modal__device-tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
                      <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
                      <path d="M12.91 4.1a16.1 16.1 0 0 1 0 15.8" />
                    </svg>
                    {d}
                  </span>
                ))
              : <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Sin dispositivos asignados</span>
            }
          </div>

          {/* Weekly chart */}
          <div className="emp-modal__chart-title">Reseñas — últimos 7 días</div>
          <div className="emp-modal__chart">
            {employee.weeklyReviews.map((v, i) => (
              <div
                key={i}
                className="emp-modal__chart-bar"
                style={{ height: `${(v / max) * 100}%` }}
                title={`${DAYS[i]}: ${v} reseñas`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="emp-modal__footer">
          <button className="emp-modal__action-btn emp-modal__action-btn--primary">
            Ver historial completo
          </button>
          <button className="emp-modal__action-btn emp-modal__action-btn--secondary">
            Editar perfil
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Card View ─────────────────────────────────────────────── */
function EmployeeCardGrid({ employees, rankedIds, onSelect }) {
  if (employees.length === 0) {
    return (
      <div className="emp-grid">
        <div className="emp-empty">
          <div className="emp-empty__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div className="emp-empty__title">Sin resultados</div>
          <div className="emp-empty__text">No hay empleados que coincidan con tu búsqueda.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="emp-grid">
      {employees.map((emp, index) => {
        const rank = rankedIds.indexOf(emp.id) + 1;
        const progress = pct(emp.reviews, emp.goal);
        const max = Math.max(...emp.weeklyReviews, 1);
        const rc = rankClass(rank);

        return (
          <div
            key={emp.id}
            className="emp-card"
            style={{ animationDelay: `${index * 0.07}s` }}
            onClick={() => onSelect(emp)}
          >
            {/* Colored rank stripe */}
            <div
              className="emp-card__rank-stripe"
              style={{
                background: rank === 1
                  ? 'linear-gradient(to bottom, #F59E0B, #F97316)'
                  : rank === 2
                  ? 'linear-gradient(to bottom, #94a3b8, #64748b)'
                  : rank === 3
                  ? 'linear-gradient(to bottom, #d97706, #b45309)'
                  : `linear-gradient(to bottom, ${emp.color}55, ${emp.color}22)`,
              }}
            />

            <div className="emp-card__body">
              {/* Top row: avatar + status */}
              <div className="emp-card__top">
                <div className="emp-card__avatar-wrap">
                  <div
                    className="emp-card__avatar"
                    style={{ background: emp.color }}
                  >
                    {emp.initials}
                  </div>
                  <div className={`emp-card__rank-badge emp-card__rank-badge--${rc}`}>
                    {rank}
                  </div>
                </div>

                <div className="emp-card__status-group">
                  <span className={`emp-card__status emp-card__status--${emp.status}`}>
                    <span className="emp-card__status-dot" />
                    {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                  {emp.streak > 0 && (
                    <span className="emp-card__streak">🔥 {emp.streak} días</span>
                  )}
                </div>
              </div>

              {/* Name + role */}
              <div className="emp-card__name">{emp.name}</div>
              <div className="emp-card__role">{emp.role}</div>
              <div className="emp-card__location">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {emp.location}
              </div>

              {/* Goal progress */}
              <div className="emp-card__goal">
                <div className="emp-card__goal-header">
                  <span className="emp-card__goal-label">Meta mensual</span>
                  <span className="emp-card__goal-pct">{progress}%</span>
                </div>
                <div className="emp-card__goal-track">
                  <div className="emp-card__goal-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Sparkline */}
              <div className="emp-card__sparkline">
                {emp.weeklyReviews.map((v, i) => (
                  <div
                    key={i}
                    className={`emp-card__spark-bar ${emp.status === 'inactive' ? 'emp-card__spark-bar--inactive' : ''}`}
                    style={{ height: `${(v / max) * 100}%` }}
                  />
                ))}
              </div>

              {/* Stats */}
              <div className="emp-card__stats">
                <div className="emp-card__stat">
                  <span className="emp-card__stat-value emp-card__stat-value--gold">{emp.reviews}</span>
                  <span className="emp-card__stat-label">Reseñas</span>
                </div>
                <div className="emp-card__stat">
                  <span className="emp-card__stat-value emp-card__stat-value--orange">{emp.scans}</span>
                  <span className="emp-card__stat-label">Escaneos</span>
                </div>
                <div className="emp-card__stat">
                  <span className="emp-card__stat-value emp-card__stat-value--forest">{emp.conversion}%</span>
                  <span className="emp-card__stat-label">Conversión</span>
                </div>
              </div>
            </div>

            {/* Badges footer */}
            <div className="emp-card__badges">
              {emp.badges.length > 0
                ? emp.badges.map(b => (
                    <span key={b} className="emp-card__badge-pill">{b}</span>
                  ))
                : <span className="emp-card__no-badges">Sin insignias aún</span>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Table View ────────────────────────────────────────────── */
function EmployeeTable({ employees, rankedIds, onSelect }) {
  return (
    <div className="emp-table-wrap">
      <table className="emp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Empleado</th>
            <th>Sucursal</th>
            <th>Estado</th>
            <th>Reseñas</th>
            <th>Escaneos</th>
            <th>Conversión</th>
            <th>Meta</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => {
            const rank = rankedIds.indexOf(emp.id) + 1;
            const progress = pct(emp.reviews, emp.goal);
            const rc = rankClass(rank);
            return (
              <tr key={emp.id} onClick={() => onSelect(emp)}>
                <td>
                  <div className={`emp-table__rank emp-table__rank--${rc}`}>{rank}</div>
                </td>
                <td>
                  <div className="emp-table__employee">
                    <div className="emp-table__avatar" style={{ background: emp.color }}>
                      {emp.initials}
                    </div>
                    <div>
                      <div className="emp-table__name">{emp.name}</div>
                      <div className="emp-table__role">{emp.role}</div>
                    </div>
                  </div>
                </td>
                <td>{emp.location}</td>
                <td>
                  <span className={`emp-table__badge-status emp-table__badge-status--${emp.status}`}>
                    <span className="emp-table__badge-dot" />
                    {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td><span className="emp-table__stat--gold">{emp.reviews}</span></td>
                <td><span className="emp-table__stat--orange">{emp.scans}</span></td>
                <td><span className="emp-table__stat--forest">{emp.conversion}%</span></td>
                <td>
                  <div className="emp-table__progress">
                    <div className="emp-table__progress-track">
                      <div className="emp-table__progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="emp-table__progress-pct">{progress}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
const FILTER_TABS = [
  { id: 'all',      label: 'Todos' },
  { id: 'active',   label: 'Activos' },
  { id: 'inactive', label: 'Inactivos' },
  { id: 'centro',   label: 'Centro' },
  { id: 'norte',    label: 'Norte' },
  { id: 'sur',      label: 'Sur' },
];

const SORT_OPTIONS = [
  { value: 'reviews',    label: 'Por reseñas' },
  { value: 'scans',      label: 'Por escaneos' },
  { value: 'conversion', label: 'Por conversión' },
  { value: 'streak',     label: 'Por racha' },
];

export default function EmployeesPage() {
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all');
  const [sort,     setSort]     = useState('reviews');
  const [viewMode, setViewMode] = useState('grid');
  const [selected, setSelected] = useState(null);

  /* Rank order is always by reviews (for ranking badge) */
  const rankedIds = useMemo(() =>
    [...ALL_EMPLOYEES].sort((a, b) => b.reviews - a.reviews).map(e => e.id),
  []);

  /* Derived stats */
  const totalActive   = ALL_EMPLOYEES.filter(e => e.status === 'active').length;
  const totalReviews  = ALL_EMPLOYEES.reduce((s, e) => s + e.reviews, 0);
  const avgConversion = (ALL_EMPLOYEES.reduce((s, e) => s + e.conversion, 0) / ALL_EMPLOYEES.length).toFixed(1);

  /* Filtered + sorted list */
  const displayed = useMemo(() => {
    let list = ALL_EMPLOYEES.filter(e => {
      const q = search.toLowerCase();
      const matchSearch =
        e.name.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q);

      const matchFilter =
        filter === 'all'      ? true :
        filter === 'active'   ? e.status === 'active' :
        filter === 'inactive' ? e.status === 'inactive' :
        filter === 'centro'   ? e.location.includes('Centro') :
        filter === 'norte'    ? e.location.includes('Norte') :
        filter === 'sur'      ? e.location.includes('Sur') : true;

      return matchSearch && matchFilter;
    });

    list = [...list].sort((a, b) => b[sort] - a[sort]);
    return list;
  }, [search, filter, sort]);

  const selectedRank = selected ? rankedIds.indexOf(selected.id) + 1 : 1;

  return (
    <div className="emp-page">

      {/* ── Header ── */}
      <div className="emp-page__header">
        <div className="emp-page__title-block">
          <div className="emp-page__eyebrow">
            <span className="emp-page__eyebrow-dot" />
            Gestión de equipo
          </div>
          <h1 className="emp-page__title">Empleados & Rendimiento</h1>
          <p className="emp-page__subtitle">
            {ALL_EMPLOYEES.length} empleados registrados · {totalActive} activos · {totalReviews} reseñas este mes
          </p>
        </div>

        <div className="emp-page__actions">
          <button className="emp-page__btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar
          </button>
          <button className="emp-page__btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo Empleado
          </button>
        </div>
      </div>

      {/* ── Stats Strip ── */}
      <div className="emp-stats">
        {[
          { key: 'total',  icon: 'users',  label: 'Total empleados',   value: ALL_EMPLOYEES.length, color: 'navy' },
          { key: 'active', icon: 'check',  label: 'Activos este mes',  value: totalActive,           color: 'forest' },
          { key: 'reviews',icon: 'star',   label: 'Reseñas totales',   value: totalReviews,          color: 'gold' },
          { key: 'avg',    icon: 'percent',label: 'Conversión media',  value: `${avgConversion}%`,   color: 'orange' },
        ].map((s, i) => (
          <div key={s.key} className="emp-stat-card" style={{ animationDelay: `${i * 0.07}s` }}>
            <div className={`emp-stat-icon emp-stat-icon--${s.color}`}>
              {s.icon === 'users'   && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
              {s.icon === 'check'   && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
              {s.icon === 'star'    && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
              {s.icon === 'percent' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>}
            </div>
            <div className="emp-stat-body">
              <span className="emp-stat-value">{s.value}</span>
              <span className="emp-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="emp-toolbar">
        {/* Search */}
        <div className="emp-search">
          <svg className="emp-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="emp-search__input"
            type="text"
            placeholder="Buscar por nombre, rol o sucursal…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filter tabs */}
        <div className="emp-filters">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              className={`emp-filter-tab ${filter === tab.id ? 'emp-filter-tab--active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          className="emp-sort"
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="emp-view-toggle">
          <button
            className={`emp-view-btn ${viewMode === 'grid' ? 'emp-view-btn--active' : ''}`}
            onClick={() => setViewMode('grid')}
            aria-label="Vista grilla"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <button
            className={`emp-view-btn ${viewMode === 'table' ? 'emp-view-btn--active' : ''}`}
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
        ? <EmployeeCardGrid employees={displayed} rankedIds={rankedIds} onSelect={setSelected} />
        : <EmployeeTable    employees={displayed} rankedIds={rankedIds} onSelect={setSelected} />
      }

      {/* ── Footer ── */}
      <div className="emp-page__footer">
        <p className="emp-page__footer-text">
          © 2026 <span className="emp-page__footer-brand">
            linkstar<span className="emp-page__footer-dot">.</span>
          </span> — Panel de gestión de reseñas
        </p>
      </div>

      {/* ── Modal ── */}
      {selected && (
        <EmployeeModal
          employee={selected}
          rank={selectedRank}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
