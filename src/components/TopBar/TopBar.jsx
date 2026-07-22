import { useState } from 'react';
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

export default function TopBar({ activeSection, onNavigate }) {
  return (
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
          <div className="topbar__avatar">AL</div>
          <div className="topbar__user-info">
            <span className="topbar__user-name">Alejandro</span>
            <span className="topbar__user-role">Administrador</span>
          </div>
        </div>
      </div>
    </header>
  );
}
