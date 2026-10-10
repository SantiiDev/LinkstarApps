import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import Icon from '../../components/Icon/Icon';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import { useOrg } from '../../context/OrgContext';
import {
  fetchGoogleLocations,
  fetchGoogleProfile,
  fetchProfileChanges,
  resolveProfileChange,
  updateGoogleProfile,
} from '../../lib/googleApi';
import { ATTRIBUTE_STATES, DAYS, SOCIAL, attributeHint, hhmm } from '../../lib/googleProfile';
import { ProfileDetails, ProfileToolbar, ProtectionBlock } from './GoogleProfileBlocks';
import { PROTECTION_LOCK } from './businessLocks';
import { ProtectionPreview } from './GoogleProfileBusinessPreview';
import '../../components/FormModal/FormModal.css';
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
 * gratis va detrás de BusinessLock. La ficha y la protección se dibujan con
 * GoogleProfileBlocks, los mismos bloques que usan sus maquetas.
 *
 * La estructura sigue a la pantalla de Tapstar, salvo lo que Tapstar promete y
 * nosotros no hacemos (revertir solo) y su lista fija de atributos: acá se
 * muestran sólo los que Google habilita para el rubro de la ficha.
 */

const DAY_INDEX = Object.fromEntries(DAYS.map(([d], i) => [d, i]));

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

    // Incluye volver a «sin cargar» (null), que en Google borra el atributo.
    const changedBools = bools
      .filter((b) => form.bools[b.name] !== b.value)
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
          {/* La misma cruz que el resto de los modales del panel (FormModal.css). */}
          <button type="button" className="fmodal__close" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={18} strokeWidth={2.5} />
          </button>
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
                    <span>{SOCIAL[l.name]?.label ?? l.displayName}</span>
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
              <p className="gbp-hint">
                «No» se publica en tu ficha (por ejemplo, «No tiene entrada accesible»). Si no aplica o no sabés,
                dejalo sin cargar.
              </p>
              {bools.map((b) => (
                <div key={b.name} className="gbp-attr gbp-attr--edit">
                  <span className="gbp-attr__text">
                    <span className="gbp-attr__name">{b.displayName}</span>
                    <span className="gbp-attr__hint">{attributeHint(b)}</span>
                  </span>
                  <div className="gbp-tri" role="radiogroup" aria-label={b.displayName}>
                    {ATTRIBUTE_STATES.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        role="radio"
                        aria-checked={form.bools[b.name] === s.value}
                        className={`gbp-tri__opt${form.bools[b.name] === s.value ? ` gbp-tri__opt--on gbp-tri__opt--${s.tone}` : ''}`}
                        onClick={() => setForm((f) => ({ ...f, bools: { ...f.bools, [b.name]: s.value } }))}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
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

  return <ProtectionBlock changes={changes} canEdit={canEdit} busyId={busyId} error={error} onResolve={resolve} />;
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

  return (
    <div className="gb-page">
      {header}
      {reauthNotice}

      <ProfileToolbar
        options={options}
        selected={selected}
        onSelect={setSelected}
        onEdit={data?.canEdit ? () => setEditing(true) : null}
      />

      {savedNotice && (
        <p className="gbp-saved" role="status">
          Listo, mandamos los cambios a Google. Pueden tardar unos minutos en verse en tu ficha.
        </p>
      )}

      {selected && (
        <div className="gbp-card">
          <BusinessLock {...PROTECTION_LOCK} preview={<ProtectionPreview />}>
            <ProtectionCard orgId={orgId} googleLocationId={selected} canEdit={Boolean(data?.canEdit)} onResolved={loadProfile} />
          </BusinessLock>
        </div>
      )}

      {error && <p className="gbm-error" role="alert">{error}</p>}
      {!error && !data && <p className="gbm-muted">Leyendo tu ficha en Google…</p>}

      {data?.profile && <ProfileDetails data={data} />}

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
