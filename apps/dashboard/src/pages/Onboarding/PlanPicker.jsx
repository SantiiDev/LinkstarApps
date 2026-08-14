import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../context/OrgContext';
import { SALES_CONTACT_URL } from '../../lib/config';
import { formatArs } from '../../lib/format';
import { ONBOARDING_ROUTES, SECTION_PATHS, DEFAULT_SECTION } from '../../lib/routes';
import OnboardingLayout from './OnboardingLayout';

function CheckIcon() {
  return (
    <span className="onb-plan__check">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

export default function PlanPicker() {
  const navigate = useNavigate();
  const { org, canManageBilling, hasDevices, refresh } = useOrg();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyCode, setBusyCode] = useState(null);

  // El catálogo se lee de la base y no de constantes en el código: la política
  // plans_public_select (0006) deja verlo hasta sin sesión, y así un cambio de
  // precio o de features no necesita un deploy del dashboard.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error: queryError } = await supabase
        .from('plans')
        .select('code, name, description, price_ars, checkout_mode, trial_days, features, sort_order')
        .eq('is_public', true)
        .order('sort_order', { ascending: true });

      if (cancelled) return;
      if (queryError) {
        console.error('No se pudieron cargar los planes:', queryError);
        setError('No pudimos cargar los planes. Recargá la página e intentá de nuevo.');
      } else {
        setPlans(data ?? []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  async function handleFree(code) {
    setError('');
    setBusyCode(code);

    // select_free_plan valida el rol adentro (0013): es SECURITY DEFINER
    // porque `authenticated` tiene revocado el update sobre subscriptions.
    const { error: rpcError } = await supabase.rpc('select_free_plan', {
      p_org: org.organization_id,
    });

    if (rpcError) {
      setBusyCode(null);
      setError(
        rpcError.code === '42501'
          ? 'Sólo el dueño o un administrador puede elegir el plan.'
          : 'No pudimos activar el plan. Intentá de nuevo en un momento.'
      );
      return;
    }

    await refresh();
    // El gratis todavía no abre el panel: falta vincular el expositor
    // (org_is_activated, 0015). El guard igual redirigiría, pero mandarlo
    // derecho evita el rebote visible.
    navigate(hasDevices ? SECTION_PATHS[DEFAULT_SECTION] : ONBOARDING_ROUTES.device, {
      replace: true,
    });
  }

  function handleSubscription(code) {
    navigate(`${ONBOARDING_ROUTES.payment}?plan=${encodeURIComponent(code)}`);
  }

  return (
    <OnboardingLayout
      step={2}
      title="Elegí tu plan"
      subtitle="Podés cambiarlo o cancelarlo cuando quieras, sin permanencia. Los planes pagos arrancan con días de prueba sin cargo."
    >
      {error && <div className="onb-error">{error}</div>}

      {!canManageBilling && (
        <div className="onb-notice">
          Sólo el dueño o un administrador de {org?.organization_name} puede elegir el plan. Pedile que
          lo active para poder entrar al panel.
        </div>
      )}

      {loading ? (
        <p className="onb-subtitle">Cargando planes…</p>
      ) : (
        <div className="onb-plans">
          {plans.map((plan) => {
            const highlights = plan.features?.highlights ?? [];
            const featured = plan.checkout_mode === 'subscription';
            const busy = busyCode === plan.code;

            return (
              <div key={plan.code} className={'onb-plan' + (featured ? ' onb-plan--featured' : '')}>
                {featured && plan.trial_days > 0 && (
                  <span className="onb-plan__badge">{plan.trial_days} días gratis</span>
                )}

                <div className="onb-plan__name">{plan.name}</div>
                <p className="onb-plan__desc">{plan.description}</p>

                <div className="onb-plan__price">
                  {plan.checkout_mode === 'contact' ? (
                    <span className="onb-plan__amount onb-plan__amount--sm">A convenir</span>
                  ) : Number(plan.price_ars) > 0 ? (
                    <>
                      <span className="onb-plan__amount">{formatArs(plan.price_ars)}</span>
                      <span className="onb-plan__period">/mes</span>
                    </>
                  ) : (
                    <span className="onb-plan__amount">$0</span>
                  )}
                </div>

                {/* Decirle al usuario cuándo se le cobra por primera vez, antes
                    de que apriete el botón, no es un detalle legal: es la
                    diferencia entre una prueba y un cargo sorpresa. */}
                {featured && plan.trial_days > 0 && (
                  <p className="onb-plan__note">
                    Primer cobro a los {plan.trial_days} días. Cancelás cuando quieras.
                  </p>
                )}

                {/* Decirlo acá y no después: el gratis no se abre sin
                    expositor, y enterarse recién en la pantalla siguiente se
                    siente como una trampa. */}
                {plan.checkout_mode === 'free' && !hasDevices && (
                  <p className="onb-plan__note">Necesitás vincular tu expositor para activarlo.</p>
                )}

                <div className="onb-plan__features">
                  {highlights.map((item) => (
                    <div key={item} className="onb-plan__feature">
                      <CheckIcon />
                      {item}
                    </div>
                  ))}
                </div>

                {plan.checkout_mode === 'free' && (
                  <button
                    type="button"
                    className="onb-plan__btn onb-plan__btn--outline"
                    onClick={() => handleFree(plan.code)}
                    disabled={!canManageBilling || busy}
                  >
                    {busy ? 'Activando…' : 'Empezar gratis'}
                  </button>
                )}

                {plan.checkout_mode === 'subscription' && (
                  <button
                    type="button"
                    className="onb-plan__btn onb-plan__btn--solid"
                    onClick={() => handleSubscription(plan.code)}
                    disabled={!canManageBilling}
                  >
                    {plan.trial_days > 0 ? `Probar ${plan.trial_days} días gratis` : 'Suscribirme'}
                  </button>
                )}

                {plan.checkout_mode === 'contact' && (
                  <a
                    className="onb-plan__btn onb-plan__btn--outline"
                    href={SALES_CONTACT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Contactar con ventas
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </OnboardingLayout>
  );
}
