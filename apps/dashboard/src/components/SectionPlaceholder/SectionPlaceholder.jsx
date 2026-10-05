import GoogleLogo from '../GoogleLogo/GoogleLogo';
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
        {isGoogle ? <GoogleLogo size={26} /> : <ClockIcon size={24} />}
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
          <GoogleLogo /> Conectar mi ficha de Google
        </button>
      )}

      {note && <p className="sph__note">{note}</p>}
    </div>
  );
}
