import GoogleLogo from '../GoogleLogo/GoogleLogo';
import { GOOGLE_BENEFITS } from '../../lib/googleBenefits';
import './GoogleGate.css';

/*
 * Puerta de las secciones que dependen de la ficha de Google.
 *
 * La pantalla se ve detrás, desenfocada, y encima va un modal que invita a
 * conectar y no se cierra. La sección sí scrollea —la maqueta pasa por detrás—
 * pero el modal no: queda quieto, centrado y entero. Por eso el modal es
 * `position: fixed` sobre el área de contenido, corrido lo que mide el sidebar,
 * que queda limpio y clickeable porque es la única salida.
 *
 * LO QUE VA DE FONDO ES UNA MAQUETA, Y ESO SÓLO ES ACEPTABLE ACÁ.
 * `CLAUDE.md` dice que ninguna pantalla imprime un número que no se distinga de
 * uno medido. Los `*Mockup.jsx` que se renderizan como `children` son números
 * inventados. El desenfoque es suave a propósito —la idea es que el cliente vea
 * de qué se trata la sección—, así que lo que los mantiene del lado correcto de
 * la regla no es que no se lean, sino que:
 *
 *   - están debajo de un velo y desenfocados: se ven como una muestra, no como
 *     la pantalla;
 *   - son `inert`: no se pueden clickear, ni tabular, ni los lee un lector de
 *     pantalla;
 *   - el modal que los tapa no se puede cerrar, así que no hay forma de
 *     quedarse a solas con ellos.
 *
 * Si alguna vez se renderiza un `*Mockup.jsx` fuera de esta puerta, la regla se
 * rompe. Cuando la conexión con Google exista (fase 4), estas pantallas NO se
 * destapan: se reescriben contra el dato real y las maquetas se borran.
 *
 * El botón no hace nada todavía, igual que el de `GoogleConnectBanner` y el de
 * `SectionPlaceholder`: el OAuth de Google Business es fase 4.
 */

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function GoogleGate({
  children,
  title = 'Gestioná todo tu perfil de Google Business.',
  description,
  benefits = GOOGLE_BENEFITS,
  note,
}) {
  return (
    <div className="ggate">
      {/* La maqueta. `inert` la saca del foco, del mouse y del árbol de
          accesibilidad de una sola vez; no hace falta aria-hidden además.
          El desenfoque va acá, con `filter` y no con `backdrop-filter`: la
          sección scrollea, y un backdrop-filter tendría que recalcular el blur
          en cada frame sobre las ~20 tarjetas de vidrio de la maqueta (ver la
          nota de rendimiento de CLAUDE.md). Con `filter` se pinta una vez y
          el scroll sólo lo desplaza. */}
      <div className="ggate__backdrop" inert>
        {children}
      </div>

      {/* Tinte, sin blur: separa la maqueta del modal sin costo por frame. */}
      <div className="ggate__veil" />

      <div className="ggate__layer">
        <div className="ggate__dialog" role="dialog" aria-modal="true" aria-labelledby="ggate-title">
          <h2 className="ggate__title" id="ggate-title">{title}</h2>
          {description && <p className="ggate__desc">{description}</p>}

          <div className="ggate__preview">
            {[0, 1].map((i) => (
              <div key={i} className="ggate__preview-row">
                <span className="ggate__preview-avatar" />
                <div className="ggate__preview-lines">
                  <span className="ggate__preview-stars" />
                  <span className="ggate__preview-bar" />
                </div>
              </div>
            ))}
            <span className="ggate__preview-caption">Tus reseñas aparecerán acá</span>
          </div>

          <button className="ggate__btn" type="button">
            <GoogleLogo /> Conectar mi ficha de Google
          </button>
          <span className="ggate__hint">
            <ClockIcon />
            Se hace en menos de 1 minuto
          </span>

          <div className="ggate__sep" />

          <p className="ggate__lead">Una vez conectes tu cuenta vas a poder:</p>
          <ul className="ggate__list">
            {benefits.map((b) => (
              <li key={b}>
                <span className="ggate__check"><CheckIcon /></span>
                {b}
              </li>
            ))}
          </ul>

          {note && <p className="ggate__note">{note}</p>}
        </div>
      </div>
    </div>
  );
}
