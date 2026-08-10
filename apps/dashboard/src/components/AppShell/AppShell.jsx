import Sidebar from '../Sidebar/Sidebar';
import './AppShell.css';

export default function AppShell({ activeSection, onNavigate, onLogout, children }) {
  return (
    <div className="app-shell">
      <Sidebar activeSection={activeSection} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="app-shell__main">
        <div className="app-shell__topbar">
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
