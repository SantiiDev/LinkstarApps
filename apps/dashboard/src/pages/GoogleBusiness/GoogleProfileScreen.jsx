import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import Select from '../../components/Select/Select';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import { useOrg } from '../../context/OrgContext';
import { formatRelativeTime } from '../../lib/dashboardApi';
import {
  fetchGoogleLocations,
  fetchGoogleProfile,
  fetchProfileChanges,
  resolveProfileChange,
  updateGoogleProfile,
} from '../../lib/googleApi';
import { ProtectionPreview } from './GoogleProfileBusinessPreview';
import './GoogleBusiness.css';
import './GoogleProfile.css';

/*
 * Perfil de la ficha de Google — la pantalla real (fase 4.7).
 *
 * La ficha se lee EN VIVO por el API (GET /api/google/locations/:id/profile): es
 * una pantalla de edición y tiene que mostrar lo que Google tiene ahora, no lo
 * de anoche. Se edita con PATCH, que escribe sólo lo que cambió.
 *
 * Qué NO se edita acá, a propósito:
 *   - la dirección: cambiarla dispara una nueva verificación de la ficha en
 *     Google, así que se manda a Google con un link;
 *   - las categorías: necesitan un buscador contra el catálogo de Google;
 *   - un horario cortado (dos turnos el mismo día): el editor maneja un rango por
 *     día, y guardar uno cortado lo aplastaría. Se avisa y se edita en Google.
 *
 * La protección de ficha (Business, 0030) lee google_profile_changes con RLS; en
 * gratis va detrás de BusinessLock.
 */

const DAYS = [
  ['MONDAY', 'Lunes'], ['TUESDAY', 'Martes'], ['WEDNESDAY', 'Miércoles'], ['THURSDAY', 'Jueves'],
  ['FRIDAY', 'Viernes'], ['SATURDAY', 'Sábado'], ['SUNDAY', 'Domingo'],
];
const DAY_INDEX = Object.fromEntries(DAYS.map(([d], i) => [d, i]));

const OPEN_STATUS = {
  OPEN: 'Abierto',
  CLOSED_TEMPORARILY: 'Cerrado temporalmente',
  CLOSED_PERMANENTLY: 'Cerrado permanentemente',
};

const FIELD_LABELS = {
  title: 'Nombre',
  phoneNumbers: 'Teléfono',
  categories: 'Categoría',
  storefrontAddress: 'Dirección',
  websiteUri: 'Sitio web',
  regularHours: 'Horario',
  profile: 'Descripción',
  openInfo: 'Abierto / cerrado',
};

const SOCIAL_LABELS = {
  'attributes/url_facebook': 'Facebook',
  'attributes/url_instagram': 'Instagram',
  'attributes/url_twitter': 'Twitter / X',
  'attributes/url_youtube': 'YouTube',
  'attributes/url_linkedin': 'LinkedIn',
  'attributes/url_tiktok': 'TikTok',
  'attributes/url_pinterest': 'Pinterest',
  'attributes/url_whatsapp': 'WhatsApp',
};

const pad = (n) => String(n ?? 0).padStart(2, '0');
const hhmm = (t) => (t ? `${pad(t.hours)}:${pad(t.minutes)}` : '');
const toTime = (s) => {
  const [hours, minutes] = s.split(':').map(Number);
  return { hours, minutes };
};

/* Horario de Google → un rango por día, o `complex` si algún día tiene dos
   turnos (el editor no lo puede representar sin perder uno). */
function hoursToForm(regularHours) {
  const form = Object.fromEntries(DAYS.map(([d]) => [d, { closed: true, open: '09:00', close: '18:00' }]));
  let complex = false;
  const seen = new Set();
  for (const p of regularHours?.periods ?? []) {
    if (seen.has(p.openDay)) complex = true;
    seen.add(p.openDay);
    form[p.openDay] = { closed: false, open: hhmm(p.openTime), close: hhmm(p.closeTime) || '24:00' };
  }
  return { form, complex };
}

/* Un rango que cierra antes de abrir (22:00 → 02:00) cierra al día siguiente. */
function formToHours(form) {
  return {
    periods: DAYS.filter(([d]) => !form[d].closed).map(([d]) => {
      const crosses = form[d].close <= form[d].open;
      const closeDay = crosses ? DAYS[(DAY_INDEX[d] + 1) % 7][0] : d;
      return { openDay: d, openTime: toTime(form[d].open), closeDay, closeTime: toTime(form[d].close) };
    }),
  };
}

