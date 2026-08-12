import { useCallback, useEffect, useState } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import './AppShell.css';

export default function AppShell({ activeSection, onNavigate, onLogout, children }) {
  // En móvil el sidebar es un cajón que se abre por encima del contenido;
  // de 641px para arriba está siempre visible y este estado no se usa.
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = useCallback(() => setNavOpen(false), []);

  // Navegar cierra el cajón: si no, la sección nueva queda tapada detrás.
  const handleNavigate = useCallback(
    (section) => {
      setNavOpen(false);
      onNavigate(section);
    },
    [onNavigate],
  );

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    // Bloquea el scroll del fondo mientras el cajón está abierto.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  return (
    <div className="app-shell">
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onLogout={onLogout}
        open={navOpen}
        onClose={closeNav}
      />

      {navOpen && <div className="app-shell__nav-overlay" onClick={closeNav} />}

      <div className="app-shell__main">
        <div className="app-shell__topbar">
          <button
            className="app-shell__nav-toggle"
            onClick={() => setNavOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={navOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <a className="app-shell__contact" href="mailto:soporte@linkstar.com.ar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            ¿Necesitás ayuda? Contáctanos — +54 11 4567-8901
          </a>

          <div className="app-shell__topbar-right">
            <button className="app-shell__icon-btn" aria-label="Notificaciones">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="app-shell__icon-dot" />
            </button>
          </div>
        </div>

        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
