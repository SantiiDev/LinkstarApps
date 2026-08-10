import { useState, useEffect } from 'react';
import { useCart } from '../../../context/CartContext';
import './Navbar.css';

export default function Navbar({ onShop, onHome, onContact, onLinkstarApp, currentPage }) {
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

  const handleHome = (e) => {
    e.preventDefault();
    setMenuOpen(false);
    onHome();
  };

  const handleShop = (e) => {
    e.preventDefault();
    setMenuOpen(false);
    onShop();
  };

  const handleContact = (e) => {
    e.preventDefault();
    setMenuOpen(false);
    onContact();
  };

  const handleLinkstarApp = (e) => {
    e.preventDefault();
    setMenuOpen(false);
    onLinkstarApp();
  };

  const navLinks = [
    { label: 'Inicio', action: handleHome, isActive: currentPage === 'home', anchor: null },
    { label: 'Tienda', action: handleShop, isActive: currentPage === 'shop', anchor: null },
    { label: 'LinkstarApp', action: handleLinkstarApp, isActive: currentPage === 'linkstarapp', anchor: null },
    { label: 'Contacto', action: handleContact, isActive: currentPage === 'contact', anchor: null },
  ];

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__inner container">
        {/* Logo */}
        <a href="/" className="navbar__logo" onClick={handleHome}>
          <span className="navbar__logo-text">linkstar</span>
          <span className="navbar__logo-dot"></span>
        </a>

        {/* Navigation Links */}
        <ul className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          {navLinks.map((link) => (
            <li key={link.label}>
              <a
                href={link.anchor || '#'}
                className={`navbar__link ${link.isActive ? 'navbar__link--active' : ''}`}
                onClick={(e) => { e.preventDefault(); link.action(e); }}
              >
                {link.label}
              </a>
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
      {menuOpen && <div className="navbar__overlay" onClick={() => setMenuOpen(false)} />}
    </nav>
  );
}