function hoursLabel(regularHours, day) {
  const periods = (regularHours?.periods ?? []).filter((p) => p.openDay === day);
  if (!periods.length) return null;
  return periods.map((p) => `${hhmm(p.openTime)}–${hhmm(p.closeTime) || '24:00'}`).join(', ');
}

/* Un valor de la ficha, en una línea legible, para mostrar un cambio de Google. */
function describeValue(field, value) {
  if (value == null) return '—';
  switch (field) {
    case 'phoneNumbers':
      return [value.primaryPhone, ...(value.additionalPhones ?? [])].filter(Boolean).join(', ') || '—';
    case 'websiteUri':
      return value || '—';
    case 'title':
      return value || '—';
    case 'profile':
      return value.description || '—';
    case 'openInfo':
      return OPEN_STATUS[value.status] ?? value.status ?? '—';
    case 'categories':
      return value.primaryCategory?.displayName ?? '—';
    case 'regularHours':
      return DAYS.map(([d, label]) => `${label.slice(0, 3)} ${hoursLabel(value, d) ?? 'cerrado'}`).join(' · ');
    case 'storefrontAddress':
      return [...(value.addressLines ?? []), value.locality].filter(Boolean).join(', ') || '—';
    default:
      return JSON.stringify(value);
  }
}

const svg = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const ICONS = {
  shield: <svg {...svg}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  pin: <svg {...svg}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
  phone: <svg {...svg}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
  clock: <svg {...svg}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  tag: <svg {...svg}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  check: <svg {...svg}><polyline points="20 6 9 17 4 12" /></svg>,
};

function Card({ icon, title, children, action }) {
  return (
    <div className="gb-card gbp-card">
      <div className="gbp-card__head">
        <h3 className="gb-card__title"><span className="gbp-card__icon">{icon}</span>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="gbp-field">
      <span className="gbp-field__label">{label}</span>
      <span className="gbp-field__value">{children}</span>
    </div>
  );
}

/* ─── Edición ──────────────────────────────────────────────────────────────── */

