import { useState } from 'react';
import BusinessOffer from '../BusinessOffer/BusinessOffer';
import '../GoogleGate/GoogleGate.css';
import './BusinessPitch.css';

/*
 * El modal de ventas de una sección que es sólo de Business (NPS, Sentimiento,
 * Palabras clave), visto desde el plan gratis. Es el patrón de Tapstar: a la
 * izquierda unos pasos que cuentan qué hace la sección, a la derecha el plan con
 * su precio y el botón para pasarse.
 *
 * Lo que va detrás es la maqueta de la sección (`children`), y por eso valen las
 * mismas reglas que en GoogleGate, de quien reusa el fondo y la capa fija
 * (GoogleGate.css): desenfocada, `inert`, debajo de un velo, y el modal no se
 * puede cerrar — ni cruz ni Escape. La salida es el sidebar, que queda limpio.
 * ES EL TERCER LUGAR DONDE UNA MAQUETA PUEDE RENDERIZARSE (los otros son
 * GoogleGate y BusinessLock); si alguna vez se puede cerrar, la maqueta queda a
 * la vista como si fuera la pantalla, y se rompe la regla de CLAUDE.md.
 *
 * Las ilustraciones de cada paso (`steps[].art`) son los bloques reales de la
 * sección con datos inventados (pages/Reports/reportsSample.js), achicados
 * dentro de un marco inerte.
 *
 * La columna del plan es components/BusinessOffer, la misma tarjeta que
 * muestra Configuración → Plan: precio, prueba y botón salen de `plans` y de
 * VITE_BUSINESS_CHECKOUT en un solo lugar.
 */

export default function BusinessPitch({ children, title, description, steps }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <div className="ggate">
      <div className="ggate__backdrop" inert>
        {children}
      </div>
      <div className="ggate__veil" />

      <div className="ggate__layer bpitch-layer">
        <div className="bpitch" role="dialog" aria-modal="true" aria-labelledby="bpitch-title">
          <div className="bpitch__story">
            <span className="bpitch__badge">Incluido en Business</span>
            <h2 className="bpitch__title" id="bpitch-title">{title}</h2>
            <p className="bpitch__desc">{description}</p>

            <div className="bpitch__progress" aria-hidden="true">
              {steps.map((s, i) => (
                <span key={s.title} className={`bpitch__bar${i <= index ? ' bpitch__bar--on' : ''}`} />
              ))}
            </div>

            {/* La ilustración: bloques de la pantalla con datos inventados,
                achicados. `inert` como la maqueta de atrás: es un dibujo. */}
            <div className="bpitch__art" inert>
              <div className="bpitch__art-inner">{step.art}</div>
            </div>

            <div className="bpitch__step">
              <p className="bpitch__step-title">
                <span className="bpitch__step-num">{index + 1}</span>
                {step.title}
              </p>
              <p className="bpitch__step-text">{step.text}</p>
            </div>

            <div className="bpitch__nav">
              <span className="bpitch__count">Paso {index + 1} de {steps.length}</span>
              <div className="bpitch__nav-btns">
                {index > 0 && (
                  <button type="button" className="bpitch__back" onClick={() => setIndex((i) => i - 1)}>
                    ← Atrás
                  </button>
                )}
                {!last && (
                  <button type="button" className="bpitch__next" onClick={() => setIndex((i) => i + 1)}>
                    Siguiente →
                  </button>
                )}
              </div>
            </div>
          </div>

          <BusinessOffer />
        </div>
      </div>
    </div>
  );
}
