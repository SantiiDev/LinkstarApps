import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { ONBOARDING_ROUTES, SECTION_PATHS, DEFAULT_SECTION } from '../../lib/routes';
import OnboardingLayout from './OnboardingLayout';

/* Vuelta desde Mercado Pago.
 *
 * Esta pantalla NO confirma nada por sí sola: que el navegador haya vuelto acá
 * sólo significa que el usuario terminó de operar en Mercado Pago, no que MP
 * haya autorizado la suscripción. Lo único que la autoriza es el webhook
 * (subscription_preapproval), y puede llegar unos segundos después del
 * redirect. Por eso esto es una sala de espera que consulta el estado real
 * hasta que aparece, y no una pantalla de "¡listo!".
 *
 * Tampoco se leen los parámetros que agrega Mercado Pago a la URL de vuelta:
 * son datos del cliente y se pueden escribir a mano en la barra de
 * direcciones. */
const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 10; // ~30 segundos

export default function PlanResult() {
  const navigate = useNavigate();
  const { org, refresh } = useOrg();
  const [attempts, setAttempts] = useState(0);

  const confirmed = Boolean(org?.plan_selected_at && org?.has_access);
  const exhausted = attempts >= MAX_ATTEMPTS;

  useEffect(() => {
    if (confirmed) {
      navigate(SECTION_PATHS[DEFAULT_SECTION], { replace: true });
      return;
    }
    if (exhausted) return;

    const timer = setTimeout(async () => {
      await refresh();
      setAttempts((n) => n + 1);
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [confirmed, exhausted, attempts, refresh, navigate]);

  if (exhausted) {
    return (
      <OnboardingLayout
        step={3}
        title="Estamos confirmando tu pago"
        subtitle="Mercado Pago todavía no nos confirmó la suscripción. Si ya la autorizaste, se activa sola en unos minutos y te va a estar esperando la próxima vez que entres."
      >
        <div className="onb-card onb-center">
          <button
            type="button"
            className="onb-submit"
            style={{ width: '100%' }}
            onClick={() => setAttempts(0)}
          >
            Volver a consultar
          </button>
        </div>

        <button
          type="button"
          className="onb-back"
          onClick={() => navigate(ONBOARDING_ROUTES.plan, { replace: true })}
        >
          Elegir otro plan
        </button>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      step={3}
      title="Activando tu plan"
      subtitle="Estamos confirmando la suscripción con Mercado Pago. No cierres esta ventana."
    >
      <div className="onb-card onb-center">
        <div className="onb-spinner" />
        <p className="onb-subtitle">Esto tarda unos segundos.</p>
      </div>
    </OnboardingLayout>
  );
}