function EditProfileModal({ data, onClose, onSaved, googleLocationId }) {
  const initialHours = useMemo(() => hoursToForm(data.profile.regularHours), [data]);
  const links = data.attributes.filter((a) => a.valueType === 'URL');
  const bools = data.attributes.filter((a) => a.valueType === 'BOOL');

  const [form, setForm] = useState(() => ({
    description: data.profile.description ?? '',
    primaryPhone: data.profile.primaryPhone ?? '',
    additionalPhones: (data.profile.additionalPhones ?? []).join(', '),
    websiteUri: data.profile.websiteUri ?? '',
    hours: initialHours.form,
    links: Object.fromEntries(links.map((l) => [l.name, l.uri ?? ''])),
    bools: Object.fromEntries(bools.map((b) => [b.name, b.value])),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const setHour = (day, patch) => setForm((f) => ({ ...f, hours: { ...f.hours, [day]: { ...f.hours[day], ...patch } } }));

  async function handleSubmit(e) {
    e.preventDefault();
    const changes = {};
    if (form.description.trim() !== (data.profile.description ?? '')) changes.description = form.description.trim();

    const extra = form.additionalPhones.split(',').map((s) => s.trim()).filter(Boolean);
    if (form.primaryPhone.trim() !== (data.profile.primaryPhone ?? '')
        || extra.join(',') !== (data.profile.additionalPhones ?? []).join(',')) {
      changes.primaryPhone = form.primaryPhone.trim();
      changes.additionalPhones = extra.slice(0, 2);
    }
    if (form.websiteUri.trim() !== (data.profile.websiteUri ?? '')) changes.websiteUri = form.websiteUri.trim();

    if (!initialHours.complex && JSON.stringify(form.hours) !== JSON.stringify(initialHours.form)) {
      changes.regularHours = formToHours(form.hours);
    }

    const changedLinks = links
      .filter((l) => (form.links[l.name] ?? '').trim() !== (l.uri ?? ''))
      .map((l) => ({ name: l.name, uri: form.links[l.name].trim() }));
    if (changedLinks.length) changes.links = changedLinks;

    const changedBools = bools
      .filter((b) => form.bools[b.name] !== null && form.bools[b.name] !== b.value)
      .map((b) => ({ name: b.name, value: form.bools[b.name] }));
    if (changedBools.length) changes.attributes = changedBools;

    if (!Object.keys(changes).length) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateGoogleProfile(googleLocationId, changes);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gbp-modal-overlay" onClick={onClose}>
      <form className="gbp-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="gbp-modal__head">
          <h2>Editar perfil</h2>
          <button type="button" className="gbp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="gbp-modal__body">
          <p className="gbp-hint">
            Los cambios se publican en tu ficha de Google. Google puede tardar unos minutos en mostrarlos, o
            rechazarlos si no cumplen sus normas.
          </p>

          <label className="gbp-input">
            <span>Descripción <em>{form.description.length}/750</em></span>
            <textarea rows={4} maxLength={750} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>

          <div className="gbp-grid-2">
            <label className="gbp-input">
              <span>Teléfono principal</span>
              <input type="tel" value={form.primaryPhone}
                onChange={(e) => setForm((f) => ({ ...f, primaryPhone: e.target.value }))} />
            </label>
            <label className="gbp-input">
              <span>Teléfonos adicionales <em>separados por coma, hasta 2</em></span>
              <input type="text" value={form.additionalPhones}
                onChange={(e) => setForm((f) => ({ ...f, additionalPhones: e.target.value }))} />
            </label>
          </div>

          <label className="gbp-input">
            <span>Sitio web</span>
            <input type="url" placeholder="https://" value={form.websiteUri}
              onChange={(e) => setForm((f) => ({ ...f, websiteUri: e.target.value }))} />
          </label>

          <fieldset className="gbp-fieldset">
            <legend>Horario de apertura</legend>
            {initialHours.complex ? (
              <p className="gbp-hint">
                Tu ficha tiene horario cortado (dos turnos el mismo día). Para no perder un turno, editalo desde
                Google.
              </p>
            ) : (
              DAYS.map(([d, label]) => (
                <div key={d} className="gbp-hours-row">
                  <span>{label}</span>
                  <label className="gbp-check">
                    <input type="checkbox" checked={!form.hours[d].closed}
                      onChange={(e) => setHour(d, { closed: !e.target.checked })} />
                    Abierto
                  </label>
                  <input type="time" value={form.hours[d].open} disabled={form.hours[d].closed}
                    onChange={(e) => setHour(d, { open: e.target.value })} />
                  <input type="time" value={form.hours[d].close} disabled={form.hours[d].closed}
                    onChange={(e) => setHour(d, { close: e.target.value })} />
                </div>
              ))
            )}
          </fieldset>

          {links.length > 0 && (
            <fieldset className="gbp-fieldset">
              <legend>Redes sociales</legend>
              <div className="gbp-grid-2">
                {links.map((l) => (
                  <label key={l.name} className="gbp-input">
                    <span>{SOCIAL_LABELS[l.name] ?? l.displayName}</span>
                    <input type="url" placeholder="https://" value={form.links[l.name]}
                      onChange={(e) => setForm((f) => ({ ...f, links: { ...f.links, [l.name]: e.target.value } }))} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {bools.length > 0 && (
            <fieldset className="gbp-fieldset">
              <legend>Accesibilidad y comodidades</legend>
              <div className="gbp-grid-2">
                {bools.map((b) => (
                  <label key={b.name} className="gbp-check gbp-check--row">
                    <input type="checkbox" checked={form.bools[b.name] === true}
                      onChange={(e) => setForm((f) => ({ ...f, bools: { ...f.bools, [b.name]: e.target.checked } }))} />
                    {b.displayName}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error && <p className="gbm-error" role="alert">{error}</p>}
        </div>

        <div className="gbp-modal__foot">
          <button type="button" className="gbp-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="gb-btn-primary" disabled={saving}>
            {saving ? 'Guardando en Google…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Protección de ficha ──────────────────────────────────────────────────── */

function ProtectionCard({ orgId, googleLocationId, canEdit, onResolved }) {
  const [changes, setChanges] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetchProfileChanges(orgId, googleLocationId)
      .then(setChanges)
      .catch((err) => {
        console.error('No se pudieron leer los cambios de la ficha:', err);
        setError('No pudimos leer los cambios detectados.');
      });
  }, [orgId, googleLocationId]);

  useEffect(() => { load(); }, [load]);

  async function resolve(change, action) {
    setBusyId(change.id);
    setError(null);
    try {
      await resolveProfileChange(change.id, action);
      load();
      if (action === 'revert') onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="gb-card gbp-card gbp-protect">
      <div className="gbp-card__head">
        <h3 className="gb-card__title"><span className="gbp-card__icon">{ICONS.shield}</span>Protección de ficha</h3>
      </div>
      <p className="gbp-hint">
        Revisamos tu ficha todos los días. Si Google cambia tu teléfono, tu horario o te marca como cerrado por su
        cuenta, te avisamos por mail y lo podés deshacer desde acá.
      </p>
      {error && <p className="gbm-error">{error}</p>}
      {changes?.length === 0 && <p className="gbp-ok">No hay cambios de Google sin revisar.</p>}
      {changes?.map((c) => (
        <div key={c.id} className="gbp-change">
          <div className="gbp-change__head">
            <strong>Google cambió: {c.fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}</strong>
            <span>{formatRelativeTime(c.detected_at)}</span>
          </div>
          {c.fields.map((f) => (
            <div key={f} className="gbp-change__diff">
              <span className="gbp-change__field">{FIELD_LABELS[f] ?? f}</span>
              <span>Tenías: <b>{describeValue(f, c.owner_values?.[f])}</b></span>
              <span>Google muestra: <b>{describeValue(f, c.google_values?.[f])}</b></span>
            </div>
          ))}
          {canEdit && (
            <div className="gbp-change__actions">
              <button type="button" className="gbp-btn-ghost" disabled={busyId === c.id} onClick={() => resolve(c, 'accept')}>
                Está bien
              </button>
              <button type="button" className="gb-btn-primary" disabled={busyId === c.id} onClick={() => resolve(c, 'revert')}>
                {busyId === c.id ? 'Deshaciendo…' : 'Revertir'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Pantalla ─────────────────────────────────────────────────────────────── */

export default function GoogleProfileScreen({ google, onNavigateSettings }) {
  const { org } = useOrg();
  const orgId = org?.organization_id;

  const [fichas, setFichas] = useState(null);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    fetchGoogleLocations(orgId)
      .then((rows) => {
        const linked = rows.filter((f) => f.location_id);
        setFichas(linked);
        setSelected((prev) => prev ?? linked[0]?.id ?? null);
      })
      .catch((err) => {
        console.error('No se pudieron leer las fichas:', err);
        setError('No pudimos cargar tus fichas.');
      });
  }, [orgId]);

  const loadProfile = useCallback(() => {
    if (!selected) return;
    setData(null);
    setError(null);
    fetchGoogleProfile(selected).then(setData).catch((err) => setError(err.message));
  }, [selected]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const header = (
    <PageHeader eyebrow="Google Business" title="Perfil de negocio" subtitle="Gestioná la información de tu ficha de Google" />
  );

  const reauthNotice = google.connection?.status === 'needs_reauth' && (
    <div className="gbm-notice">
      <p>Google cortó el acceso a tu ficha. Para verla y editarla, volvé a conectarla.</p>
      <GoogleConnect google={google} align="start" />
    </div>
  );

  if (fichas && !fichas.length) {
    return (
      <div className="gb-page">
        {header}
        {reauthNotice}
        <div className="gb-card gbm-empty">
          <p className="gbm-empty__title">Todavía no vinculaste ninguna ficha a una sucursal</p>
          <p>Elegí cuál de tus fichas de Google corresponde a cada sucursal para poder verla y editarla desde acá.</p>
          {onNavigateSettings && (
            <button type="button" className="gb-btn-primary" onClick={() => onNavigateSettings('local')}>
              Vincular en Gestión local
            </button>
          )}
        </div>
      </div>
    );
  }

  const options = (fichas ?? []).map((f) => ({ value: f.id, label: f.locations?.name ?? f.title ?? 'Ficha' }));
  const p = data?.profile;
  const links = (data?.attributes ?? []).filter((a) => a.valueType === 'URL');
  const groups = (data?.attributes ?? [])
    .filter((a) => a.valueType === 'BOOL')
    .reduce((acc, a) => {
      (acc[a.group] ??= []).push(a);
      return acc;
    }, {});

  return (
    <div className="gb-page">
      {header}
      {reauthNotice}

      <div className="gb-card gbp-toolbar">
        {options.length > 1 ? (
          <label className="gbm-field">
            <span>Sucursal</span>
            <Select value={selected ?? ''} onChange={setSelected} options={options} />
          </label>
        ) : (
          <span className="gbp-toolbar__name">{options[0]?.label}</span>
        )}
        {data?.canEdit && (
          <button type="button" className="gb-btn-primary" onClick={() => setEditing(true)}>Editar perfil</button>
        )}
      </div>

      {savedNotice && (
        <p className="gbp-saved" role="status">
          Listo, mandamos los cambios a Google. Pueden tardar unos minutos en verse en tu ficha.
        </p>
      )}

      {selected && (
        <BusinessLock
          title="Que nadie cambie tu ficha sin que lo sepas"
          description="Si alguien cambia tu teléfono, tu dirección o te marca como cerrado, te avisamos y lo deshacés en un toque."
          preview={<ProtectionPreview />}
        >
          <ProtectionCard orgId={orgId} googleLocationId={selected} canEdit={Boolean(data?.canEdit)} onResolved={loadProfile} />
        </BusinessLock>
      )}

      {error && <p className="gbm-error" role="alert">{error}</p>}
      {!error && !data && <p className="gbm-muted">Leyendo tu ficha en Google…</p>}

      {p && (
        <>
          <Card icon={ICONS.pin} title="Información del negocio">
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
              <a className="gbp-link" href={p.mapsUri} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>
            )}
          </Card>

          <Card icon={ICONS.phone} title="Información de contacto">
            <div className="gbp-fields">
              <Field label="Teléfono principal">{p.primaryPhone || 'No especificado'}</Field>
              <Field label="Teléfonos adicionales">{p.additionalPhones.length ? p.additionalPhones.join(', ') : 'No especificado'}</Field>
              <Field label="Sitio web">
                {p.websiteUri
                  ? <a className="gbp-link" href={p.websiteUri} target="_blank" rel="noopener noreferrer">{p.websiteUri}</a>
                  : 'No especificado'}
              </Field>
            </div>
            {links.length > 0 && (
              <>
                <span className="gbp-subtitle">Redes sociales</span>
                <div className="gbp-fields">
                  {links.map((l) => (
                    <Field key={l.name} label={SOCIAL_LABELS[l.name] ?? l.displayName}>
                      {l.uri
                        ? <a className="gbp-link" href={l.uri} target="_blank" rel="noopener noreferrer">{l.uri}</a>
                        : 'No especificado'}
                    </Field>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card icon={ICONS.clock} title="Horario de apertura">
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

          <Card icon={ICONS.tag} title="Categorías del negocio">
            <div className="gbp-tags">
              {p.primaryCategory && <span className="gbp-tag gbp-tag--main">★ {p.primaryCategory}</span>}
              {p.additionalCategories.map((c) => <span key={c} className="gbp-tag">{c}</span>)}
              {!p.primaryCategory && <span className="gbp-hint">Sin categoría.</span>}
            </div>
            <small className="gbp-field__note">★ categoría principal. Por ahora las categorías se cambian desde Google.</small>
          </Card>

          {Object.keys(groups).length > 0 && (
            <Card icon={ICONS.check} title="Accesibilidad y comodidades">
              {Object.entries(groups).map(([group, attrs]) => (
                <div key={group} className="gbp-attr-group">
                  <span className="gbp-subtitle">{group}</span>
                  {attrs.map((a) => (
                    <div key={a.name} className="gbp-attr">
                      <span>{a.displayName}</span>
                      <span className={`gbp-pill ${a.value === true ? 'gbp-pill--yes' : ''}`}>
                        {a.value === true ? 'Sí' : a.value === false ? 'No' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {editing && data && (
        <EditProfileModal
          data={data}
          googleLocationId={selected}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSavedNotice(true);
            loadProfile();
          }}
        />
      )}
    </div>
  );
}
