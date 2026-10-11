import { useState } from 'react';
import Icon from '../../components/Icon/Icon';
import SelectField from '../../components/Select/SelectField';
import Switch from '../../components/Switch/Switch';
import { AUTO_REPLY_DELAYS, PAST_REPLY_MAX, PAST_REPLY_STARS } from '../../lib/automationsApi';
import { isEmail } from '../../lib/notificationsApi';

/*
 * Automatizaciones, sólo presentación. Lo usan la pantalla (Automations.jsx, que
 * carga y guarda) y los `preview` de BusinessLock con datos inventados
 * (automationsSample.js), así lo borroso se ve igual que lo real — el patrón de
 * GoogleSeoBlocks y CompanyBlocks. Nada de acá lee ni escribe.
 */

/* La tarjeta de una regla: ícono, título, explicación, lo de adentro y el pie
   con sus botones y el estado del último guardado. */
export function RuleCard({ icon, tone = 'orange', title, text, active = false, children, footer, status }) {
  return (
    <section className={`auto-card${active ? ' auto-card--on' : ''}`}>
      <header className="auto-card__head">
        <span className={`auto-card__icon auto-card__icon--${tone}`}><Icon name={icon} size={20} /></span>
        <div className="auto-card__titles">
          <h2 className="auto-card__title">
            {title}
            {active && <span className="auto-pill auto-pill--on">Activa</span>}
          </h2>
          {text && <p className="auto-card__text">{text}</p>}
        </div>
      </header>
      {children && <div className="auto-card__body">{children}</div>}
      {(footer || status) && (
        <footer className="auto-card__foot">
          {status && (
            <span className={`auto-status${status.error ? ' auto-status--error' : ''}`} role="status">
              {status.text}
            </span>
          )}
          {footer && <div className="auto-card__actions">{footer}</div>}
        </footer>
      )}
    </section>
  );
}

