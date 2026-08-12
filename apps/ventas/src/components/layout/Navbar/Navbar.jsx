import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { ROUTES } from '../../../lib/routes';
import './Navbar.css';

// Enlaces reales (<Link>, que renderiza un <a href>) y no botones con
// onClick: son la navegación principal del sitio, así que tienen que poder
// abrirse en pestaña nueva, copiarse y rastrearse por un buscador. El estado
// activo lo resuelve NavLink contra la URL, por eso ya no hace falta el prop
// `currentPage` que venía desde App.
const NAV_LINKS = [
  { label: 'Inicio', to: ROUTES.home },
  { label: 'Tienda', to: ROUTES.shop },
  { label: 'LinkstarApp', to: ROUTES.linkstarapp },
  { label: 'Contacto', to: ROUTES.contact },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { totalItems, isOpen, setIsOpen } = useCart();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__inner container">
        {/* Logo */}
        <Link to={ROUTES.home} className="navbar__logo" onClick={closeMenu}>
          <span className="navbar__logo-text">linkstar</span>
          <span className="navbar__logo-dot"></span>
        </Link>

        {/* Navigation Links */}
        <ul className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          {NAV_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.to === ROUTES.home}
                className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
                onClick={closeMenu}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Actions */}
        <div className="navbar__actions">
          <button
            className="navbar__cart"
            aria-label="Carrito de compras"
            onClick={() => setIsOpen(!isOpen)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
            {totalItems > 0 && <span className="navbar__cart-badge">{totalItems}</span>}
          </button>

          {/* Hamburger */}
          <button
            className={`navbar__hamburger ${menuOpen ? 'navbar__hamburger--open' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menú"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {menuOpen && <div className="navbar__overlay" onClick={closeMenu} />}
    </nav>
  );
}
