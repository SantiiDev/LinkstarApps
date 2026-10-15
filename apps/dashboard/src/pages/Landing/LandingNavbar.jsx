import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import { PUBLIC_ROUTES } from '../../lib/routes';
import { FEATURE_LINKS, featurePath, useStartCta } from './landingModel';

const linkClass = ({ isActive }) => `landing-nav__link${isActive ? ' landing-nav__link--active' : ''}`;
const mobileLinkClass = ({ isActive }) => `landing-nav__mobile-link${isActive ? ' landing-nav__mobile-link--active' : ''}`;

/* Mismo comportamiento que el navbar del sitio de ventas: fondo plano arriba de
   todo y sombra + blur apenas se scrollea. */
export default function LandingNavbar({ loggedIn, onLogin }) {
  const location = useLocation();
  const cta = useStartCta();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Al cambiar de página (o de ancla) se cierra todo.
  useEffect(() => {
    setMenuOpen(false);
    setFeaturesOpen(false);
  }, [location.pathname, location.hash, location.key]);

  // El drawer es fixed y tapa la ventana: sin esto el fondo se sigue
  // scrolleando por detrás.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen && !featuresOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setFeaturesOpen(false);
      }
    };
    const onPointerDown = (e) => {
      if (featuresOpen && dropdownRef.current && !dropdownRef.current.contains(e.target)) setFeaturesOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen, featuresOpen]);

  const onFeatures = location.pathname === PUBLIC_ROUTES.features;
  const tab = menuOpen ? 0 : -1;

  return (
    <nav
      className={`landing-nav${scrolled ? ' landing-nav--scrolled' : ''}${menuOpen ? ' landing-nav--menu-open' : ''}`}
      aria-label="Principal"
    >
      <div className="landing-nav__inner">
        <Link to={PUBLIC_ROUTES.landing} className="landing-nav__logo" aria-label="linkstar, inicio">
          <span className="landing-nav__logo-text">linkstar</span>
          <span className="landing-nav__logo-dot" />
        </Link>

        <div className="landing-nav__links">
          <div
            ref={dropdownRef}
            className={`landing-nav__dropdown${featuresOpen ? ' landing-nav__dropdown--open' : ''}`}
            onMouseEnter={() => setFeaturesOpen(true)}
            onMouseLeave={() => setFeaturesOpen(false)}
          >
            <button
              type="button"
              className={`landing-nav__link landing-nav__link--menu${onFeatures ? ' landing-nav__link--active' : ''}`}
              aria-expanded={featuresOpen}
              aria-controls="landing-features-menu"
              onClick={() => setFeaturesOpen((open) => !open)}
            >
              Funciones <Icon name="chevronDown" size={14} strokeWidth={2.5} />
            </button>

            <div id="landing-features-menu" className="landing-nav__menu" hidden={!featuresOpen}>
              <div className="landing-nav__menu-grid">
                {FEATURE_LINKS.map((f) => (
                  <Link key={f.hash} to={featurePath(f.hash)} className="landing-nav__menu-item">
                    <span className="landing-nav__menu-icon"><Icon name={f.icon} size={17} /></span>
                    <span>
                      <strong>{f.title}</strong>
                      <span>{f.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
              <Link to={PUBLIC_ROUTES.features} className="landing-nav__menu-all">
                Ver todas las funciones <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </div>

          <NavLink to={PUBLIC_ROUTES.multiLocation} className={linkClass}>Multiubicaciones</NavLink>
          <NavLink to={PUBLIC_ROUTES.plans} className={linkClass}>Planes</NavLink>
        </div>

        <div className="landing-nav__actions">
          {!loggedIn && (
            <button type="button" className="landing-nav__login-btn" onClick={onLogin}>
              Iniciar sesión
            </button>
          )}
          <button type="button" className="landing-nav__cta-btn" onClick={cta.onClick}>
            {cta.label}
            <Icon name="arrowRight" size={14} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            className={`landing-nav__toggle${menuOpen ? ' landing-nav__toggle--open' : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
          >
            <span className="landing-nav__toggle-bar" />
            <span className="landing-nav__toggle-bar" />
            <span className="landing-nav__toggle-bar" />
          </button>
        </div>
      </div>

      {/* Menú mobile: las mismas páginas, con las partes de Funciones a la vista. */}
      <div id="landing-mobile-menu" className={`landing-nav__mobile${menuOpen ? ' landing-nav__mobile--open' : ''}`}>
        <NavLink to={PUBLIC_ROUTES.landing} end className={mobileLinkClass} tabIndex={tab}>Inicio</NavLink>
        <NavLink to={PUBLIC_ROUTES.features} className={mobileLinkClass} tabIndex={tab}>Funciones</NavLink>
        <div className="landing-nav__mobile-sub">
          {FEATURE_LINKS.map((f) => (
            <Link key={f.hash} to={featurePath(f.hash)} className="landing-nav__mobile-sublink" tabIndex={tab}>
              <Icon name={f.icon} size={15} /> {f.title}
            </Link>
          ))}
        </div>
        <NavLink to={PUBLIC_ROUTES.multiLocation} className={mobileLinkClass} tabIndex={tab}>Multiubicaciones</NavLink>
        <NavLink to={PUBLIC_ROUTES.plans} className={mobileLinkClass} tabIndex={tab}>Planes</NavLink>

        <div className="landing-nav__mobile-actions">
          {!loggedIn && (
            <button type="button" className="landing-nav__login-btn" onClick={onLogin} tabIndex={tab}>
              Iniciar sesión
            </button>
          )}
          <button type="button" className="landing-nav__cta-btn" onClick={cta.onClick} tabIndex={tab}>
            {cta.label}
            <Icon name="arrowRight" size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {menuOpen && <div className="landing-nav__overlay" onClick={() => setMenuOpen(false)} />}
    </nav>
  );
}
