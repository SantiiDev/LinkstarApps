import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import { useOrg } from '../../context/OrgContext';
import {
  DEFAULT_PREFERENCES,
  fetchNotificationPreferences,
  saveNotificationPreferences,
  fetchNotificationLog,
  describeNotification,
  notificationsErrorMessage,
} from '../../lib/notificationsApi';
import './Automations.css';

/*
 * Automatizaciones — la mitad que existe de verdad, y la que no.
 *
 * REAL desde octubre de 2026, sobre la 0023:
 *   - "Expositor sin escaneos" y "Resumen semanal". Salen sólo de escaneos, no
 *     necesitan Google, y corren para TODOS los planes (decisión del 6 oct).
 *   - Los interruptores escriben notification_preferences; lo que decide qué se
 *     manda es private.pending_notifications(), y quien lo manda es
 *     services/api/scripts/send-alerts.js, una vez por día (npm run daily).
 *   - "Últimos avisos enviados" lee notification_log, que sólo tiene envíos
 *     reales: send-alerts.js registra después de que el proveedor aceptó.
 *
 * EN DESARROLLO, sin interruptor: lo que va con IA o con reseñas. Antes esta
 * pantalla tenía interruptores que se prendían y apagaban sin guardar ni
 * ejecutar nada, que es peor que un número inventado: el cliente cree que dejó
 * algo activado. Por eso esas tarjetas no tienen switch, y no lo van a tener
 * hasta que haya algo que lo ejecute.
 *
 * Sólo owner y admin ven y cambian las preferencias (RLS de la 0023). Un
 * manager no puede ni leerlas: su consulta vuelve vacía, y mostrarle los
 * valores por defecto como si fueran los de la cuenta sería mentirle, así que
 * ve un aviso en su lugar.
 *
 * La maqueta anterior (con estadísticas inventadas) sigue en el tag:
 *   git show maquetas-pre-fase-2:apps/dashboard/src/pages/Automations/Automations.jsx
 */

