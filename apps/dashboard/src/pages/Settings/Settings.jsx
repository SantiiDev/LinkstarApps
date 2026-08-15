import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader/PageHeader';
import Select from '../../components/Select/Select';
import EmployeesPage from '../Employees/Employees';
import LocationsPage from '../Locations/Locations';
import TeamMembers from './TeamMembers';
import ActivityLog from './ActivityLog';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { API_URL } from '../../lib/config';
import { formatArs } from '../../lib/format';
import { ONBOARDING_ROUTES, SETTINGS_TABS, SETTINGS_TAB_ALIASES, settingsTabPath } from '../../lib/routes';
import './Settings.css';

// Los ids son los mismos que van en la URL (/panel/configuracion/equipo), así
// que no hace falta traducir entre el id de la pestaña y su path. Los nombres
// viejos ('team', 'billing', 'employees'…) siguen funcionando como alias, en
// SETTINGS_TAB_ALIASES.
const TABS = [
  { id: 'local', label: 'Gestión local', icon: 'mapPin' },
  { id: 'equipo', label: 'Equipo', icon: 'users' },
  { id: 'facturacion', label: 'Facturación y suscripción', icon: 'card' },
  { id: 'legal', label: 'Legal', icon: 'gear' },
];

function Icon({ name, ...rest }) {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    mapPin: <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    info: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
    alertCircle: <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
    palette: <svg {...props}><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h1.99C19.5 16.4 22 13.9 22 10.85 22 6 17.46 2 12 2z" /><circle cx="6.5" cy="11.5" r="1.5" /><circle cx="9.5" cy="7.5" r="1.5" /><circle cx="14.5" cy="7.5" r="1.5" /><circle cx="17.5" cy="11.5" r="1.5" /></svg>,
    mail: <svg {...props}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>,
    users: <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    userPlus: <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>,
    activity: <svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
    card: <svg {...props}><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
    fileText: <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
    externalLink: <svg {...props}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
    check: <svg {...props}><polyline points="20 6 9 17 4 12" /></svg>,
    download: <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
    gear: <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
    google: (
      <svg {...props} viewBox="0 0 48 48" fill="none" strokeWidth="0">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C39.9 37.1 44 31 44 24c0-1.3-.1-2.7-.4-3.5z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

function CardHead({ icon, iconVariant = 'navy', title, badge, subtitle, action }) {
  return (
    <div className="settings-card__head">
      <div className="settings-card__head-left">
        <div className={`settings-icon-box settings-icon-box--${iconVariant}`}><Icon name={icon} /></div>
        <div>
          <h3 className="settings-card__title-row">
            {title}
            {badge}
          </h3>
          {subtitle}
        </div>
      </div>
      {action && <div className="settings-card__head-action">{action}</div>}
    </div>
  );
}

/* ─── Gestión local ───────────────────────────────────────────── */
const CONTACT_LOCATION_OPTIONS = [{ value: 'all', label: 'Todos los locales' }];

function LocalTab() {
  const [contactLocation, setContactLocation] = useState('all');

  return (
    <div className="settings-panel">
      {/* Ubicaciones reales (v_location_performance, cruzada con
          v_device_performance). Esta pestaña reemplazó en su momento a la
          pantalla propia de Ubicaciones, pero con placeholders: LocationsPage
          seguía escrita y conectada a datos reales sin ninguna forma de llegar
          a ella desde la app. Ahora se renderiza acá, sin su encabezado ni su
          pie propios (`embedded`), porque esta página ya trae los suyos. */}
      <LocationsPage embedded />

      <div className="settings-card">
        <CardHead
          icon="mapPin"
          iconVariant="navy"
          title="Cuentas de Google conectadas"
          badge={<Icon name="info" width={14} height={14} className="settings-info-icon" />}
          subtitle={
            <>
              <p className="settings-card__subtitle settings-card__subtitle--tight">0 de 1 locales activos</p>
              <p className="settings-card__hint">1 local activable. <button type="button" className="settings-inline-link">¿Necesitás más?</button></p>
            </>
          }
          action={
            <button type="button" className="settings-btn settings-btn--outline">
              <Icon name="google" width={16} height={16} /> Conectar más cuentas
            </button>
          }
        />

        <div className="settings-account-row">
          <div className="settings-account-row__icon"><Icon name="google" width={18} height={18} /></div>
          <div className="settings-account-row__body">
            <div className="settings-account-row__name">Santino Gallo</div>
            <div className="settings-account-row__email">santino@linkstar.com.ar</div>
          </div>
          <button type="button" className="settings-danger-link">Desconectar</button>
        </div>

        <div className="settings-danger-banner">
          <Icon name="alertCircle" width={18} height={18} />
          <p>Esta cuenta de Google no administra ningún local de Google Business. Desconectala y conectá una cuenta que sí administre locales.</p>
        </div>
      </div>

      <div className="settings-card">
        <CardHead
          icon="palette"
          iconVariant="gold"
          title="Tonos de marca"
          subtitle={<p className="settings-card__subtitle">Definí cómo responde la IA por local. El tono específico de un local tiene prioridad sobre el global.</p>}
          action={<button type="button" className="settings-save-btn">+ Añadir tono</button>}
        />

        <div className="settings-empty-state">
          <div className="settings-empty-state__icon"><Icon name="palette" width={22} height={22} /></div>
          <p className="settings-empty-state__title">No hay tonos configurados todavía.</p>
          <p className="settings-empty-state__text">Creá tu primer tono para que la IA responda con tu voz.</p>
        </div>
      </div>

      <div className="settings-card">
        <CardHead
          icon="mail"
          iconVariant="forest"
          title="Email de contacto para reseñas negativas"
          subtitle={<p className="settings-card__subtitle">La IA lo va a citar en las respuestas a reseñas de 1, 2 y 3 estrellas.</p>}
        />

        <div className="settings-contact-email-row">
          <Select
            value={contactLocation}
            onChange={setContactLocation}
            options={CONTACT_LOCATION_OPTIONS}
            triggerClassName="settings-select"
          />
          <input type="email" placeholder="contacto@tunegocio.com" className="settings-text-input" />
          <button type="button" className="settings-save-btn">Guardar</button>
        </div>
        <p className="settings-card__hint settings-card__hint--block">
          Distinto de las alertas de Automatizaciones (que te avisan a vos). Este email es público — el cliente lo va a ver en la respuesta visible en Google Maps.
        </p>
      </div>
    </div>
  );
}

/* ─── Equipo ──────────────────────────────────────────────────── */
function TeamTab() {
  return (
    <div className="settings-panel">
      {/* Dos cosas distintas, una arriba de la otra, y el orden importa:
          primero quién tiene ACCESO a la cuenta (memberships/invitations del
          0002, cableado en la 0020) y después los empleados, que no inician
          sesión y existen para atribuirles escaneos
          (v_employee_leaderboard). Los dos subtítulos aclaran cuál es cuál,
          porque "equipo" a secas es ambiguo en este producto. */}
      <TeamMembers />

      {/* Empleados reales. Mismo caso que Ubicaciones en la pestaña "Gestión
          local": la página existía y leía datos reales, pero acá había un
          placeholder "Próximamente" y ningún camino hasta ella. Se renderiza
          con `embedded` para no repetir encabezado y pie. */}
      <EmployeesPage embedded />

      <ActivityLog />
    </div>
  );
}

/* ─── Facturación y suscripción ───────────────────────────────── */
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

function BillingTab() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { org, canManageBilling, refresh } = useOrg();

  const [payments, setPayments] = useState([]);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  // Sólo owner/admin pueden leer subscription_payments (política
  // subscription_payments_select de 0006). Para el resto la consulta vuelve
  // vacía sin error, y la sección de historial queda sin filas.
  useEffect(() => {
    if (!org?.organization_id) return;
    let cancelled = false;

    (async () => {
      const { data, error: queryError } = await supabase
        .from('subscription_payments')
        .select('id, status, amount, paid_at, period_start, period_end, invoice_url')
        .eq('organization_id', org.organization_id)
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
  }, [org?.organization_id]);

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
  const isPaid = Boolean(org?.plan_code && org.plan_code !== 'free');
  const trialEnd = formatDate(org?.trial_ends_at);
  const periodEnd = formatDate(org?.current_period_end);

  return (
    <div className="settings-panel">
      {error && <div className="settings-alert">{error}</div>}

      <div className="settings-card">
        <CardHead
          icon="card"
          iconVariant="orange"
          title="Gestionar suscripción"
          subtitle={<p className="settings-card__subtitle">Plan activo y facturas</p>}
        />

        <div className="settings-plan-badges">
          <span className="settings-badge settings-badge--orange">Plan {org?.plan_name ?? '—'}</span>
          <span className={`settings-badge settings-badge--${status.variant}`}>{status.label}</span>
          <span className="settings-badge settings-badge--gray">Mensual</span>
        </div>

        {org?.status === 'trialing' && trialEnd && (
          <p className="settings-plan-detail">Período de prueba hasta el {trialEnd}</p>
        )}
        {org?.status === 'active' && periodEnd && (
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

        <div className="settings-plan-actions">
          <button
            type="button"
            className="settings-save-btn"
            onClick={() => navigate(ONBOARDING_ROUTES.plan)}
            disabled={!canManageBilling}
          >
            {isPaid ? 'Cambiar plan' : 'Mejorar plan'}
          </button>
        </div>
      </div>

      {isPaid && canManageBilling && (
        <div className="settings-danger-card">
          <div>
            <h3 className="settings-danger-card__title">Suscripción</h3>
            <p className="settings-danger-card__text">
              Cancelá tu plan {org?.plan_name}. Vas a mantener acceso hasta el fin del período actual.
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

      <div className="settings-card">
        <CardHead
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
                <div className="settings-invoice-row__icon"><Icon name="card" width={16} height={16} /></div>
                <div className="settings-invoice-row__body">
                  <div className="settings-invoice-row__period">
                    {formatDate(payment.period_start) ?? 'Período'}
                    {payment.period_end ? ` — ${formatDate(payment.period_end)}` : ''}
                  </div>
                  <div className="settings-invoice-row__date">{formatDate(payment.paid_at) ?? '—'}</div>
                </div>
                <span className="settings-invoice-row__status">
                  <Icon name="check" width={13} height={13} />{' '}
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
    </div>
  );
}

/* ─── Legal ───────────────────────────────────────────────────── */
const LEGAL_DOCS = ['Términos de Servicio', 'Política de Privacidad', 'DPA', 'Aviso Legal', 'Política de Cookies'];

function LegalTab() {
  return (
    <div className="settings-panel">
      <div className="settings-card">
        <CardHead
          icon="gear"
          iconVariant="navy"
          title="Legal"
          subtitle={<p className="settings-card__subtitle">Documentos legales y políticas</p>}
        />

        <div className="settings-legal-list">
          {LEGAL_DOCS.map((doc) => (
            <button key={doc} type="button" className="settings-legal-row">
              <Icon name="fileText" width={16} height={16} />
              <span>{doc}</span>
              <Icon name="externalLink" width={14} height={14} className="settings-legal-row__ext" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Root ────────────────────────────────────────────────────── */
/* La pestaña abierta vive en la URL (/panel/configuracion/:tab) y no en un
   useState: así se puede enlazar directo a una pestaña —Dispositivos enlaza a
   "Gestión local"—, compartir el enlace y usar atrás del navegador entre
   pestañas. Sin :tab, o con una pestaña que no existe, se abre la primera. */
export default function SettingsPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();

  const resolved = SETTINGS_TAB_ALIASES[tabParam] || tabParam;
  const tab = SETTINGS_TABS.includes(resolved) ? resolved : 'local';

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="Configuración"
        title="Configuración"
        subtitle="Administrá los datos de tu empresa, tu equipo y tu suscripción"
      />

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-tab ${tab === t.id ? 'settings-tab--active' : ''}`}
            onClick={() => navigate(settingsTabPath(t.id))}
          >
            <Icon name={t.icon} width={15} height={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'local' && <LocalTab />}
      {tab === 'equipo' && <TeamTab />}
      {tab === 'facturacion' && <BillingTab />}
      {tab === 'legal' && <LegalTab />}
    </div>
  );
}
