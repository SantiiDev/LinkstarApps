import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import LandingNavbar from './LandingNavbar';
import LandingFooter from './LandingFooter';
import { LandingActionsContext } from './landingModel';
import './Landing.css';

/*
 * La landing pública: cuatro páginas (Inicio, Funciones, Multiubicaciones,
 * Planes) con el mismo navbar y el mismo pie. Las páginas viven en archivos
 * propios y se renderizan en el <Outlet>; las rutas están en App.jsx.
 *
 * `onLogin` / `onStart` / `loggedIn` los arma LandingRoute (App.jsx) y llegan a
 * cualquier botón por LandingActionsContext.
 */

/* Las anclas (/funciones#ia) en una SPA: React Router no scrollea solo al
   destino, y ScrollToTop (App.jsx) deja las URLs con # en paz. Se espera un
   frame para que la página nueva esté montada. Depende de `key` para que tocar
   dos veces el mismo ancla vuelva a llevar ahí. */
function useScrollToHash() {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return undefined;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, key]);
}

export default function Landing({ loggedIn, onLogin, onStart }) {
  useScrollToHash();

  return (
    <LandingActionsContext.Provider value={{ loggedIn, onLogin, onStart }}>
      <div className="landing-page">
        <LandingNavbar loggedIn={loggedIn} onLogin={onLogin} />
        <main>
          <Outlet />
        </main>
        <LandingFooter />
      </div>
    </LandingActionsContext.Provider>
  );
}
