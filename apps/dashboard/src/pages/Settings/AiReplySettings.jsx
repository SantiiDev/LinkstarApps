import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon/Icon';
import Select from '../../components/Select/Select';
import BrandToneModal from '../Reviews/BrandToneModal';
import CardHead from './SettingsCardHead';
import { useOrg } from '../../context/OrgContext';
import { fetchLocationRows } from '../../lib/catalogApi';
import {
  deleteBrandTone,
  fetchBrandTones,
  fetchNegativeContact,
  saveNegativeContact,
} from '../../lib/automationsApi';
import { settingsTabPath } from '../../lib/routes';
import { useNavigate } from 'react-router-dom';

/*
 * Configuración → Gestión local: las dos tarjetas de las respuestas con IA
 * (0037). Las lee y las guarda el API (lib/automationsApi.js), que decide quién
 * puede con review_ai_scope_target():
 *
 *   owner / admin   todo, también «Todos los locales»
 *   manager         sólo sus sucursales (el global lo ve, no lo cambia)
 *   viewer          nada: no responde reseñas, no ve estas tarjetas
 *
 * Son Business: en gratis la tarjeta lo dice y lleva al plan, sin pedir nada al
 * API (que respondería 402).
 */

const GLOBAL = 'all';

function useScopeOptions(orgId, enabled) {
  const [locations, setLocations] = useState(null);
  useEffect(() => {
    if (!enabled || !orgId) return;
    let cancelled = false;
    fetchLocationRows(orgId)
      .then((rows) => { if (!cancelled) setLocations(rows.map((l) => ({ value: l.id, label: l.name }))); })
      .catch(() => { if (!cancelled) setLocations([]); });
    return () => { cancelled = true; };
  }, [orgId, enabled]);
  return locations;
}

function BusinessOnly({ text }) {
  const navigate = useNavigate();
  return (
    <div className="settings-empty-state">
      <div className="settings-empty-state__icon"><Icon name="lock" size={22} /></div>
      <p className="settings-empty-state__title">Parte del plan Business</p>
      <p className="settings-empty-state__text">{text}</p>
      <button type="button" className="settings-btn settings-btn--outline" onClick={() => navigate(settingsTabPath('plan'))}>
        Ver plan Business
      </button>
    </div>
  );
}

export default function AiReplySettings() {
  const { org, isBusiness } = useOrg();
  const orgId = org?.organization_id;
  const role = org?.role;
  const canEdit = ['owner', 'admin', 'manager'].includes(role);
  const allowGlobal = role === 'owner' || role === 'admin';
  const active = isBusiness && canEdit;
  const locations = useScopeOptions(orgId, active);

  if (!canEdit) return null;

  return (
    <>
      <BrandTonesCard orgId={orgId} active={active} locations={locations} allowGlobal={allowGlobal} />
      <NegativeContactCard orgId={orgId} active={active} locations={locations} allowGlobal={allowGlobal} />
    </>
  );
}

