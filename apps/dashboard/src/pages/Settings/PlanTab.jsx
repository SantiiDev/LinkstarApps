import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BusinessOffer from '../../components/BusinessOffer/BusinessOffer';
import Icon from '../../components/Icon/Icon';
import SettingsCardHead from './SettingsCardHead';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { API_URL } from '../../lib/config';
import { formatArs } from '../../lib/format';
import { fetchPlanUsage } from '../../lib/planUsage';
import { useBusinessPlan } from '../../lib/plans';
import { SECTION_PATHS } from '../../lib/routes';

/*
 * Configuración → Plan. Era la pestaña «Facturación y suscripción», tercera, y
 * en el plan gratis sólo tenía «Mejorar plan», que sacaba del panel al selector
 * del alta. Ahora, como en Tapstar, la oferta de Business está acá mismo
 * (components/BusinessOffer, la misma tarjeta del modal de ventas).
 *
 *   - «Tu plan»: nombre, estado, fechas y el uso contra los límites del plan.
 *   - Gratis: la tarjeta de Business y una línea a Enterprise.
 *   - Pago: historial de cobros y cancelar.
 *
 * No hay «Cambiar plan» en Business: llevaba a /alta/plan, donde elegir Gratis
 * con una suscripción paga vigente falla (`paid_plan_active`, 0032). Bajar de
 * plan es cancelar; el acceso sigue hasta el fin del período pagado.
 */

// Etiqueta y color de cada estado de subscription_status (0001). 'trialing' se
// muestra como "Prueba" y no como "Activa" a propósito: es plata que todavía
// no entró y el cliente tiene que saber que el cobro está por venir.
const STATUS_LABELS = {
  trialing: { label: 'Prueba', variant: 'blue' },
  active: { label: 'Activa', variant: 'green' },
  past_due: { label: 'Pago pendiente', variant: 'orange' },
  paused: { label: 'Pausada', variant: 'gray' },
  cancelled: { label: 'Cancelada', variant: 'gray' },
  expired: { label: 'Vencida', variant: 'gray' },
};

const PAYMENT_STATUS_LABELS = {
  approved: 'Pagado',
  rejected: 'Rechazado',
  pending: 'Pendiente',
  refunded: 'Devuelto',
  charged_back: 'Contracargo',
};

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/* ─── Uso contra los límites ──────────────────────────────────── */
const USAGE_ITEMS = [
  { key: 'locations', label: 'Ubicaciones', icon: 'pin' },
  { key: 'devices', label: 'Expositores', icon: 'device' },
  { key: 'members', label: 'Miembros', icon: 'users' },
];

