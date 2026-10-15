import { Link } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import { PUBLIC_ROUTES } from '../../lib/routes';
import { SALES_CONTACT_URL } from '../../lib/config';

const SUPPORT_EMAIL = 'linkstar.app1@gmail.com';
const SHOP_URL = 'https://linkstarapp.com/tienda';

/* El pie de las cuatro páginas. La política de privacidad TIENE que estar
   enlazada desde la página de inicio: Google la busca ahí para verificar la app
   OAuth (GOOGLE_VERIFICATION.md). Los términos son los del sitio de ventas, que
   cubren el servicio entero. */
export default function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container landing-footer__grid">
        <div className="landing-footer__brand">
          <Link to={PUBLIC_ROUTES.landing} className="landing-footer__logo">
            linkstar<span>.</span>
          </Link>
          <p>Expositores NFC y QR y un panel para conseguir, responder y entender tus reseñas de Google.</p>
          <div className="landing-footer__social">
            <a href={SALES_CONTACT_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Linkstar">
              <Icon name="instagram" size={18} />
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} aria-label={`Escribinos a ${SUPPORT_EMAIL}`}>
              <Icon name="mail" size={18} />
            </a>
          </div>
        </div>

        <nav className="landing-footer__col" aria-label="Producto">
          <h4>Producto</h4>
          <Link to={PUBLIC_ROUTES.features}>Funciones</Link>
          <Link to={PUBLIC_ROUTES.multiLocation}>Multiubicaciones</Link>
          <Link to={PUBLIC_ROUTES.plans}>Planes</Link>
          <a href={SHOP_URL}>Comprar expositores</a>
        </nav>

        <nav className="landing-footer__col" aria-label="Ayuda">
          <h4>Ayuda</h4>
          <Link to={`${PUBLIC_ROUTES.plans}#contacto`}>Contacto</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <Link to={PUBLIC_ROUTES.login}>Iniciar sesión</Link>
        </nav>

        <nav className="landing-footer__col" aria-label="Legales">
          <h4>Legales</h4>
          <Link to={PUBLIC_ROUTES.privacy}>Política de privacidad</Link>
          <a href="https://linkstarapp.com/terminos">Términos y condiciones</a>
        </nav>
      </div>

      <div className="landing-container landing-footer__bottom">
        © {new Date().getFullYear()} linkstar — Panel de gestión de reseñas con NFC inteligente
      </div>
    </footer>
  );
}