function BrandTonesCard({ orgId, active, locations, allowGlobal }) {
  const [tones, setTones] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { initialTone } mientras está abierto
  const [confirming, setConfirming] = useState(null); // location_id a borrar (o GLOBAL)
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    if (!active || !orgId) return;
    setError(null);
    fetchBrandTones(orgId)
      .then(setTones)
      .catch((err) => { setTones([]); setError(err.message); });
  }, [active, orgId]);

  useEffect(load, [load]);

  async function remove(locationId) {
    setDeleting(true);
    setError(null);
    try {
      await deleteBrandTone(orgId, locationId);
      setConfirming(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  // Un encargado no puede escribir el global: el modal abre en su primera sucursal.
  const newTone = allowGlobal ? null : { location_id: locations?.[0]?.value ?? null };
  const canAdd = active && locations && (allowGlobal || locations.length > 0);

  return (
    <div className="settings-card">
      <CardHead
        icon="palette"
        iconVariant="gold"
        title="Tonos de marca"
        subtitle={<p className="settings-card__subtitle">Definí cómo responde la IA por local. El tono específico de un local tiene prioridad sobre el global.</p>}
        action={active ? (
          <button type="button" className="settings-save-btn" onClick={() => setModal({ initialTone: newTone })} disabled={!canAdd}>
            + Añadir tono
          </button>
        ) : null}
      />

      {!active && <BusinessOnly text="La IA escribe las respuestas a tus reseñas con tu tono: cómo saludar, cómo firmar y si usar emojis." />}

      {active && tones === null && <p className="settings-card__hint settings-card__hint--block">Cargando…</p>}

      {active && tones?.length === 0 && !error && (
        <div className="settings-empty-state">
          <div className="settings-empty-state__icon"><Icon name="palette" size={22} /></div>
          <p className="settings-empty-state__title">No hay tonos configurados todavía.</p>
          <p className="settings-empty-state__text">Sin tono, la IA responde cordial y en castellano. Creá uno para que responda con tu voz.</p>
        </div>
      )}

      {active && tones?.length > 0 && (
        <div className="settings-tone-list">
          {tones.map((tone) => {
            const key = tone.location_id ?? GLOBAL;
            const editable = allowGlobal || tone.location_id != null;
            return (
              <div key={key} className="settings-account-row">
                <span className="settings-account-row__icon"><Icon name="palette" size={18} /></span>
                <div className="settings-account-row__body">
                  <span className="settings-account-row__name">{tone.location_name ?? 'Todos los locales'}</span>
                  <span className="settings-account-row__email">
                    {tone.instructions || 'Sin indicaciones'}
                    {tone.signature ? ` · Firma: ${tone.signature}` : ''}
                    {tone.emojis?.enabled ? ' · Con emojis' : ''}
                  </span>
                </div>
                {editable && (confirming === key ? (
                  <span className="settings-tone-actions">
                    <button type="button" className="settings-danger-link" onClick={() => remove(tone.location_id)} disabled={deleting}>
                      {deleting ? 'Borrando…' : 'Sí, borrar'}
                    </button>
                    <button type="button" className="settings-inline-link" onClick={() => setConfirming(null)} disabled={deleting}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <span className="settings-tone-actions">
                    <button type="button" className="settings-btn settings-btn--outline" onClick={() => setModal({ initialTone: tone })}>
                      Editar
                    </button>
                    <button type="button" className="settings-danger-link" onClick={() => setConfirming(key)}>
                      Borrar
                    </button>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="settings-card__hint settings-card__hint--block" role="alert">{error}</p>}

      {modal && (
        <BrandToneModal
          organizationId={orgId}
          locationOptions={locations ?? []}
          existingTones={tones ?? []}
          initialTone={modal.initialTone}
          allowGlobal={allowGlobal}
          onSaved={load}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function NegativeContactCard({ orgId, active, locations, allowGlobal }) {
  const [scope, setScope] = useState(allowGlobal ? GLOBAL : null);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState(null); // { tone: 'ok' | 'error', text }
  const [saving, setSaving] = useState(false);

  // Un encargado arranca en su primera sucursal.
  useEffect(() => {
    if (!allowGlobal && scope == null && locations?.length) setScope(locations[0].value);
  }, [allowGlobal, scope, locations]);

  const locationId = scope === GLOBAL ? null : scope;

  useEffect(() => {
    if (!active || !orgId || scope == null) return;
    let cancelled = false;
    setStatus(null);
    fetchNegativeContact(orgId, locationId)
      .then((value) => { if (!cancelled) { setEmail(value); setSaved(value); } })
      .catch((err) => { if (!cancelled) setStatus({ tone: 'error', text: err.message }); });
    return () => { cancelled = true; };
  }, [active, orgId, scope, locationId]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const value = await saveNegativeContact(orgId, locationId, email);
      setEmail(value);
      setSaved(value);
      setStatus({
        tone: 'ok',
        text: value
          ? 'Guardado.'
          : locationId ? 'Borrado: este local usa el de «Todos los locales».' : 'Borrado.',
      });
    } catch (err) {
      setStatus({ tone: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const options = [
    ...(allowGlobal ? [{ value: GLOBAL, label: 'Todos los locales' }] : []),
    ...(locations ?? []),
  ];

  return (
    <div className="settings-card">
      <CardHead
        icon="mail"
        iconVariant="forest"
        title="Email de contacto para reseñas negativas"
        subtitle={<p className="settings-card__subtitle">La IA lo va a citar en las respuestas a reseñas de 1, 2 y 3 estrellas.</p>}
      />

      {!active ? (
        <BusinessOnly text="La IA invita al cliente a escribirte a este mail cuando responde una reseña de 1, 2 o 3 estrellas." />
      ) : (
        <>
          <div className="settings-contact-email-row">
            <Select
              value={scope ?? ''}
              onChange={setScope}
              options={options}
              triggerClassName="settings-select"
            />
            <input
              type="email"
              placeholder="contacto@tunegocio.com"
              className="settings-text-input"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setStatus(null); }}
              aria-label="Email de contacto para reseñas negativas"
              disabled={scope == null}
            />
            <button
              type="button"
              className="settings-save-btn"
              onClick={save}
              disabled={saving || scope == null || email.trim() === saved}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {status && (
            <p className={`settings-card__hint settings-card__hint--block${status.tone === 'error' ? ' settings-card__hint--error' : ''}`} role={status.tone === 'error' ? 'alert' : 'status'}>
              {status.text}
            </p>
          )}
        </>
      )}
      <p className="settings-card__hint settings-card__hint--block">
        Distinto de las alertas de Automatizaciones (que te avisan a vos). Este email es público — el cliente lo va a ver en la respuesta visible en Google Maps. Vacío en un local, se usa el de «Todos los locales».
      </p>
    </div>
  );
}