function UsageItem({ icon, label, used, limit }) {
  const unlimited = limit === null;
  const full = !unlimited && used >= limit;
  const pct = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className={`settings-usage__item${full ? ' settings-usage__item--full' : ''}`}>
      <span className="settings-usage__label"><Icon name={icon} size={14} />{label}</span>
      <span className="settings-usage__value">
        {used}
        <small>{unlimited ? ' · ilimitado' : ` de ${limit}`}</small>
      </span>
      {!unlimited && (
        <span className="settings-usage__bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      {full && <span className="settings-usage__note">Llegaste al límite</span>}
    </div>
  );
}

function PlanUsage({ organizationId, planCode }) {
  const [usage, setUsage] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!organizationId || !planCode) return undefined;
    let cancelled = false;
    fetchPlanUsage(organizationId, planCode)
      .then((data) => { if (!cancelled) { setUsage(data); setFailed(false); } })
      .catch((err) => {
        console.error('No se pudo leer el uso del plan:', err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [organizationId, planCode]);

  if (failed) {
    return <p className="settings-card__hint settings-card__hint--block">No pudimos leer el uso de tu plan. Probá recargar la página.</p>;
  }

  return (
    <div className="settings-usage">
      {USAGE_ITEMS.map((item) => (
        usage ? (
          <UsageItem key={item.key} icon={item.icon} label={item.label} {...usage[item.key]} />
        ) : (
          <div key={item.key} className="settings-usage__item">
            <span className="settings-usage__label"><Icon name={item.icon} size={14} />{item.label}</span>
            <span className="settings-usage__value">—</span>
          </div>
        )
      ))}
      <div className="settings-usage__item">
        <span className="settings-usage__label"><Icon name="history" size={14} />Historial</span>
        <span className="settings-usage__value">
          {usage?.retentionDays ? (
            <>{usage.retentionDays}<small> días</small></>
          ) : '—'}
        </span>
      </div>
    </div>
  );
}

/* «¿Más de N locales?» con N = el límite de ubicaciones de Business, de `plans`.
   Sin el número (cargando o error) la frase no lo inventa. */
function EnterpriseLine() {
  const { plan } = useBusinessPlan();
  const max = plan?.max_locations;
  return (
    <p className="settings-plan-enterprise">
      {max ? `¿Tenés más de ${max} locales?` : '¿Tenés muchos locales?'}{' '}
      <Link to={SECTION_PATHS.contact}>Conocé Enterprise</Link>
    </p>
  );
}

export default function PlanTab() {
  const { session } = useAuth();
  const { org, canManageBilling, refresh } = useOrg();

  const [payments, setPayments] = useState([]);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  const orgId = org?.organization_id;
  const isPaid = Boolean(org?.plan_code && org.plan_code !== 'free');
  const isEnterprise = org?.plan_code === 'enterprise';

  // Sólo owner/admin pueden leer subscription_payments (política
  // subscription_payments_select de 0006). Para el resto la consulta vuelve
  // vacía sin error, y la sección de historial queda sin filas.
  useEffect(() => {
    if (!orgId || !isPaid) return undefined;
    let cancelled = false;

    (async () => {
      const { data, error: queryError } = await supabase
        .from('subscription_payments')
        .select('id, status, amount, paid_at, period_start, period_end, invoice_url')
        .eq('organization_id', orgId)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .limit(12);

      if (cancelled) return;
      if (queryError) {
        console.error('No se pudo cargar el historial de pagos:', queryError);
        return;
      }
      setPayments(data ?? []);
    })();

    return () => { cancelled = true; };
  }, [orgId, isPaid]);

  async function handleCancel() {
    // Cancelar una suscripción no se deshace con un "atrás" del navegador.
    if (!window.confirm('¿Cancelar la suscripción? Vas a mantener el acceso hasta el fin del período ya pagado.')) {
      return;
    }

    setError('');
    setCancelling(true);

    try {
      const res = await fetch(`${API_URL}/api/subscriptions/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo cancelar la suscripción');

      // El estado final lo escribe el webhook; se refresca para tomarlo apenas
      // llegue, pero puede tardar unos segundos en reflejarse.
      await refresh();
    } catch (err) {
      console.error('Error cancelando la suscripción:', err);
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  const status = STATUS_LABELS[org?.status] ?? { label: org?.status ?? '—', variant: 'gray' };
  const trialEnd = formatDate(org?.trial_ends_at);
  const periodEnd = formatDate(org?.current_period_end);

  return (
    <div className="settings-panel">
      {error && <div className="settings-alert">{error}</div>}

      <div className="settings-card">
        <SettingsCardHead
          icon="card"
          iconVariant="orange"
          title="Tu plan"
          subtitle={<p className="settings-card__subtitle">Qué plan tenés y cuánto estás usando.</p>}
        />

        <div className="settings-plan-head">
          <p className="settings-plan-name">{org?.plan_name ?? '—'}</p>
          <div className="settings-plan-badges">
            <span className={`settings-badge settings-badge--${status.variant}`}>{status.label}</span>
            {isPaid && <span className="settings-badge settings-badge--gray">Mensual</span>}
          </div>
        </div>

        {org?.status === 'trialing' && trialEnd && (
          <p className="settings-plan-detail">Período de prueba hasta el {trialEnd}</p>
        )}
        {org?.status === 'active' && isPaid && periodEnd && !org?.cancel_at_period_end && (
          <p className="settings-plan-detail">Próximo cobro el {periodEnd}</p>
        )}
        {org?.status === 'past_due' && (
          <p className="settings-plan-detail">
            El último cobro fue rechazado. Actualizá tu medio de pago en Mercado Pago
            {formatDate(org?.grace_until) ? ` antes del ${formatDate(org.grace_until)}` : ''}.
          </p>
        )}
        {org?.cancel_at_period_end && periodEnd && (
          <p className="settings-plan-detail settings-plan-detail--muted">
            Cancelada: mantenés el acceso hasta el {periodEnd}.
          </p>
        )}
        {!isPaid && (
          <p className="settings-plan-detail settings-plan-detail--muted">
            Estás en el plan gratis incluido con tu expositor.
          </p>
        )}

        {canManageBilling ? (
          <PlanUsage organizationId={orgId} planCode={org?.plan_code} />
        ) : (
          <p className="settings-card__hint settings-card__hint--block">
            El plan lo administra el dueño o un administrador de la cuenta.
          </p>
        )}

        {isPaid && !isEnterprise && <EnterpriseLine />}
      </div>

      {!isPaid && (
        <div className="settings-plan-offer">
          <div className="settings-card settings-plan-offer__card">
            <BusinessOffer variant="card" />
          </div>
          <EnterpriseLine />
        </div>
      )}

      {isPaid && (
        <div className="settings-card">
          <SettingsCardHead
            icon="fileText"
            iconVariant="navy"
            title="Historial de pagos"
            subtitle={<p className="settings-card__subtitle">Los cobros mensuales de tu suscripción a Linkstar.</p>}
          />

          {payments.length === 0 ? (
            <p className="settings-plan-detail settings-plan-detail--muted">
              Todavía no hay cobros registrados.
            </p>
          ) : (
            <div className="settings-invoices">
              {payments.map((payment) => (
                <div key={payment.id} className="settings-invoice-row">
                  <div className="settings-invoice-row__icon"><Icon name="card" size={16} /></div>
                  <div className="settings-invoice-row__body">
                    <div className="settings-invoice-row__period">
                      {formatDate(payment.period_start) ?? 'Período'}
                      {payment.period_end ? ` — ${formatDate(payment.period_end)}` : ''}
                    </div>
                    <div className="settings-invoice-row__date">{formatDate(payment.paid_at) ?? '—'}</div>
                  </div>
                  <span className="settings-invoice-row__status">
                    <Icon name="check" size={13} />{' '}
                    {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                  </span>
                  <span className="settings-invoice-row__amount">{formatArs(payment.amount)}</span>
                  {/* La factura electrónica (AFIP) todavía no se emite: la columna
                      invoice_url existe en subscription_payments pero nada la
                      completa, así que el botón sólo aparece si hay algo que
                      descargar de verdad. */}
                  {payment.invoice_url && (
                    <a
                      className="settings-invoice-row__download"
                      href={payment.invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Descargar factura"
                    >
                      <Icon name="download" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isPaid && canManageBilling && !org?.cancel_at_period_end && (
        <div className="settings-danger-card">
          <div>
            <h3 className="settings-danger-card__title">Cancelar suscripción</h3>
            <p className="settings-danger-card__text">
              Cancelá tu plan {org?.plan_name}. Vas a mantener el acceso hasta el fin del período actual.
            </p>
          </div>
          <button
            type="button"
            className="settings-danger-btn"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelando…' : 'Cancelar suscripción'}
          </button>
        </div>
      )}
    </div>
  );
}