/* Lista de mails o de palabras: se agrega con Enter, coma o «+», y se saca con ×. */
export function ChipInput({ label, values, onChange, placeholder, validate, max, hint, disabled = false }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  function add() {
    const items = text.split(',').map((v) => v.trim()).filter(Boolean);
    if (!items.length) return;
    const next = [...values];
    for (const item of items) {
      const problem = validate?.(item);
      if (problem) { setError(problem); return; }
      if (!next.some((v) => v.toLowerCase() === item.toLowerCase())) next.push(item);
    }
    if (max && next.length > max) { setError(`Hasta ${max}.`); return; }
    onChange(next);
    setText('');
    setError(null);
  }

  return (
    <div className="auto-field">
      <span className="auto-field__label">{label}</span>
      <div className="auto-chip-input">
        <input
          type="text"
          className="auto-input"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
          }}
          aria-invalid={Boolean(error)}
        />
        <button type="button" className="auto-add" onClick={add} disabled={disabled || !text.trim()} aria-label={`Agregar a ${label}`}>
          <Icon name="plus" size={15} />
        </button>
      </div>
      {values.length > 0 && (
        <ul className="auto-chips">
          {values.map((v) => (
            <li key={v} className="auto-chip">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                disabled={disabled}
                aria-label={`Quitar ${v}`}
              >
                <Icon name="close" size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(error || hint) && <p className={`auto-hint${error ? ' auto-hint--error' : ''}`}>{error || hint}</p>}
    </div>
  );
}

/* Botones de estrellas que se prenden y apagan, como los de Tapstar. */
export function StarPicker({ label, options, value, onChange, hint, disabled = false }) {
  return (
    <div className="auto-field">
      <span className="auto-field__label">{label}</span>
      <div className="auto-stars" role="group" aria-label={label}>
        {options.map((n) => {
          const on = value.includes(n);
          return (
            <button
              key={n}
              type="button"
              className={`auto-star${on ? ' auto-star--on' : ''}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(on ? value.filter((s) => s !== n) : [...value, n].sort())}
            >
              {n}★
            </button>
          );
        })}
      </div>
      {hint && <p className="auto-hint">{hint}</p>}
    </div>
  );
}

/* «Configurar automatizaciones de»: el local cuyas reglas se ven y se guardan. */
export function ScopeCard({ options, value, onChange }) {
  return (
    <div className="auto-card auto-scope">
      <SelectField
        label="Configurar automatizaciones de"
        icon="store"
        value={value}
        onChange={onChange}
        options={options}
      />
      <p className="auto-hint">
        La regla de un local tiene preferencia sobre la de «Todos los locales».
      </p>
    </div>
  );
}

/* Un aviso de que la tarjeta no depende del local elegido arriba. */
export function GlobalNote() {
  return (
    <p className="auto-note">
      <Icon name="info" size={14} />
      Esta alerta vale para todos tus locales.
    </p>
  );
}

/* ── Respuestas con IA (Business) ─────────────────────────────────────── */

export function PastRepliesCard({
  scopeLabel, count, onCount, stars, onStars, confirming, onAsk, onConfirm, onCancel, busy, status,
}) {
  const footer = confirming ? (
    <>
      <button type="button" className="auto-btn auto-btn--ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      <button type="button" className="auto-btn auto-btn--primary" onClick={onConfirm} disabled={busy}>
        {busy ? 'Respondiendo…' : 'Sí, responder'}
      </button>
    </>
  ) : (
    <button type="button" className="auto-btn auto-btn--primary" onClick={onAsk} disabled={busy || !(count >= 1)}>
      <Icon name="history" size={15} /> Responder ahora
    </button>
  );

  return (
    <RuleCard
      icon="history"
      tone="navy"
      title="Responder reseñas anteriores"
      text="Respondé de una vez tus últimas reseñas sin responder. La respuesta automática sólo actúa sobre las nuevas; esto cubre las que ya tenías."
      footer={footer}
      status={status}
    >
      <p className="auto-scope-line">Respondiendo reseñas de: <strong>{scopeLabel}</strong></p>
      <div className="auto-grid">
        <label className="auto-field">
          <span className="auto-field__label">Cuántas</span>
          <input
            type="number"
            className="auto-input"
            min={1}
            max={PAST_REPLY_MAX}
            value={count}
            onChange={(e) => onCount(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
        <SelectField label="Estrellas" icon="star" value={stars} onChange={onStars} options={PAST_REPLY_STARS} />
      </div>
      {confirming && (
        <p className="auto-confirm">
          Vamos a responder hasta <strong>{count}</strong> reseña{count === 1 ? '' : 's'} sin responder en Google,
          con tu tono de marca. Las respuestas se publican en tu ficha, a la vista de todos.
        </p>
      )}
    </RuleCard>
  );
}

export function AutoReplyCard({ rule, onChange, onToneSettings, savedEnabled, dirty, onSave, onDisable, saving, status }) {
  const canSave = rule.stars.length > 0;
  const footer = (
    <>
      {savedEnabled && (
        <button type="button" className="auto-btn auto-btn--ghost" onClick={onDisable} disabled={saving}>Desactivar</button>
      )}
      <button
        type="button"
        className="auto-btn auto-btn--primary"
        onClick={onSave}
        disabled={saving || !canSave || (savedEnabled && !dirty)}
      >
        {saving ? 'Guardando…' : savedEnabled ? 'Guardar cambios' : 'Activar regla'}
      </button>
    </>
  );

  return (
    <RuleCard
      icon="sparkles"
      title="Respuesta automática a reseñas"
      text="Cuando entra una reseña nueva, se responde sola según sus estrellas."
      active={savedEnabled}
      footer={footer}
      status={status}
    >
      <StarPicker
        label="Responder a reseñas de"
        options={[1, 2, 3, 4, 5]}
        value={rule.stars}
        onChange={(stars) => onChange({ stars })}
        hint="Elegí qué valoraciones se responden solas. Si preferís más control, dejá sólo 4★ y 5★."
      />
      <div className="auto-info">
        <Icon name="palette" size={15} />
        <p>
          Se usa el tono de marca de este local, o el general si no tiene uno.{' '}
          {onToneSettings && (
            <button type="button" className="auto-link" onClick={onToneSettings}>Configuralo en Tonos de marca</button>
          )}
        </p>
      </div>
      <p className="auto-hint">Responde siempre en el idioma de tu negocio.</p>
      <div className="auto-grid">
        <SelectField
          label="Retardo de respuesta"
          icon="clock"
          value={rule.delay}
          onChange={(delay) => onChange({ delay })}
          options={AUTO_REPLY_DELAYS}
        />
      </div>
    </RuleCard>
  );
}

function hoursLabel(minutes) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${String(hours).replace('.', ',')} h`;
}

/* Sin dato, «—»: un 0 que no se midió no tiene que parecer uno medido. */
export function AutoReplyStatsCard({ stats }) {
  return (
    <section className="auto-card auto-stats">
      <header className="auto-card__head">
        <span className="auto-card__icon auto-card__icon--orange"><Icon name="message" size={20} /></span>
        <div className="auto-card__titles">
          <h2 className="auto-card__title">Reseñas respondidas automáticamente</h2>
          <p className="auto-card__text">Lo que hizo la respuesta automática por vos.</p>
        </div>
      </header>
      <div className="auto-stats__grid">
        <div className="auto-stat">
          <strong>{stats?.replied ?? '—'}</strong>
          <span>reseñas respondidas</span>
        </div>
        <div className="auto-stat">
          <strong className="auto-stat__good">{hoursLabel(stats?.minutes_saved)}</strong>
          <span>tiempo ahorrado</span>
        </div>
      </div>
      <p className="auto-hint">Responder rápido mejora tu relevancia en Google Maps.</p>
    </section>
  );
}

/* ── Alertas por mail de reseñas (todos los planes, 0036) ───────────────── */

function alertFooter({ savedEnabled, dirty, canSave, saving, onSave, onDisable }) {
  return (
    <>
      {savedEnabled && (
        <button type="button" className="auto-btn auto-btn--ghost" onClick={onDisable} disabled={saving}>Desactivar</button>
      )}
      <button
        type="button"
        className="auto-btn auto-btn--primary"
        onClick={onSave}
        disabled={saving || !canSave || (savedEnabled && !dirty)}
      >
        {saving ? 'Guardando…' : savedEnabled ? 'Guardar cambios' : 'Activar regla'}
      </button>
    </>
  );
}

const RECIPIENTS_HINT = 'Si no agregás ninguno, le llega al mail de los avisos de la cuenta (abajo de todo).';

export function KeywordAlertCard({ draft, onChange, savedEnabled, dirty, saving, onSave, onDisable, status, globalNote, maxTerms, maxRecipients }) {
  return (
    <RuleCard
      icon="tag"
      tone="navy"
      title="Alerta por palabras clave"
      text="Te mandamos un mail cuando una reseña nueva menciona alguna de las palabras que elijas."
      active={savedEnabled}
      status={status}
      footer={alertFooter({ savedEnabled, dirty, saving, onSave, onDisable, canSave: draft.keyword_alert_terms.length > 0 })}
    >
      {globalNote && <GlobalNote />}
      <ChipInput
        label="Mails que reciben la alerta"
        values={draft.keyword_alert_recipients}
        onChange={(keyword_alert_recipients) => onChange({ keyword_alert_recipients })}
        placeholder="tu@email.com, otro@email.com…"
        validate={(v) => (isEmail(v) ? null : `«${v}» no parece un mail.`)}
        max={maxRecipients}
        hint={RECIPIENTS_HINT}
      />
      <ChipInput
        label="Palabras clave"
        values={draft.keyword_alert_terms}
        onChange={(keyword_alert_terms) => onChange({ keyword_alert_terms })}
        placeholder="Ej.: sucio, lento, espera…"
        validate={(v) => (v.length < 2 || v.length > 40 ? 'Cada palabra, de 2 a 40 letras.' : null)}
        max={maxTerms}
        hint="No importan mayúsculas ni tildes, y «lento» también encuentra «lentos»."
      />
    </RuleCard>
  );
}

export function LowRatingAlertCard({ draft, onChange, savedEnabled, dirty, saving, onSave, onDisable, status, globalNote, maxRecipients }) {
  return (
    <RuleCard
      icon="star"
      tone="red"
      title="Alerta por valoración baja"
      text="Te mandamos un mail cuando entra una reseña con la valoración que elijas, para responderla a tiempo."
      active={savedEnabled}
      status={status}
      footer={alertFooter({ savedEnabled, dirty, saving, onSave, onDisable, canSave: draft.low_rating_stars.length > 0 })}
    >
      {globalNote && <GlobalNote />}
      <ChipInput
        label="Mails que reciben la alerta"
        values={draft.low_rating_recipients}
        onChange={(low_rating_recipients) => onChange({ low_rating_recipients })}
        placeholder="tu@email.com, otro@email.com…"
        validate={(v) => (isEmail(v) ? null : `«${v}» no parece un mail.`)}
        max={maxRecipients}
        hint={RECIPIENTS_HINT}
      />
      <StarPicker
        label="Avisar cuando la reseña sea de"
        options={[1, 2, 3]}
        value={draft.low_rating_stars}
        onChange={(low_rating_stars) => onChange({ low_rating_stars })}
      />
    </RuleCard>
  );
}

/* ── Avisos de tus expositores (0023) ──────────────────────────────────── */

export function DeviceAlertsCard({ draft, onChange, hourOptions, dirty, saving, onSave, status, emailInvalid, globalNote }) {
  return (
    <RuleCard
      icon="device"
      title="Avisos de tus expositores"
      text="Para que no tengas que entrar a mirar: se revisan una vez por día, a la mañana."
      status={status}
      footer={(
        <button type="button" className="auto-btn auto-btn--primary" onClick={onSave} disabled={!dirty || emailInvalid || saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      )}
    >
      {globalNote && <GlobalNote />}
      <div className="auto-row">
        <div className="auto-row__text">
          <p className="auto-row__title">Expositor sin escaneos</p>
          <p className="auto-hint">
            Te escribimos si un expositor activo pasa este tiempo sin un solo escaneo. Casi siempre es uno que
            quedó guardado o fuera de la vista del cliente.
          </p>
          <div className="auto-row__field">
            <SelectField
              label="Avisar después de"
              icon="clock"
              value={draft.device_idle_hours}
              onChange={(device_idle_hours) => onChange({ device_idle_hours: Number(device_idle_hours) })}
              options={hourOptions}
              disabled={!draft.device_idle_enabled}
            />
          </div>
        </div>
        <Switch
          checked={draft.device_idle_enabled}
          onChange={(device_idle_enabled) => onChange({ device_idle_enabled })}
          label=""
        />
      </div>

      <div className="auto-row">
        <div className="auto-row__text">
          <p className="auto-row__title">Resumen semanal</p>
          <p className="auto-hint">Una vez por semana: los escaneos de los últimos 7 días, comparados con la semana anterior.</p>
        </div>
        <Switch
          checked={draft.weekly_summary_enabled}
          onChange={(weekly_summary_enabled) => onChange({ weekly_summary_enabled })}
          label=""
        />
      </div>

      <label className="auto-field">
        <span className="auto-field__label">Mandar los avisos a</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          className="auto-input"
          value={draft.recipient_email ?? ''}
          onChange={(e) => onChange({ recipient_email: e.target.value })}
          placeholder="El mail de quien creó la cuenta"
          aria-invalid={emailInvalid}
        />
      </label>
      <p className={`auto-hint${emailInvalid ? ' auto-hint--error' : ''}`}>
        {emailInvalid
          ? 'Revisá el mail: no parece una dirección válida.'
          : 'Si lo dejás vacío, van al mail de quien creó la cuenta. Las alertas de reseñas sin destinatarios propios también van acá.'}
      </p>
    </RuleCard>
  );
}