const IDLE_HOUR_OPTIONS = [
  { value: 12, label: '12 horas' },
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas' },
  { value: 72, label: '3 días' },
  { value: 168, label: '1 semana' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const IN_DEVELOPMENT = [
  {
    id: 'auto-reply-5',
    icon: 'star',
    title: 'Responder solas las reseñas de cinco estrellas',
    text: 'Un agradecimiento escrito con IA, con el tono de tu negocio, publicado apenas entra la reseña.',
  },
  {
    id: 'alert-negative',
    icon: 'alert',
    title: 'Alerta de reseña negativa',
    text: 'Un aviso apenas llega una reseña de 1 o 2 estrellas, con una respuesta sugerida para revisar.',
  },
  {
    id: 'monthly-pdf',
    icon: 'fileText',
    title: 'Informe mensual en PDF',
    text: 'El resumen del mes por sucursal, a tu mail el día 1.',
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
    lock: <svg {...props}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  };
  return icons[name] || null;
}

function Toggle({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      className={`automation-toggle ${on ? 'automation-toggle--on' : ''}`}
      onClick={() => onChange(!on)}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span className="automation-toggle__knob" />
    </button>
  );
}

function formatSentAt(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).replace('.', '');
}

/* Lo que se compara para saber si hay cambios sin guardar. */
function editable(prefs) {
  return JSON.stringify({
    device_idle_enabled: Boolean(prefs.device_idle_enabled),
    device_idle_hours: Number(prefs.device_idle_hours),
    weekly_summary_enabled: Boolean(prefs.weekly_summary_enabled),
    recipient_email: (prefs.recipient_email ?? '').trim(),
  });
}

export default function Automations() {
  const { org, canManageBilling, loading: orgLoading } = useOrg();
  const orgId = org?.organization_id;

  const [saved, setSaved] = useState(null);       // lo que está en la base
  const [draft, setDraft] = useState(null);       // lo que está en pantalla
  const [hasRow, setHasRow] = useState(false);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [justSaved, setJustSaved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (orgLoading || !orgId || !canManageBilling) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchNotificationPreferences(orgId),
      // El registro es secundario: si falla, la pantalla sigue sirviendo para
      // configurar.
      fetchNotificationLog(orgId).catch((err) => {
        console.error('No se pudo leer el registro de avisos:', err);
        return [];
      }),
    ])
      .then(([{ prefs, saved: exists }, rows]) => {
        if (cancelled) return;
        setSaved(prefs);
        setDraft({ ...prefs, recipient_email: prefs.recipient_email ?? '' });
        setHasRow(exists);
        setLog(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('No se pudieron leer las preferencias de avisos:', err);
        setLoadError('No pudimos leer la configuración de tus avisos.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, canManageBilling, orgLoading, reloadKey]);

  const email = (draft?.recipient_email ?? '').trim();
  const emailInvalid = email !== '' && !EMAIL_RE.test(email);
  const dirty = Boolean(draft && saved) && editable(draft) !== editable(saved);

  const hourOptions = useMemo(() => {
    const current = Number(draft?.device_idle_hours ?? DEFAULT_PREFERENCES.device_idle_hours);
    if (IDLE_HOUR_OPTIONS.some((o) => o.value === current)) return IDLE_HOUR_OPTIONS;
    return [...IDLE_HOUR_OPTIONS, { value: current, label: `${current} horas` }].sort((a, b) => a.value - b.value);
  }, [draft?.device_idle_hours]);

  function update(patch) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setJustSaved(false);
    setSaveError(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!dirty || emailInvalid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const row = await saveNotificationPreferences(orgId, draft);
      setSaved(row);
      setDraft({ ...row, recipient_email: row.recipient_email ?? '' });
      setHasRow(true);
      setJustSaved(true);
    } catch (err) {
      console.error('No se pudieron guardar las preferencias de avisos:', err);
      setSaveError(notificationsErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="automations-page">
      <PageHeader
        eyebrow="Automatizaciones"
        title="Automatizaciones"
        subtitle="Avisos por mail que salen solos, para que no tengas que entrar a mirar"
      />

      <section className="automations-section" aria-labelledby="automations-alerts-title">
        <h2 id="automations-alerts-title" className="automations-section__title">Avisos por mail</h2>
        <p className="automations-section__lede">
          Se revisan una vez por día, a la mañana. Están incluidos en todos los planes.
        </p>

        {orgLoading ? (
          <p className="automations-muted">Cargando…</p>
        ) : !canManageBilling ? (
          <div className="automations-notice">
            <Icon name="lock" />
            <p>
              Sólo el propietario o un administrador de la cuenta pueden ver y cambiar los avisos.
              Si necesitás recibirlos, pedile a alguno de ellos que los configure.
            </p>
          </div>
        ) : loading ? (
          <p className="automations-muted">Cargando tus avisos…</p>
        ) : loadError ? (
          <div className="automations-notice automations-notice--error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="automations-link" onClick={() => setReloadKey((k) => k + 1)}>
              Reintentar
            </button>
          </div>
        ) : (
          <form className="automations-list" onSubmit={handleSave} noValidate>
            <div className={`automation-card ${draft.device_idle_enabled ? 'automation-card--on' : ''}`}>
              <div className={`automation-card__icon ${draft.device_idle_enabled ? 'automation-card__icon--on' : ''}`}>
                <Icon name="cpu" />
              </div>
              <div className="automation-card__body">
                <div className="automation-card__title">Expositor sin escaneos</div>
                <p className="automation-card__text">
                  Te escribimos si un expositor activo pasa este tiempo sin un solo escaneo. Casi siempre es
                  uno que quedó guardado o fuera de la vista del cliente.
                </p>
                <label className="automations-inline-field">
                  <span>Avisar después de</span>
                  <select
                    value={draft.device_idle_hours}
                    onChange={(e) => update({ device_idle_hours: Number(e.target.value) })}
                    disabled={!draft.device_idle_enabled}
                  >
                    {hourOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <Toggle
                on={draft.device_idle_enabled}
                onChange={(on) => update({ device_idle_enabled: on })}
                label="Aviso de expositor sin escaneos"
              />
            </div>

            <div className={`automation-card ${draft.weekly_summary_enabled ? 'automation-card--on' : ''}`}>
              <div className={`automation-card__icon ${draft.weekly_summary_enabled ? 'automation-card__icon--on' : ''}`}>
                <Icon name="mail" />
              </div>
              <div className="automation-card__body">
                <div className="automation-card__title">Resumen semanal</div>
                <p className="automation-card__text">
                  Una vez por semana: los escaneos de los últimos 7 días, comparados con la semana anterior.
                </p>
              </div>
              <Toggle
                on={draft.weekly_summary_enabled}
                onChange={(on) => update({ weekly_summary_enabled: on })}
                label="Resumen semanal por mail"
              />
            </div>

            <div className="automations-recipient">
              <label className="automations-field">
                <span>Mandar los avisos a</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={draft.recipient_email}
                  onChange={(e) => update({ recipient_email: e.target.value })}
                  placeholder="El mail de quien creó la cuenta"
                  aria-invalid={emailInvalid}
                />
              </label>
              <p className={`automations-hint ${emailInvalid ? 'automations-hint--error' : ''}`}>
                {emailInvalid
                  ? 'Revisá el mail: no parece una dirección válida.'
                  : 'Si lo dejás vacío, los avisos van al mail de quien creó la cuenta.'}
              </p>
            </div>

            <div className="automations-actions">
              <span className="automations-status" role="status">
                {saveError
                  ? <span className="automations-status--error">{saveError}</span>
                  : justSaved
                    ? 'Listo, guardado.'
                    : dirty
                      ? 'Tenés cambios sin guardar.'
                      : hasRow
                        ? ''
                        : 'Todavía no cambiaste nada: los avisos corren con esta configuración.'}
              </span>
              <button type="submit" className="automations-save" disabled={!dirty || emailInvalid || saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </section>

      {canManageBilling && !loading && !loadError && (
        <section className="automations-section" aria-labelledby="automations-log-title">
          <h2 id="automations-log-title" className="automations-section__title">Últimos avisos enviados</h2>
          {log.length === 0 ? (
            <p className="automations-muted">
              Todavía no te mandamos ningún aviso. Van a aparecer acá a medida que salgan.
            </p>
          ) : (
            <ul className="automations-log">
              {log.map((row) => (
                <li key={row.id} className="automations-log__row">
                  <span className="automations-log__what">{describeNotification(row)}</span>
                  <span className="automations-log__meta">
                    {row.recipient_email} · {formatSentAt(row.sent_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="automations-section" aria-labelledby="automations-dev-title">
        <h2 id="automations-dev-title" className="automations-section__title">En desarrollo</h2>
        <p className="automations-section__lede">
          Las automatizaciones con IA y sobre tus reseñas. No tienen interruptor porque todavía no hay nada
          que las ejecute: cuando estén listas, aparecen acá para activarlas.
        </p>
        <div className="automations-list">
          {IN_DEVELOPMENT.map((a) => (
            <div key={a.id} className="automation-card automation-card--soon">
              <div className="automation-card__icon"><Icon name={a.icon} /></div>
              <div className="automation-card__body">
                <div className="automation-card__title">
                  {a.title}
                  <span className="automation-card__badge">Próximamente</span>
                </div>
                <p className="automation-card__text">{a.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
