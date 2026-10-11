import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import SubscriptionBanner from './SubscriptionBanner';
import { useAuth } from '../../context/AuthContext';
import { GOOGLE_GATED_SECTIONS, PUBLIC_ROUTES, pathForSection, sectionFromPath } from '../../lib/routes';
import './AppShell.css';

export default function AppShell() {
  // En móvil el sidebar es un cajón que se abre por encima del contenido;
  // de 641px para arriba está siempre visible y este estado no se usa.
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // La sección activa sale de la URL, no de un estado propio: así el ítem
  // marcado en el sidebar sigue siendo correcto si se llega por un enlace
  // directo o con el botón atrás del navegador.
  const activeSection = sectionFromPath(location.pathname);

  const closeNav = useCallback(() => setNavOpen(false), []);

  // Navegar cierra el cajón: si no, la sección nueva queda tapada detrás.
  const handleNavigate = useCallback(
    (section) => {
      setNavOpen(false);
      navigate(pathForSection(section));
    },
    [navigate],
  );

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate(PUBLIC_ROUTES.landing, { replace: true });
  }, [signOut, navigate]);

  // Que cada sección arranque desde arriba lo hace ScrollToTop en App.jsx, para
  // todas las rutas (también las públicas, que no pasan por acá).

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
        onLogout={handleLogout}
        open={navOpen}
        onClose={closeNav}
      />

      {navOpen && <div className="app-shell__nav-overlay" onClick={closeNav} />}

      <div className="app-shell__main">
        {/* Sólo existe en móvil, donde el sidebar es un cajón y hace falta un
            botón para abrirlo. De 641px para arriba no se muestra: el
            «¿Necesitás ayuda? Escribinos» y la campana que tenía se sacaron
            (Contacto sigue en el sidebar, y la campana nunca hizo nada). Su
            alto es --app-topbar-h (index.css). */}
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
          <span className="app-shell__brand">linkstar<span className="app-shell__brand-dot">.</span></span>
        </div>

        {/* Va arriba del contenido y dentro del scroll de la página: es un
            aviso, no una barra fija que le coma alto a todas las secciones.
            En las que están bloqueadas por el modal de Google no se muestra:
            ahí quedaría detrás del modal, desenfocado y sin poder tocarse. */}
        {!GOOGLE_GATED_SECTIONS.has(activeSection) && <SubscriptionBanner />}

        {/* Cada sección de /panel se renderiza acá dentro. */}
        <main className="app-shell__content"><Outlet /></main>
      </div>
    </div>
  );
}
