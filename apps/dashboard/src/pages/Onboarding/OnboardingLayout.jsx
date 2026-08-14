import { useAuth } from '../../context/AuthContext';
import './Onboarding.css';

/* El último paso depende del plan: el pago en Business, vincular el expositor
 * en Gratis. Por eso es un prop y no una constante del módulo. */
const DEFAULT_STEPS = [
  { n: 1, label: 'Empresa' },
  { n: 2, label: 'Plan' },
  { n: 3, label: 'Pago' },
];

/* Marco común de los pasos previos al panel.
 *
 * `step` marca en cuál está: los anteriores quedan en verde (hechos) y el
 * actual en naranja. Es la única señal de "cuánto falta" que tiene el usuario
 * en un flujo donde recién al final se le pide la tarjeta. */
export default function OnboardingLayout({ step, title, subtitle, steps = DEFAULT_STEPS, children }) {
  const { signOut } = useAuth();

  return (
    <div className="onb-page">
      <div className="onb-topbar">
        <div className="onb-logo">
          linkstar<span className="onb-logo__dot">.</span>
        </div>
        <button type="button" className="onb-signout" onClick={signOut}>
          Cerrar sesión
        </button>
      </div>

      <div className="onb-steps">
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {i > 0 && <div className="onb-step__line" />}
            <div
              className={
                'onb-step' +
                (s.n === step ? ' onb-step--active' : '') +
                (s.n < step ? ' onb-step--done' : '')
              }
            >
              <span className="onb-step__num">{s.n < step ? '✓' : s.n}</span>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="onb-head">
        <h1 className="onb-title">{title}</h1>
        {subtitle && <p className="onb-subtitle">{subtitle}</p>}
      </div>

      <div className="onb-body">{children}</div>
    </div>
  );
}
