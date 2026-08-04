import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import './TopBar.css';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'devices', label: 'Dispositivos', icon: 'cpu' },
  { id: 'employees', label: 'Empleados', icon: 'users' },
  { id: 'locations', label: 'Ubicaciones', icon: 'map-pin' },
];

function NavIcon({ name, className }) {
  const icons = {
    grid: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    cpu: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
      </svg>
    ),
    users: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    'map-pin': (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  };
  return icons[name] || null;
}

function initialsFor(name, email) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function TopBar({ activeSection, onNavigate, onLogout }) {
  const { user } = useAuth();
  const fullName = user?.user_metadata?.full_name;
  const displayName = fullName || user?.email || 'Usuario';
  const secondaryLine = fullName ? user?.email : 'Mi cuenta';
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  return (
    <>
    <header className="topbar">
      <div className="topbar__logo">
        linkstar<span className="topbar__logo-dot">.</span>
      </div>

      <nav className="topbar__nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`topbar__nav-item ${activeSection === item.id ? 'topbar__nav-item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <NavIcon name={item.icon} className="topbar__nav-icon" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="topbar__right">
        <button className="topbar__notification-btn" aria-label="Notificaciones">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="topbar__notification-dot"></span>
        </button>

        <div className="topbar__user">
          <div className="topbar__avatar">{initialsFor(fullName, user?.email)}</div>
          <div className="topbar__user-info">
            <span className="topbar__user-name">{displayName}</span>
            <span className="topbar__user-role">{secondaryLine}</span>
          </div>
        </div>

        <button
          className="topbar__logout-btn"
          onClick={() => setConfirmingLogout(true)}
          aria-label="Cerrar sesión"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>

    {confirmingLogout && createPortal(
      <div className="topbar-confirm-overlay" onClick={() => setConfirmingLogout(false)}>
        <div className="topbar-confirm" onClick={(e) => e.stopPropagation()}>
          <h3 className="topbar-confirm__title">¿Cerrar sesión?</h3>
          <p className="topbar-confirm__text">
            Vas a salir de tu cuenta y necesitarás volver a iniciar sesión para acceder al panel.
          </p>
          <div className="topbar-confirm__actions">
            <button
              className="topbar-confirm__btn topbar-confirm__btn--cancel"
              onClick={() => setConfirmingLogout(false)}
            >
              Cancelar
            </button>
            <button
              className="topbar-confirm__btn topbar-confirm__btn--danger"
              onClick={onLogout}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
