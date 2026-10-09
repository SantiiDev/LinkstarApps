import Icon from '../../components/Icon/Icon';
import { formatRelativeTime } from '../../lib/dashboardApi';
import { FIELD_LABELS, describeValue } from '../../lib/googleProfile';

/*
 * La tarjeta de Protección de ficha, sólo presentación. La usan la pantalla
 * real (ProtectionCard en GoogleProfileScreen, que carga y resuelve) y la
 * maqueta de BusinessLock (GoogleProfileBusinessPreview), así las dos se ven
 * idénticas — el mismo patrón que GoogleMetricsBlocks.
 *
 * Lo que promete el encabezado es lo que hace el sistema: revisamos una vez por
 * día (job diario), avisamos por mail y el dueño decide. NUNCA revierte solo: si
 * el cambio lo hizo el dueño desde Google, revertirlo le pisaría su propia
 * edición (CLAUDE.md). No copiar el «lo deshacemos en minutos, sin que hagas
 * nada» de Tapstar.
 */

const RESOLVED = {
  reverted: { label: 'Revertido', tone: 'good' },
  accepted: { label: 'Aceptado', tone: 'neutral' },
  cleared: { label: 'Google lo retiró', tone: 'muted' },
};

function ChangeItem({ change, canEdit, busy, onResolve }) {
  const pending = change.status === 'pending';
  const state = pending ? { label: 'Sin revisar', tone: 'warn' } : RESOLVED[change.status];
  const fields = change.fields ?? [];

  return (
    <div className={`gbp-change${pending ? ' gbp-change--pending' : ''}`}>
      <div className="gbp-change__head">
        <strong>{fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}</strong>
        <span className="gbp-change__meta">
          {state && <span className={`gbp-badge gbp-badge--${state.tone}`}>{state.label}</span>}
          {formatRelativeTime(pending ? change.detected_at : (change.resolved_at ?? change.detected_at))}
        </span>
      </div>
      {fields.map((f) => (
        <div key={f} className="gbp-change__diff">
          {fields.length > 1 && <span className="gbp-change__field">{FIELD_LABELS[f] ?? f}</span>}
          <span>Tenías: <b>{describeValue(f, change.owner_values?.[f])}</b></span>
          <span>Google publicó: <b>{describeValue(f, change.google_values?.[f])}</b></span>
        </div>
      ))}
      {pending && canEdit && (
        <div className="gbp-change__actions">
          <button type="button" className="gbp-btn-ghost" disabled={busy} onClick={() => onResolve(change, 'accept')}>
            Está bien
          </button>
          <button type="button" className="gb-btn-primary" disabled={busy} onClick={() => onResolve(change, 'revert')}>
            {busy ? 'Deshaciendo…' : 'Revertir'}
          </button>
        </div>
      )}
    </div>
  );
}

/* `changes`: { pending, resolved } (fetchProfileChanges), o null mientras carga. */
export function ProtectionBlock({ changes, canEdit, busyId, error, onResolve }) {
  const pending = changes?.pending ?? [];
  const resolved = changes?.resolved ?? [];

  return (
    <div className="gb-card gbp-protect">
      <div className="gbp-hero">
        <span className="gbp-hero__icon"><Icon name="shield" size={22} /></span>
        <div className="gbp-hero__body">
          <span className="gbp-hero__eyebrow">Protección de ficha</span>
          <p className="gbp-hero__title">Si Google cambia tu ficha, te enterás y lo deshacés</p>
          <p className="gbp-hero__text">
            Cualquiera puede sugerirle a Google otro teléfono, otro horario o que cerraste, y a veces Google lo
            publica sin avisarte. Tus clientes llaman a otro número o creen que ya no abrís.
          </p>
          <ul className="gbp-hero__points">
            <li><Icon name="clock" size={15} />Revisamos tu ficha todos los días</li>
            <li><Icon name="bell" size={15} />Te avisamos por mail</li>
            <li><Icon name="refresh" size={15} />Lo deshacés con un botón</li>
          </ul>
        </div>
      </div>

      <p className="gbp-section-title">Cambios detectados</p>
      {error && <p className="gbm-error">{error}</p>}
      {!error && changes === null && <p className="gbm-muted">Cargando…</p>}
      {changes && !pending.length && !resolved.length && (
        <p className="gbp-ok"><Icon name="check" size={15} />No detectamos cambios de Google en tu ficha.</p>
      )}
      {[...pending, ...resolved].map((c) => (
        <ChangeItem key={c.id} change={c} canEdit={canEdit} busy={busyId === c.id} onResolve={onResolve} />
      ))}
    </div>
  );
}
