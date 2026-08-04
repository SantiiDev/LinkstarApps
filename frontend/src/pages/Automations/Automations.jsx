import { useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import StatCard from '../../components/StatCard/StatCard';
import './Automations.css';

const INITIAL_AUTOMATIONS = [
  {
    id: 'auto-reply-5',
    title: 'Responder automáticamente reseñas de 5 estrellas',
    text: 'Genera y publica un agradecimiento con IA apenas llega una reseña de 5 estrellas.',
    icon: 'star',
    enabled: true,
  },
  {
    id: 'alert-negative',
    title: 'Alertar ante reseñas negativas',
    text: 'Te enviamos un email y una notificación en el panel cuando llega una reseña de 1 o 2 estrellas.',
    icon: 'alert',
    enabled: true,
  },
  {
    id: 'weekly-summary',
    title: 'Resumen semanal por email',
    text: 'Recibí todos los lunes un resumen de reseñas, escaneos y ranking de empleados.',
    icon: 'mail',
    enabled: true,
  },
  {
    id: 'inactive-device',
    title: 'Aviso de dispositivo inactivo',
    text: 'Alertá al equipo si un dispositivo NFC o QR no registra escaneos en 48 hs.',
    icon: 'cpu',
    enabled: false,
  },
  {
    id: 'monthly-pdf',
    title: 'Envío automático del informe mensual',
    text: 'Enviá por email el informe mensual en PDF a los administradores el día 1 de cada mes.',
    icon: 'fileText',
    enabled: true,
  },
  {
    id: 'employee-goal',
    title: 'Felicitar objetivo de empleados',
    text: 'Notificá automáticamente cuando un empleado alcanza su meta mensual de reseñas.',
    icon: 'award',
    enabled: false,
  },
];

function Icon({ name, ...rest }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  const icons = {
    star: <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
    alert: <svg {...props}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
    mail: <svg {...props}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>,
    cpu: <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></svg>,
    fileText: <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
    award: <svg {...props}><circle cx="12" cy="8" r="6" /><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" /></svg>,
    zap: <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  };
  return icons[name] || null;
}

export default function Automations() {
  const [automations, setAutomations] = useState(INITIAL_AUTOMATIONS);
  const activeCount = automations.filter((a) => a.enabled).length;

  function toggle(id) {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }

  return (
    <div className="automations-page">
      <PageHeader
        eyebrow="Automatizaciones"
        title="Automatizaciones"
        subtitle="Dejá que Linkstar trabaje por vos: respuestas, alertas y reportes automáticos"
      />

      <div className="automations-stat-grid">
        <StatCard icon={<Icon name="zap" />} value={activeCount} label="Automatizaciones activas" color="orange" />
        <StatCard icon={<Icon name="star" />} value="34" label="Respuestas con IA este mes" color="gold" />
        <StatCard icon={<Icon name="alert" />} value="3" label="Alertas enviadas esta semana" color="forest" />
        <StatCard icon={<Icon name="mail" />} value="4" label="Resúmenes enviados" color="navy" />
      </div>

      <div className="automations-list">
        {automations.map((a) => (
          <div key={a.id} className={`automation-card ${a.enabled ? 'automation-card--on' : ''}`}>
            <div className={`automation-card__icon ${a.enabled ? 'automation-card__icon--on' : ''}`}>
              <Icon name={a.icon} />
            </div>
            <div className="automation-card__body">
              <div className="automation-card__title">{a.title}</div>
              <p className="automation-card__text">{a.text}</p>
            </div>
            <button
              className={`automation-toggle ${a.enabled ? 'automation-toggle--on' : ''}`}
              onClick={() => toggle(a.id)}
              role="switch"
              aria-checked={a.enabled}
              aria-label={a.title}
            >
              <span className="automation-toggle__knob" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
