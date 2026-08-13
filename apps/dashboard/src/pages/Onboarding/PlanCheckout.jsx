import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/config';
import { formatArs } from '../../lib/format';
import { ONBOARDING_ROUTES } from '../../lib/routes';
import OnboardingLayout from './OnboardingLayout';

/* Fecha del primer cobro, para mostrarla antes de mandar a nadie a Mercado
 * Pago. Es una estimación de pantalla: la fecha real la fija MP y vuelve por
 * webhook en next_payment_date. */
function firstChargeDate(trialDays) {
  const date = new Date();
  date.setDate(date.getDate() + (trialDays || 0));
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PlanCheckout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const planCode = searchParams.get('plan');

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!planCode) {
      navigate(ONBOARDING_ROUTES.plan, { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error: queryError } = await supabase
        .from('plans')
        .select('code, name, description, price_ars, trial_days, checkout_mode')
        .eq('code', planCode)
        .eq('is_public', true)
        .maybeSingle();

      if (cancelled) return;
      if (queryError || !data || data.checkout_mode !== 'subscription') {
        navigate(ONBOARDING_ROUTES.plan, { replace: true });
        return;
      }
      setPlan(data);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [planCode, navigate]);

  async function handleCheckout() {
    setError('');
    setSubmitting(true);

    try {
      // El backend vuelve a leer el precio de la base: acá sólo viaja el
      // código del plan. Un importe que sale del navegador es un importe que
      // eligió el cliente.
      const res = await fetch(`${API_URL}/api/subscriptions/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planCode: plan.code }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.initPoint) {
        throw new Error(body.error || 'No se pudo iniciar la suscripción');
      }

      // Se sale del SPA a propósito: la tarjeta se carga en Mercado Pago.
      window.location.href = body.initPoint;
    } catch (err) {
      console.error('Error iniciando la suscripción:', err);
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <OnboardingLayout step={3} title="Un momento…">
        <div className="onb-spinner" />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      step={3}
      title={`Activá el plan ${plan.name}`}
      subtitle="Vas a autorizar el débito automático mensual en Mercado Pago. Los datos de tu tarjeta los guarda Mercado Pago, no Linkstar."
    >
      {error && <div className="onb-error">{error}</div>}

      <div className="onb-card">
        <div className="onb-summary">
          <div className="onb-summary__row">
            <span>Plan</span>
            <strong>{plan.name}</strong>
          </div>
          <div className="onb-summary__row">
            <span>Facturación</span>
            <strong>Mensual, sin permanencia</strong>
          </div>
          {plan.trial_days > 0 && (
            <>
              <div className="onb-summary__row">
                <span>Prueba sin cargo</span>
                <strong>{plan.trial_days} días</strong>
              </div>
              <div className="onb-summary__row">
                <span>Primer cobro</span>
                <strong>{firstChargeDate(plan.trial_days)}</strong>
              </div>
            </>
          )}
          <div className="onb-summary__row onb-summary__total">
            <span>{plan.trial_days > 0 ? 'A pagar hoy' : 'Total mensual'}</span>
            <strong>{plan.trial_days > 0 ? formatArs(0) : formatArs(plan.price_ars)}</strong>
          </div>
          {plan.trial_days > 0 && (
            <div className="onb-summary__row">
              <span>Después</span>
              <strong>{formatArs(plan.price_ars)} por mes</strong>
            </div>
          )}
        </div>

        <p className="onb-legal">
          Al continuar autorizás a Linkstar a cobrarte {formatArs(plan.price_ars)} por mes mediante
          Mercado Pago
          {plan.trial_days > 0 ? `, a partir del ${firstChargeDate(plan.trial_days)}` : ''}. Podés
          cancelar cuando quieras desde Configuración → Facturación y no se te cobra el mes siguiente.
        </p>

        <button
          type="button"
          className="onb-submit"
          style={{ width: '100%' }}
          onClick={handleCheckout}
          disabled={submitting}
        >
          {submitting ? 'Redirigiendo…' : 'Continuar a Mercado Pago'}
        </button>
      </div>

      <button type="button" className="onb-back" onClick={() => navigate(ONBOARDING_ROUTES.plan)}>
        Volver a los planes
      </button>
    </OnboardingLayout>
  );
}
