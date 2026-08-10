import './Footer.css';

const footerLinks = {
  Productos: [
    { label: 'Carteles NFC', href: '#tienda' },
    { label: 'LinkstarApp', href: '#linkstarapp' },
  ],
  Empresa: [
    { label: 'Sobre nosotros', href: '#sobre-nosotros', page: 'about' },
  ],
  Soporte: [
    { label: 'Contacto', href: '#contacto' },
    { label: 'Garantía', href: '#garantia', page: 'warranty' },
  ],
  Legal: [
    { label: 'Aviso legal', href: '#aviso-legal', page: 'legal' },
    { label: 'Política de privacidad', href: '#privacidad', page: 'privacy' },
    { label: 'Términos y condiciones', href: '#terminos', page: 'terms' },
  ],
};

export default function Footer({ onContact, onShop, onLinkstarApp, onNavigate }) {
  return (
    <footer className="footer">
      <div className="footer__inner container">
        {/* Top section */}
        <div className="footer__top">
          <div className="footer__brand">
            <a href="#inicio" className="footer__logo">
              <span className="footer__logo-text">linkstar</span>
              <span className="footer__logo-dot"></span>
            </a>
            <p className="footer__tagline">
              Conecta tu marca con el mundo digital a través de
              carteles expositores inteligentes con tecnología NFC.
            </p>

            {/* Social */}
            <div className="footer__social">
              {/* Instagram */}
              <a href="https://www.instagram.com/santisiena?igsh=MWwyeW5lYmlsNWRtNQ==" target="_blank" rel="noopener noreferrer" className="footer__social-link" aria-label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            </div>
          </div>

          {/* Link Columns */}
          <div className="footer__columns">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div className="footer__column" key={category}>
                <h4 className="footer__column-title">{category}</h4>
                <ul className="footer__column-links">
                  {links.map((link, index) => (
                    <li key={index}>
                      <a
                        href={link.href}
                        className="footer__link"
                        onClick={(e) => {
                          if (link.href === '#contacto' && onContact) {
                            e.preventDefault();
                            onContact();
                          } else if (link.href === '#tienda' && onShop) {
                            e.preventDefault();
                            onShop();
                          } else if (link.href === '#linkstarapp' && onLinkstarApp) {
                            e.preventDefault();
                            onLinkstarApp();
                          } else if (link.page && onNavigate) {
                            e.preventDefault();
                            onNavigate(link.page);
                          }
                        }}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="footer__divider"></div>

        {/* Bottom */}
        <div className="footer__bottom">
          <p className="footer__copyright">
            © {new Date().getFullYear()} Linkstar. Todos los derechos reservados.
          </p>
          <p className="footer__made">
            Hecho con <span className="footer__heart">♥</span> en Argentina
          </p>
        </div>
      </div>
    </footer>
  );
}
