import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import './Footer.css';

// Antes eran anclas `#tienda` con un onClick que interceptaba el click y
// llamaba al callback correspondiente: el href no llevaba a ningún lado y el
// footer, que es donde viven los enlaces legales, no era rastreable. Ahora
// cada entrada es una ruta real.
const footerLinks = {
  Productos: [
    { label: 'Carteles NFC', to: ROUTES.shop },
    { label: 'LinkstarApp', to: ROUTES.linkstarapp },
  ],
  Empresa: [
    { label: 'Sobre nosotros', to: ROUTES.about },
  ],
  Soporte: [
    { label: 'Contacto', to: ROUTES.contact },
    { label: 'Garantía', to: ROUTES.warranty },
  ],
  Legal: [
    { label: 'Aviso legal', to: ROUTES.legal },
    { label: 'Política de privacidad', to: ROUTES.privacy },
    { label: 'Términos y condiciones', to: ROUTES.terms },
  ],
};

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner container">
        {/* Top section */}
        <div className="footer__top">
          <div className="footer__brand">
            <Link to={ROUTES.home} className="footer__logo">
              <span className="footer__logo-text">linkstar</span>
              <span className="footer__logo-dot"></span>
            </Link>
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
                  {links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className="footer__link">
                        {link.label}
                      </Link>
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
