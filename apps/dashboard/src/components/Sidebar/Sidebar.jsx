import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import Select from '../Select/Select';
import './Sidebar.css';

const LANG_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English (próximamente)', disabled: true },
];

/* ─── Icons ────────────────────────────────────────────────── */
function Icon({ name, className }) {
  const props = { className, width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const icons = {
    building: (
      <svg {...props}>
        <rect x="4" y="2" width="16" height="20" rx="1" />
        <line x1="8" y1="6" x2="8.01" y2="6" /><line x1="12" y1="6" x2="12.01" y2="6" /><line x1="16" y1="6" x2="16.01" y2="6" />
        <line x1="8" y1="10" x2="8.01" y2="10" /><line x1="12" y1="10" x2="12.01" y2="10" /><line x1="16" y1="10" x2="16.01" y2="10" />
        <line x1="8" y1="14" x2="8.01" y2="14" /><line x1="12" y1="14" x2="12.01" y2="14" /><line x1="16" y1="14" x2="16.01" y2="14" />
        <path d="M9 22v-4h6v4" />
      </svg>
    ),
    cpu: (
      <svg {...props}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
      </svg>
    ),
    star: (
      <svg {...props}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    store: (
      <svg {...props}>
        <path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
        <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M10 20v-6h4v6" />
      </svg>
    ),
    'bar-chart': (
      <svg {...props}>
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    'file-text': (
      <svg {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
    zap: (
      <svg {...props}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    settings: (
      <svg {...props}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    chevron: (
      <svg {...props} width={14} height={14}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    ),
    logout: (
      <svg {...props} width={16} height={16}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
    'chevron-down': (
      <svg {...props} width={16} height={16}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    ),
    globe: (
      <svg {...props}>
        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    user: (
      <svg {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  };
  return icons[name] || null;
}

/* ─── Nav structure ────────────────────────────────────────── */
const MAIN_ITEMS = [
  { id: 'company', label: 'Mi Empresa', icon: 'building' },
  { id: 'devices', label: 'Dispositivos', icon: 'cpu' },
  { id: 'reviews', label: 'Reseñas', icon: 'star' },
];

const GROUPS = [
  {
    id: 'google-business',
    label: 'Google Business',
    icon: 'store',
    items: [
      { id: 'gb-metrics', label: 'Métricas' },
      { id: 'gb-profile', label: 'Perfil' },
      { id: 'gb-posts', label: 'Publicaciones' },
      { id: 'gb-seo', label: 'SEO Local' },
    ],
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: 'bar-chart',
    items: [
      { id: 'reports-nps', label: 'NPS' },
      { id: 'reports-sentiment', label: 'Sentimiento' },
      { id: 'reports-keywords', label: 'Palabras Clave' },
    ],
  },
];

const TAIL_ITEMS = [
  { id: 'monthly-reports', label: 'Informes mensuales', icon: 'file-text' },
  { id: 'automations', label: 'Automatizaciones', icon: 'zap' },
  { id: 'settings', label: 'Configuración', icon: 'settings' },
];

function initialsFor(name, email) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Sidebar({ activeSection, onNavigate, onLogout, open = false, onClose }) {
  const { user } = useAuth();
  const fullName = user?.user_metadata?.full_name;
  const displayName = fullName || user?.email || 'Usuario';
  const secondaryLine = fullName ? user?.email : 'Mi cuenta';
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lang, setLang] = useState('es');
  const userMenuRef = useRef(null);
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    GROUPS.forEach((g) => {
      initial[g.id] = g.items.some((i) => i.id === activeSection);
    });
    return initial;
  });

  const toggleGroup = (id) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  function goToProfile() {
    setMenuOpen(false);
    onNavigate('profile');
  }

  function handleLogoutClick() {
    setMenuOpen(false);
    setConfirmingLogout(true);
  }

  return (
    <>
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        <div className="sidebar__logo">
          linkstar<span className="sidebar__logo-dot">.</span>
          {/* Sólo visible en móvil, donde el sidebar es un cajón superpuesto. */}
          <button className="sidebar__close" onClick={onClose} aria-label="Cerrar menú">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__group-label">Menú principal</div>

          {MAIN_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar__item ${activeSection === item.id ? 'sidebar__item--active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} className="sidebar__item-icon" />
              <span className="sidebar__item-label">{item.label}</span>
              {item.badge && <span className="sidebar__item-badge">{item.badge}</span>}
            </button>
          ))}

          {GROUPS.map((group) => {
            const isOpen = openGroups[group.id];
            const hasActiveChild = group.items.some((i) => i.id === activeSection);
            return (
              <div key={group.id} className="sidebar__group">
                <button
                  className={`sidebar__item sidebar__item--group ${hasActiveChild ? 'sidebar__item--active-parent' : ''}`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <Icon name={group.icon} className="sidebar__item-icon" />
                  <span className="sidebar__item-label">{group.label}</span>
                  <Icon name="chevron" className={`sidebar__chevron ${isOpen ? 'sidebar__chevron--open' : ''}`} />
                </button>
                <div className={`sidebar__subnav ${isOpen ? 'sidebar__subnav--open' : ''}`}>
                  <div className="sidebar__subnav-inner">
                    {group.items.map((sub) => (
                      <button
                        key={sub.id}
                        className={`sidebar__subitem ${activeSection === sub.id ? 'sidebar__subitem--active' : ''}`}
                        onClick={() => onNavigate(sub.id)}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="sidebar__divider" />

          {TAIL_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar__item ${activeSection === item.id ? 'sidebar__item--active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} className="sidebar__item-icon" />
              <span className="sidebar__item-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__user-wrap" ref={userMenuRef}>
          {menuOpen && (
            <div className="sidebar__user-menu">
              <div className="sidebar__lang-select">
                <Icon name="globe" className="sidebar__lang-icon" />
                <Select
                  value={lang}
                  onChange={setLang}
                  options={LANG_OPTIONS}
                  triggerClassName="sidebar__lang-trigger"
                />
              </div>

              <div className="sidebar__user-menu-divider" />

              <button className="sidebar__user-menu-item" onClick={goToProfile}>
                <Icon name="user" width={16} height={16} />
                Mi Perfil
              </button>
              <button className="sidebar__user-menu-item sidebar__user-menu-item--danger" onClick={handleLogoutClick}>
                <Icon name="logout" width={16} height={16} />
                Cerrar Sesión
              </button>
            </div>
          )}

          <button className="sidebar__user" onClick={() => setMenuOpen((prev) => !prev)}>
            <div className="sidebar__avatar">{initialsFor(fullName, user?.email)}</div>
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{displayName}</span>
              <span className="sidebar__user-role">{secondaryLine}</span>
            </div>
            <Icon name="chevron-down" className={`sidebar__user-chevron ${menuOpen ? 'sidebar__user-chevron--open' : ''}`} />
          </button>
        </div>
      </aside>

      {confirmingLogout && createPortal(
        <div className="sidebar-confirm-overlay" onClick={() => setConfirmingLogout(false)}>
          <div className="sidebar-confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="sidebar-confirm__title">¿Cerrar sesión?</h3>
            <p className="sidebar-confirm__text">
              Vas a salir de tu cuenta y necesitarás volver a iniciar sesión para acceder al panel.
            </p>
            <div className="sidebar-confirm__actions">
              <button
                className="sidebar-confirm__btn sidebar-confirm__btn--cancel"
                onClick={() => setConfirmingLogout(false)}
              >
                Cancelar
              </button>
              <button
                className="sidebar-confirm__btn sidebar-confirm__btn--danger"
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
