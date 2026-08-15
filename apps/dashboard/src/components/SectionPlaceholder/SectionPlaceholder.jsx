import './SectionPlaceholder.css';

/*
 * Estado de una sección que todavía no tiene de dónde sacar sus datos.
 *
 * Reemplaza a los arrays escritos a mano que estas pantallas venían mostrando.
 * La regla es simple: preferimos una pantalla que diga "esto todavía no está"
 * antes que una que muestre un número inventado, porque el número inventado no
 * se distingue de uno real hasta que alguien toma una decisión con él.
 *
 * Dos variantes, y la diferencia importa porque la salida del usuario es
 * distinta en cada una:
 *
 *   google  Falta conectar la ficha de Google Business. Es algo que el cliente
 *           PUEDE hacer, así que lleva botón.
 *   soon    La función todavía no existe de nuestro lado (NPS, informes,
 *           automatizaciones). No hay nada que el cliente pueda hacer, así que
 *           NO lleva botón — un botón que no resuelve nada es peor que ninguno.
 *
 * `preview` es la lista de lo que la sección va a mostrar cuando tenga datos.
 * No es relleno: es lo que hace que la pantalla siga explicando para qué sirve.
 */

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C39.9 37.1 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function ClockIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SectionPlaceholder({
  variant = 'google',
  title,
  description,
  preview = [],
  note,
  onConnect,
}) {
  const isGoogle = variant === 'google';

  return (
    <div className={`sph sph--${variant}`}>
      <div className="sph__icon">
        {isGoogle ? <GoogleIcon size={26} /> : <ClockIcon size={24} />}
      </div>

      <h3 className="sph__title">{title}</h3>
      <p className="sph__text">{description}</p>

      {preview.length > 0 && (
        <>
          <div className="sph__preview-label">Lo que vas a ver acá</div>
          <ul className="sph__preview">
            {preview.map((item) => (
              <li key={item}>
                <span className="sph__check"><DotIcon /></span>
                {item}
              </li>
            ))}
          </ul>
        </>
      )}

      {isGoogle && (
        <button className="sph__btn" onClick={onConnect} type="button">
          <GoogleIcon /> Conectar mi ficha de Google
        </button>
      )}

      {note && <p className="sph__note">{note}</p>}
    </div>
  );
}
