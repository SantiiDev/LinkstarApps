import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Icon/Icon';
import { useOrg } from '../../context/OrgContext';
import { effectiveCheckoutMode } from '../../lib/config';
import { formatArs } from '../../lib/format';
import { useBusinessPlan } from '../../lib/plans';
import { ONBOARDING_ROUTES, SECTION_PATHS } from '../../lib/routes';
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
 * El precio, la prueba gratis y el modo de alta salen de la tabla `plans`
 * (useBusinessPlan), nunca de acá: no se cobra por ubicación ni hay plan anual,
 * así que no hay selector de ubicaciones ni de período como en Tapstar. Con el
 * checkout apagado (VITE_BUSINESS_CHECKOUT=off) el botón es «Contactar con
 * ventas», como en el selector de planes.
 */

function BusinessOffer() {
  const { plan, loading } = useBusinessPlan();
  const { canManageBilling } = useOrg();
  const navigate = useNavigate();

  // Sin el plan (cargando o error) se asume lo que dice el seed: suscripción.
  const mode = effectiveCheckoutMode(plan ?? { checkout_mode: 'subscription' });
  const trialDays = mode === 'subscription' ? (plan?.trial_days ?? 0) : 0;
  const blocked = mode === 'subscription' && !canManageBilling;

  function handleClick() {
    if (mode === 'subscription') navigate(`${ONBOARDING_ROUTES.payment}?plan=business`);
    else navigate(SECTION_PATHS.contact);
  }

  const features = [
    plan?.max_locations && `Hasta ${plan.max_locations} ubicaciones`,
    plan?.max_devices && `Hasta ${plan.max_devices} expositores`,
  ].filter(Boolean);

  return (
    <div className="bpitch__offer">
      <p className="bpitch__plan"><strong>Linkstar</strong> {plan?.name ?? 'Business'}</p>
      {plan?.description && <p className="bpitch__plan-desc">{plan.description}</p>}

      {trialDays > 0 && (
        <span className="bpitch__trial">
          Activá tu <strong>prueba gratis de {trialDays} días</strong>
        </span>
      )}

      {loading && <span className="bpitch__price-skeleton" aria-hidden="true" />}
      {plan && Number(plan.price_ars) > 0 && (
        <div className="bpitch__price">
          <span className="bpitch__amount">{formatArs(plan.price_ars)}</span>
          <span className="bpitch__period">/ mes</span>
        </div>
      )}
      {plan && (
        <p className="bpitch__billing">Se cobra una vez por mes con Mercado Pago. Sin permanencia.</p>
      )}

      {features.length > 0 && (
        <ul className="bpitch__features">
          {features.map((f) => (
            <li key={f}><Icon name="check" size={14} strokeWidth={2.5} />{f}</li>
          ))}
        </ul>
      )}

      <button type="button" className="bpitch__cta" onClick={handleClick} disabled={blocked}>
        {mode === 'subscription'
          ? (trialDays > 0 ? `Probar ${trialDays} días gratis` : 'Pasarme a Business')
          : 'Contactar con ventas'}
      </button>

      {blocked ? (
        <p className="bpitch__fine">Sólo el dueño o un administrador de la cuenta puede activar Business.</p>
      ) : (
        <p className="bpitch__fine">
          {mode === 'subscription'
            ? (trialDays > 0
              ? 'No se te cobra nada hasta que termine la prueba. Cancelás cuando quieras.'
              : 'Cancelás cuando quieras.')
            : 'Contanos cuántos locales tenés y lo activamos en tu cuenta.'}
        </p>
      )}
    </div>
  );
}

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
