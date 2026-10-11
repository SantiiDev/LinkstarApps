import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../Icon/Icon';
import { useOrg } from '../../context/OrgContext';
import { effectiveCheckoutMode } from '../../lib/config';
import { formatArs } from '../../lib/format';
import { useBusinessPlan } from '../../lib/plans';
import { ONBOARDING_ROUTES, SECTION_PATHS } from '../../lib/routes';
import '../BusinessPitch/BusinessPitch.css';

/*
 * La oferta del plan Business: nombre, prueba gratis, precio, qué incluye y el
 * botón para pasarse. La usan dos lugares:
 *
 *   - variant="pitch": la columna derecha del modal de ventas (BusinessPitch),
 *     con sólo los dos límites, porque el modal tiene un alto fijo.
 *   - variant="card": Configuración → Plan, como una tarjeta suelta (el patrón de
 *     Tapstar). Ahí hay lugar, así que lista los `features.highlights` de `plans`.
 *
 * El precio, la prueba y el modo de alta salen de la tabla `plans`
 * (useBusinessPlan), nunca de acá: no se cobra por ubicación ni hay plan anual,
 * así que no hay selector de ubicaciones ni de período como en Tapstar. Con el
 * checkout apagado (VITE_BUSINESS_CHECKOUT=off) el botón es «Contactar con
 * ventas», como en el selector de planes.
 *
 * El botón lleva a /alta/pago con `state.from`: el «Volver» de PlanCheckout
 * regresa a la pantalla de donde se vino en vez de al selector del alta.
 */
export default function BusinessOffer({ variant = 'pitch' }) {
  const { plan, loading } = useBusinessPlan();
  const { canManageBilling } = useOrg();
  const navigate = useNavigate();
  const location = useLocation();

  // Sin el plan (cargando o error) se asume lo que dice el seed: suscripción.
  const mode = effectiveCheckoutMode(plan ?? { checkout_mode: 'subscription' });
  const trialDays = mode === 'subscription' ? (plan?.trial_days ?? 0) : 0;
  const blocked = mode === 'subscription' && !canManageBilling;

  function handleClick() {
    if (mode === 'subscription') {
      navigate(`${ONBOARDING_ROUTES.payment}?plan=business`, { state: { from: location.pathname } });
    } else {
      navigate(SECTION_PATHS.contact);
    }
  }

  const highlights = Array.isArray(plan?.features?.highlights) ? plan.features.highlights : [];
  const features = variant === 'card' && highlights.length
    ? highlights
    : [
      plan?.max_locations && `Hasta ${plan.max_locations} ubicaciones`,
      plan?.max_devices && `Hasta ${plan.max_devices} expositores`,
    ].filter(Boolean);

  return (
    <div className={`bpitch__offer bpitch__offer--${variant}`}>
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
