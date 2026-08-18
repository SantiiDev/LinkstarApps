import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../context/OrgContext';
import { ONBOARDING_ROUTES, SECTION_PATHS, DEFAULT_SECTION } from '../../lib/routes';
import OnboardingLayout from './OnboardingLayout';

/* Vincular un expositor.
 *
 * Era el último paso obligatorio del plan gratis. Desde la 0022 no bloquea
 * nada: el expositor llega días después del alta, así que exigirlo dejaba
 * afuera del panel justo al que ya había comprado. Ahora se ofrece al elegir
 * el plan gratis y se puede volver acá cuando el expositor llegue, desde
 * Dispositivos.
 *
 * claim_device() es SECURITY DEFINER y valida rol, código, doble vinculación y
 * límite de plan del lado del servidor. Acá sólo se traducen sus errores. */
const STEPS = [
  { n: 1, label: 'Empresa' },
  { n: 2, label: 'Plan' },
  { n: 3, label: 'Expositor' },
];

// Los hint que devuelve claim_device() (0007) mapeados a texto para el usuario.
const CLAIM_ERRORS = {
  invalid_claim_code: 'Ese código no existe. Revisá que esté igual al impreso en la base del expositor.',
  already_claimed: 'Ese expositor ya está vinculado a otra cuenta.',
  plan_limit_reached: 'Alcanzaste el límite de dispositivos de tu plan. Mejorá el plan para sumar más.',
  subscription_inactive: 'Tu suscripción no está activa. Elegí un plan para continuar.',
};

export default function ClaimDevice() {
  const navigate = useNavigate();
  const { org, canManageBilling, refresh } = useOrg();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { error: rpcError } = await supabase.rpc('claim_device', {
      p_claim_code: code.trim(),
      p_org_id: org.organization_id,
    });

    if (rpcError) {
      setSubmitting(false);
      setError(
        CLAIM_ERRORS[rpcError.hint] ||
          'No pudimos vincular el expositor. Revisá el código e intentá de nuevo.'
      );
      return;
    }

    await refresh();
    // A Dispositivos y no al inicio: acabás de vincular uno, verlo en la lista
    // es la confirmación de que salió bien.
    navigate(SECTION_PATHS.devices, { replace: true });
  }

  return (
    <OnboardingLayout
      steps={STEPS}
      step={3}
      title="Vinculá tu expositor"
      subtitle="Escribí el código impreso en la base del expositor para empezar a medir sus escaneos. Si todavía no te llegó, podés entrar al panel y hacerlo después."
    >
      {error && <div className="onb-error">{error}</div>}

      <div className="onb-card">
        <form className="onb-form" onSubmit={handleSubmit}>
          <label className="onb-field">
            <span className="onb-label">Código de vinculación</span>
            <input
              type="text"
              className="onb-input"
              value={code}
              /* Se sube a mayúsculas mientras se escribe porque así está
                 impreso; claim_device() compara sin distinguir igual, pero ver
                 en pantalla algo distinto a lo que dice el expositor hace
                 dudar de si se escribió bien. */
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LS-XXXXXX"
              maxLength={40}
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="onb-hint">
              Está impreso en la base del expositor, debajo del logo.
            </span>
          </label>

          <button type="submit" className="onb-submit" disabled={submitting}>
            {submitting ? 'Vinculando…' : 'Vincular expositor'}
          </button>
        </form>
      </div>

      {/* La salida principal de la pantalla. Antes el panel estaba cerrado
          hasta vincular, así que lo único que se podía ofrecer era pasarse a un
          plan pago; ahora entrar es una opción de verdad. */}
      <button
        type="button"
        className="onb-back"
        onClick={() => navigate(SECTION_PATHS[DEFAULT_SECTION], { replace: true })}
      >
        Todavía no me llegó — entrar al panel
      </button>

      {canManageBilling && (
        <button
          type="button"
          className="onb-back"
          onClick={() => navigate(ONBOARDING_ROUTES.plan)}
        >
          Ver los planes pagos
        </button>
      )}
    </OnboardingLayout>
  );
}
