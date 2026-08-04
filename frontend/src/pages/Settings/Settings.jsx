import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader/PageHeader';
import EmployeesPage from '../Employees/Employees';
import LocationsPage from '../Locations/Locations';
import './Settings.css';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'employees', label: 'Empleados' },
  { id: 'locations', label: 'Ubicaciones' },
  { id: 'billing', label: 'Facturación' },
];

function Icon({ name, ...rest }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    check: <svg {...props}><polyline points="20 6 9 17 4 12" /></svg>,
    card: <svg {...props}><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
    download: <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  };
  return icons[name] || null;
}

function GeneralTab() {
  const { user } = useAuth();
  const fullName = user?.user_metadata?.full_name || '';

  return (
    <div className="settings-panel">
      <div className="settings-card">
        <h3 className="settings-card__title">Datos de la empresa</h3>
        <p className="settings-card__subtitle">Esta información se usa en tus informes y en el perfil de tu cuenta.</p>

        <div className="settings-form-grid">
          <label className="settings-field">
            <span>Nombre del negocio</span>
            <input type="text" defaultValue="Linkstar" />
          </label>
          <label className="settings-field">
            <span>Nombre del responsable</span>
            <input type="text" defaultValue={fullName} />
          </label>
          <label className="settings-field">
            <span>Email de contacto</span>
            <input type="email" defaultValue={user?.email || ''} />
          </label>
          <label className="settings-field">
            <span>Teléfono</span>
            <input type="tel" defaultValue="+54 11 4567-8901" />
          </label>
          <label className="settings-field settings-field--full">
            <span>Rubro</span>
            <input type="text" defaultValue="Cafetería / Gastronomía" />
          </label>
        </div>

        <button className="settings-save-btn">Guardar cambios</button>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Notificaciones</h3>
        <p className="settings-card__subtitle">Elegí cómo querés que te avisemos sobre novedades importantes.</p>
        <div className="settings-checkbox-list">
          <label className="settings-checkbox"><input type="checkbox" defaultChecked /> Reseñas nuevas</label>
          <label className="settings-checkbox"><input type="checkbox" defaultChecked /> Reseñas negativas</label>
          <label className="settings-checkbox"><input type="checkbox" /> Novedades del producto</label>
        </div>
      </div>
    </div>
  );
}

const INVOICES = [
  { id: 1, period: 'Julio 2026', amount: '$14.999', status: 'Pagada', date: '1 Ago 2026' },
  { id: 2, period: 'Junio 2026', amount: '$14.999', status: 'Pagada', date: '1 Jul 2026' },
  { id: 3, period: 'Mayo 2026', amount: '$14.999', status: 'Pagada', date: '1 Jun 2026' },
];

function BillingTab() {
  return (
    <div className="settings-panel">
      <div className="settings-card settings-plan-card">
        <div>
          <span className="settings-plan-card__eyebrow">Plan actual</span>
          <h3 className="settings-plan-card__name">Linkstar Pro</h3>
          <p className="settings-card__subtitle">Dispositivos ilimitados · Reportes avanzados · Automatizaciones con IA</p>
        </div>
        <button className="settings-save-btn">Cambiar de plan</button>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Historial de facturación</h3>
        <div className="settings-invoices">
          {INVOICES.map((inv) => (
            <div key={inv.id} className="settings-invoice-row">
              <div className="settings-invoice-row__icon"><Icon name="card" /></div>
              <div className="settings-invoice-row__body">
                <div className="settings-invoice-row__period">{inv.period}</div>
                <div className="settings-invoice-row__date">Emitida el {inv.date}</div>
              </div>
              <span className="settings-invoice-row__status">
                <Icon name="check" width={13} height={13} /> {inv.status}
              </span>
              <span className="settings-invoice-row__amount">{inv.amount}</span>
              <button className="settings-invoice-row__download" aria-label="Descargar factura">
                <Icon name="download" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage({ initialTab }) {
  const [tab, setTab] = useState(initialTab || 'general');

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="Configuración"
        title="Configuración"
        subtitle="Administrá los datos de tu empresa, tu equipo y tus sucursales"
      />

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-tab ${tab === t.id ? 'settings-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab />}
      {tab === 'employees' && <div className="settings-embedded-page"><EmployeesPage /></div>}
      {tab === 'locations' && <div className="settings-embedded-page"><LocationsPage /></div>}
      {tab === 'billing' && <BillingTab />}
    </div>
  );
}
