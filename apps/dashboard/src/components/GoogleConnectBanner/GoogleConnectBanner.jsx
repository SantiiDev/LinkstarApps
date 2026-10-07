import { useOrg } from '../../context/OrgContext';
import { useGoogleConnection } from '../../lib/googleApi';
import { GOOGLE_BENEFITS } from '../../lib/googleBenefits';
import GoogleConnect from '../GoogleConnect/GoogleConnect';
import './GoogleConnectBanner.css';

/* Invitación a conectar Google arriba de Dispositivos. Es una invitación y nada
 * más: una vez conectada la ficha desaparece (el estado y "Desconectar" viven
 * en el modal de las secciones de Google). En needs_reauth vuelve a aparecer,
 * con el botón de reconectar. */

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function GoogleConnectBanner() {
  const { org } = useOrg();
  const google = useGoogleConnection(org?.organization_id);

  // Mientras carga no se muestra: aparecer y desaparecer al segundo, en una
  // cuenta ya conectada, es peor que tardar un instante en aparecer.
  if (google.loading || google.connection?.status === 'active') return null;

  return (
    <div className="gcb">
      <div className="gcb__left">
        <h2 className="gcb__title">Gestioná todo tu perfil de Google Business.</h2>
        <p className="gcb__lead">Una vez conectes tu cuenta vas a poder:</p>
        <ul className="gcb__list">
          {GOOGLE_BENEFITS.map((b) => (
            <li key={b}>
              <span className="gcb__check"><CheckIcon /></span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div className="gcb__right">
        <div className="gcb__preview">
          {[0, 1].map((i) => (
            <div key={i} className="gcb__preview-row">
              <span className="gcb__preview-avatar" />
              <div className="gcb__preview-lines">
                <span className="gcb__preview-stars" />
                <span className="gcb__preview-bar" />
              </div>
            </div>
          ))}
          <span className="gcb__preview-caption">Tus reseñas aparecerán acá</span>
        </div>

        <GoogleConnect google={google} buttonClassName="gcb__connect-btn" />
        <span className="gcb__hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Se hace en menos de 1 minuto
        </span>
      </div>
    </div>
  );
}
