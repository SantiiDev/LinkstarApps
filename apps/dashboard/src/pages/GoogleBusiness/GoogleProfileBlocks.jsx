import Icon from '../../components/Icon/Icon';
import SelectField from '../../components/Select/SelectField';
import { formatRelativeTime } from '../../lib/dashboardApi';
import {
  DAYS,
  FIELD_LABELS,
  OPEN_STATUS,
  SOCIAL,
  WHATSAPP_ATTRIBUTE,
  attributeGroupIcon,
  attributeHint,
  attributeState,
  describeValue,
  hoursLabel,
} from '../../lib/googleProfile';

/*
 * Perfil de la ficha, sólo presentación. Lo usan la pantalla real
 * (GoogleProfileScreen, que lee y edita en Google), su maqueta de GoogleGate
 * (GoogleProfileMockup) y la de BusinessLock (GoogleProfileBusinessPreview), así
 * las tres se ven idénticas — el mismo patrón que GoogleMetricsBlocks.
 */

/* El mismo selector de local que Mi Empresa y Métricas, aunque haya una sola ficha. */
export function ProfileToolbar({ options, selected, onSelect, onEdit }) {
  return (
    <div className="gb-card gbp-toolbar">
      <SelectField label="Local" icon="store" value={selected ?? ''} onChange={onSelect} options={options} />
      {onEdit && (
        <button type="button" className="gb-btn-primary gbp-edit-btn" onClick={onEdit}>
          <Icon name="pen" size={15} />
          Editar perfil
        </button>
      )}
    </div>
  );
}

function Card({ icon, title, children }) {
  return (
    <div className="gb-card gbp-card">
      <div className="gbp-card__head">
        <h3 className="gb-card__title"><span className="gbp-card__icon"><Icon name={icon} size={17} /></span>{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* Un dato de la ficha: etiqueta arriba, valor abajo, con ícono opcional. Vacío,
   «No especificado» en gris. */
function Field({ label, icon, children }) {
  const empty = children == null || children === '';
  return (
    <div className="gbp-field">
      <span className="gbp-field__label">
        {icon && <Icon name={icon} size={13} />}
        {label}
      </span>
      <span className={`gbp-field__value${empty ? ' gbp-field__value--empty' : ''}`}>
        {empty ? 'No especificado' : children}
      </span>
    </div>
  );
}

const ExternalLink = ({ href }) => (
  <a className="gbp-link" href={href} target="_blank" rel="noopener noreferrer">{href}</a>
);

/* Las cinco tarjetas de la ficha, de sólo lectura (se edita desde «Editar
   perfil»). `data`: { profile, attributes, attributesError }, la respuesta de
   GET /api/google/locations/:id/profile. */
export function ProfileDetails({ data }) {
  const p = data.profile;
  const links = data.attributes.filter((a) => a.valueType === 'URL');
  const whatsapp = links.find((l) => l.name === WHATSAPP_ATTRIBUTE);
  const socials = links.filter((l) => l.name !== WHATSAPP_ATTRIBUTE);
  const groups = data.attributes
    .filter((a) => a.valueType === 'BOOL')
    .reduce((acc, a) => {
      (acc[a.group] ??= []).push(a);
      return acc;
    }, {});

  return (
    <>
      <Card icon="pin" title="Información del negocio">
        <div className="gbp-fields">
          <Field label="Nombre">{p.title || '—'}</Field>
          <Field label="Dirección">
            {p.address || '—'}
            <small className="gbp-field__note">Para cambiarla, hacelo en Google: dispara una nueva verificación.</small>
          </Field>
          <Field label="Estado">{OPEN_STATUS[p.openStatus] ?? '—'}</Field>
        </div>
        <Field label="Descripción">{p.description || 'Sin descripción'}</Field>
        {p.mapsUri && (
          <a className="gbp-link gbp-link--icon" href={p.mapsUri} target="_blank" rel="noopener noreferrer">
            <Icon name="externalLink" size={13} />
            Ver en Google Maps
          </a>
        )}
      </Card>

      <Card icon="phone" title="Información de contacto">
        <div className="gbp-fields">
          <Field label="Teléfono principal" icon="phone">{p.primaryPhone}</Field>
          <Field label="Teléfono secundario" icon="phone">{p.additionalPhones.join(', ')}</Field>
          <Field label="Sitio web" icon="globe">{p.websiteUri && <ExternalLink href={p.websiteUri} />}</Field>
          {whatsapp && (
            <Field label="WhatsApp" icon="whatsapp">{whatsapp.uri && <ExternalLink href={whatsapp.uri} />}</Field>
          )}
        </div>
        {socials.length > 0 && (
          <>
            <span className="gbp-subtitle gbp-subtitle--rule">Redes sociales</span>
            <div className="gbp-fields">
              {socials.map((l) => (
                <Field key={l.name} label={SOCIAL[l.name]?.label ?? l.displayName} icon={SOCIAL[l.name]?.icon ?? 'globe'}>
                  {l.uri && <ExternalLink href={l.uri} />}
                </Field>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card icon="clock" title="Horario de apertura">
        {p.regularHours?.periods?.length ? (
          <div className="gbp-hours">
            {DAYS.map(([d, label]) => {
              const value = hoursLabel(p.regularHours, d);
              return (
                <div key={d} className="gbp-hours__row">
                  <span>{label}</span>
                  <span className={value ? '' : 'gbp-closed'}>{value ?? 'Cerrado'}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="gbp-hint">Tu ficha no tiene horario cargado. Agregarlo ayuda a que Google te muestre más.</p>
        )}
      </Card>

      <Card icon="tag" title="Categorías del negocio">
        <div className="gbp-tags">
          {p.primaryCategory && <span className="gbp-tag gbp-tag--main">★ {p.primaryCategory}</span>}
          {p.additionalCategories.map((c) => <span key={c} className="gbp-tag">{c}</span>)}
          {!p.primaryCategory && <span className="gbp-hint">Sin categoría.</span>}
        </div>
        <small className="gbp-field__note">★ categoría principal. Por ahora las categorías se cambian desde Google.</small>
      </Card>

      {/* Siempre se ve: vacía dice por qué (Google no habilita atributos para el
          rubro, o no pudimos leerlos) en vez de desaparecer. */}
      <Card icon="accessibility" title="Accesibilidad y comodidades">
        {data.attributesError && (
          <p className="gbp-hint">No pudimos leer los atributos de tu ficha en Google. Probá recargar la página.</p>
        )}
        {!data.attributesError && !Object.keys(groups).length && (
          <p className="gbp-hint">Google no habilita atributos de este tipo para el rubro de tu ficha.</p>
        )}
        {Object.entries(groups).map(([group, attrs]) => (
          <div key={group} className="gbp-attr-group">
            <span className="gbp-subtitle">{group}</span>
            {attrs.map((a) => (
              <div key={a.name} className="gbp-attr">
                <span className="gbp-attr__icon"><Icon name={attributeGroupIcon(group)} size={15} /></span>
                <span className="gbp-attr__text">
                  <span className="gbp-attr__name">{a.displayName}</span>
                  <span className="gbp-attr__hint">{attributeHint(a)}</span>
                </span>
                {/* Sólo lectura: se cambia desde «Editar perfil». */}
                <span className={`gbp-pill gbp-pill--${attributeState(a.value).tone}`}>
                  {attributeState(a.value).label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </Card>
    </>
  );
}

/*
 * La tarjeta de Protección de ficha. La pantalla real la carga y resuelve
 * (ProtectionCard en GoogleProfileScreen); las maquetas le pasan cambios
 * inventados.
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
