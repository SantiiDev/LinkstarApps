import './GoogleConnectBanner.css';

const BENEFITS = [
  'Responder con IA usando tu propio tono de marca.',
  'Consultar cuántos clientes te llegan desde Google Maps.',
  'Revisar las publicaciones de tu ficha.',
  'Descubrir tu puntuación de SEO local y qué mejorar.',
];

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C39.9 37.1 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

export default function GoogleConnectBanner() {
  return (
    <div className="gcb">
      <div className="gcb__left">
        <h2 className="gcb__title">Gestioná todo tu perfil de Google Business.</h2>
        <p className="gcb__lead">Una vez conectes tu cuenta vas a poder:</p>
        <ul className="gcb__list">
          {BENEFITS.map((b) => (
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

        <button className="gcb__connect-btn">
          <GoogleIcon /> Conectar mi ficha de Google
        </button>
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
