import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { settingsTabPath } from '../../lib/routes';

/* Aviso fijo arriba del panel cuando la suscripción necesita atención.
 *
 * Sólo aparece cuando hay algo que el usuario pueda y deba hacer: prueba por
 * terminar, cobro rechazado, o cancelación con acceso hasta fin de período.
 * Con la suscripción al día no se muestra nada — un banner permanente deja de
 * leerse a los dos días y después no sirve para avisar lo que importa.
 *
 * El corte real del servicio no lo hace esto: lo hace org_has_access() en la
 * base. Esto es sólo el aviso previo. */
const TRIAL_WARNING_DAYS = 3;

function daysUntil(value) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}

export default function SubscriptionBanner() {
  const navigate = useNavigate();
  const { org } = useOrg();

  if (!org) return null;

  const goToBilling = () => navigate(settingsTabPath('facturacion'));

  if (org.status === 'past_due') {
    const until = formatDate(org.grace_until);
    return (
      <div className="app-shell__banner app-shell__banner--danger">
        <span>
          No pudimos cobrar tu suscripción. Actualizá el medio de pago en Mercado Pago
          {until ? ` antes del ${until}` : ''} para no perder el acceso.
        </span>
        <button type="button" className="app-shell__banner-btn" onClick={goToBilling}>
          Ver facturación
        </button>
      </div>
    );
  }

  if (org.status === 'trialing') {
    const remaining = daysUntil(org.trial_ends_at);
    if (remaining !== null && remaining <= TRIAL_WARNING_DAYS) {
      return (
        <div className="app-shell__banner app-shell__banner--warning">
          <span>
            {remaining <= 0
              ? 'Tu prueba termina hoy.'
              : `Te ${remaining === 1 ? 'queda 1 día' : `quedan ${remaining} días`} de prueba.`}{' '}
            Después se cobra el primer mes automáticamente.
          </span>
          <button type="button" className="app-shell__banner-btn" onClick={goToBilling}>
            Ver mi plan
          </button>
        </div>
      );
    }
    return null;
  }

  if (org.cancel_at_period_end && org.current_period_end) {
    return (
      <div className="app-shell__banner app-shell__banner--warning">
        <span>
          Cancelaste tu suscripción. Mantenés el acceso hasta el {formatDate(org.current_period_end)}.
        </span>
        <button type="button" className="app-shell__banner-btn" onClick={goToBilling}>
          Reactivar
        </button>
      </div>
    );
  }

  return null;
}
