import { useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import './Settings.css';

const TABS = [
  { id: 'local', label: 'Gestión local', icon: 'mapPin' },
  { id: 'team', label: 'Equipo', icon: 'users' },
  { id: 'billing', label: 'Facturación y suscripción', icon: 'card' },
  { id: 'legal', label: 'Legal', icon: 'gear' },
];

// initialTab llega desde deep-links viejos (Devices.jsx apuntaba a
// 'employees'/'locations' cuando esas eran pestañas propias) — se
// mapean a las pestañas nuevas más cercanas.
const TAB_ALIASES = { general: 'local', employees: 'team', locations: 'local' };

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
function LocalTab() {
  return (
    <div className="settings-panel">
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
          <select className="settings-select" defaultValue="all">
            <option value="all">Todos los locales</option>
          </select>
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
const ACTIVITY_LOG = [
  { id: 1, date: '05/08/2026 09:42', actor: 'santinogallo', text: 'Actualizó el email de contacto para reseñas negativas', email: 'santinogallo61@gmail.com' },
  { id: 2, date: '04/08/2026 18:05', actor: 'santinogallo', text: 'Cambió el plan a Business', email: 'santinogallo61@gmail.com' },
  { id: 3, date: '03/08/2026 21:17', actor: 'santinogallo', text: 'Desconectó su cuenta de Google', email: 'santinogallo61@gmail.com' },
];

function TeamTab() {
  return (
    <div className="settings-panel">
      <div className="settings-card">
        <CardHead
          icon="users"
          iconVariant="orange"
          title="Equipo"
          badge={<span className="settings-badge settings-badge--soon">Próximamente</span>}
          subtitle={<p className="settings-card__subtitle">Invitá empleados y gestioná sus permisos.</p>}
          action={
            <button type="button" className="settings-save-btn" disabled title="Disponible próximamente">
              <Icon name="userPlus" width={15} height={15} /> Invitar empleado
            </button>
          }
        />

        <div className="settings-empty-state">
          <div className="settings-empty-state__icon"><Icon name="users" width={22} height={22} /></div>
          <p className="settings-empty-state__title">Estamos trabajando en esto.</p>
          <p className="settings-empty-state__text">Muy pronto vas a poder invitar empleados y asignarles permisos desde acá.</p>
        </div>
      </div>

      <div className="settings-card">
        <CardHead
          icon="activity"
          iconVariant="navy"
          title="Registro de actividad"
          subtitle={<p className="settings-card__subtitle">Quién hizo qué en tu cuenta</p>}
        />

        <div className="settings-activity-filters">
          <label className="settings-field">
            <span>Categoría</span>
            <select className="settings-select" defaultValue="all">
              <option value="all">Todas las categorías</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Desde</span>
            <input type="date" />
          </label>
          <label className="settings-field">
            <span>Hasta</span>
            <input type="date" />
          </label>
        </div>

        <div className="settings-activity-log">
          {ACTIVITY_LOG.map((entry) => (
            <div key={entry.id} className="settings-activity-row">
              <span className="settings-activity-row__date">{entry.date}</span>
              <span className="settings-activity-row__actor">{entry.actor}</span>
              <span className="settings-activity-row__text">{entry.text}</span>
              <span className="settings-activity-row__email">{entry.email}</span>
            </div>
          ))}
          <div className="settings-activity-log__end">— fin del registro —</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Facturación y suscripción ───────────────────────────────── */
const INVOICES = [
  { id: 1, period: '90C6901C-0045', amount: '$14.999', status: 'Pagada', date: '3 ago 2026' },
  { id: 2, period: '90C6901C-0032', amount: '$14.999', status: 'Pagada', date: '3 jul 2026' },
  { id: 3, period: '90C6901C-0021', amount: '$14.999', status: 'Pagada', date: '3 jun 2026' },
];

function BillingTab() {
  return (
    <div className="settings-panel">
      <div className="settings-card">
        <CardHead
          icon="card"
          iconVariant="orange"
          title="Gestionar suscripción"
          subtitle={<p className="settings-card__subtitle">Plan activo y facturas</p>}
        />

        <div className="settings-plan-badges">
          <span className="settings-badge settings-badge--orange">Plan Business</span>
          <span className="settings-badge settings-badge--blue">Prueba</span>
          <span className="settings-badge settings-badge--gray">Mensual</span>
        </div>

        <p className="settings-plan-detail">Período de prueba hasta el 10 ago 2026</p>
        <p className="settings-plan-detail settings-plan-detail--muted">0 de 1 locales activos</p>

        <div className="settings-plan-actions">
          <button type="button" className="settings-save-btn">Cambiar plan</button>
          <button type="button" className="settings-inline-link">Gestionar</button>
        </div>
      </div>

      <div className="settings-danger-card">
        <div>
          <h3 className="settings-danger-card__title">Suscripción</h3>
          <p className="settings-danger-card__text">Cancelá tu plan Business. Vas a mantener acceso hasta el fin del período actual.</p>
        </div>
        <button type="button" className="settings-danger-btn">Cancelar suscripción</button>
      </div>

      <div className="settings-card">
        <CardHead
          icon="fileText"
          iconVariant="navy"
          title="Historial de facturas"
          subtitle={<p className="settings-card__subtitle">Tus pagos a Linkstar Business y los PDFs descargables.</p>}
        />

        <div className="settings-invoices">
          {INVOICES.map((inv) => (
            <div key={inv.id} className="settings-invoice-row">
              <div className="settings-invoice-row__icon"><Icon name="card" width={16} height={16} /></div>
              <div className="settings-invoice-row__body">
                <div className="settings-invoice-row__period">{inv.period}</div>
                <div className="settings-invoice-row__date">{inv.date}</div>
              </div>
              <span className="settings-invoice-row__status">
                <Icon name="check" width={13} height={13} /> {inv.status}
              </span>
              <span className="settings-invoice-row__amount">{inv.amount}</span>
              <button type="button" className="settings-invoice-row__download" aria-label="Descargar factura">
                <Icon name="download" />
              </button>
            </div>
          ))}
        </div>
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
export default function SettingsPage({ initialTab }) {
  const resolvedInitial = TAB_ALIASES[initialTab] || initialTab || 'local';
  const [tab, setTab] = useState(resolvedInitial);

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
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} width={15} height={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'local' && <LocalTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'billing' && <BillingTab />}
      {tab === 'legal' && <LegalTab />}
    </div>
  );
}
