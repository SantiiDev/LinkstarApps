import { useCallback, useEffect, useMemo, useState } from 'react';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import Icon from '../../components/Icon/Icon';
import Select from '../../components/Select/Select';
import { useOrg } from '../../context/OrgContext';
import { fetchLocationRows } from '../../lib/catalogApi';
import {
  deleteReplyTone,
  fetchReplySettings,
  fetchReplyTones,
  isEmail,
  replySettingsErrorMessage,
  saveReplySettings,
  TONE_KINDS,
} from '../../lib/replySettingsApi';
import BrandToneModal from '../Reviews/BrandToneModal';
import CardHead from './SettingsCardHead';

/*
 * Lo que usa la IA para responder reseñas (0037), en Configuración → Gestión
 * local (Santiago decidió el 13 oct 2026 que se quede acá y no en una pestaña
 * «Respuestas IA» aparte):
 *
 *   - Tonos de marca: la lista real, con Editar y Eliminar. Crear y editar abre
 *     BrandToneModal, el mismo que abre Reseñas.
 *   - Datos para las respuestas: el email de contacto que la IA cita en las
 *     reseñas críticas, para todos los locales o uno por local. El selector marca
 *     con ✓ los que ya tienen uno, y al elegir un local carga el que tiene.
 *
 * Las dos son Business (en gratis van detrás de BusinessLock con datos
 * inventados) y de owner/admin: para un manager o un viewer el RLS devuelve
 * vacío, así que ven un aviso en vez de una lista que parecería vacía.
 */

const KIND_SHORT = Object.fromEntries(TONE_KINDS.map((k) => [k.value, k.short]));

const LOCKS = {
  tones: {
    title: 'Que la IA responda con la voz de tu negocio',
    description: 'Definí cómo agradecer y cómo responder a quien no quedó contento, para todos tus locales o para cada uno.',
  },
  contact: {
    title: 'Un email para resolver las quejas fuera de Google',
    description: 'La IA lo cita en las respuestas a reseñas de 1 a 3 estrellas.',
  },
};

function AdminOnlyNotice() {
  return (
    <p className="settings-card__hint settings-card__hint--block">
      <Icon name="lock" size={13} /> Sólo el propietario o un administrador de la cuenta pueden ver y cambiar esto.
    </p>
  );
}

/* ─── Tonos de marca ──────────────────────────────────────────────────────── */

function emojiSummary(emojis) {
  if (!emojis?.enabled) return 'Sin emojis';
  if (emojis.mode === 'custom' && emojis.custom?.length) return `Emojis: ${emojis.custom.join(' ')}`;
  return emojis.amount === 'few' ? 'Pocos emojis' : 'Emojis moderados';
}

function ToneRow({ tone, locationNames, onEdit, onDelete, deleting }) {
  const [confirming, setConfirming] = useState(false);
  const scope = tone.applies_to_all
    ? 'Todos los locales'
    : tone.location_ids.map((id) => locationNames.get(id) ?? 'Local borrado').join(', ');
  return (
    <li className="settings-tone">
      <div className="settings-tone__main">
        <div className="settings-tone__top">
          <span className={`settings-tone__kind settings-tone__kind--${tone.kind}`}>{KIND_SHORT[tone.kind]}</span>
          <span className="settings-tone__scope"><Icon name="pin" size={12} /> {scope}</span>
        </div>
        <p className="settings-tone__text">
          {tone.instructions || 'Sin consigna: la IA responde con un tono amable y profesional.'}
        </p>
        <p className="settings-tone__meta">
          {tone.signature ? `Firma: ${tone.signature}` : 'Sin firma'} · {emojiSummary(tone.emojis)}
        </p>
      </div>
      {onEdit && (
        <div className="settings-tone__actions">
          {confirming ? (
            <>
              <span className="settings-tone__confirm">¿Eliminar este tono?</span>
              <button type="button" className="settings-danger-link" onClick={() => onDelete(tone)} disabled={deleting}>
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button type="button" className="settings-tone__btn" onClick={() => setConfirming(false)}>No</button>
            </>
          ) : (
            <>
              <button type="button" className="settings-tone__btn" onClick={() => onEdit(tone)}>
                <Icon name="pen" size={13} /> Editar
              </button>
              <button type="button" className="settings-tone__btn settings-tone__btn--danger" onClick={() => setConfirming(true)} aria-label="Eliminar tono">
                <Icon name="trash" size={13} />
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/* Tonos inventados para el candado de gratis (BusinessLock): nunca los del cliente. */
const SAMPLE_TONES = [
  { id: 's1', kind: 'positive', applies_to_all: true, location_ids: [], instructions: 'Agradecé siempre de forma cercana y nombrá algo de lo que contó el cliente. Invitalo a volver.', signature: '— Equipo de Café Aurora', emojis: { enabled: true, mode: 'auto', amount: 'few' } },
  { id: 's2', kind: 'critical', applies_to_all: true, location_ids: [], instructions: 'Pedí disculpas sin excusas y ofrecé seguir la conversación por mail.', signature: '— Equipo de Café Aurora', emojis: { enabled: false } },
];

function TonesList({ tones, locationNames, onEdit, onDelete, deletingId }) {
  return (
    <ul className="settings-tone-list">
      {tones.map((tone) => (
        <ToneRow
          key={tone.id}
          tone={tone}
          locationNames={locationNames}
          onEdit={onEdit}
          onDelete={onDelete}
          deleting={deletingId === tone.id}
        />
      ))}
    </ul>
  );
}

export function ReplyTonesCard() {
  const { org, canManageBilling, isBusiness } = useOrg();
  const orgId = org?.organization_id;
  const [tones, setTones] = useState(null);
  const [locationNames, setLocationNames] = useState(() => new Map());
  const [error, setError] = useState(null);
  const [modalTone, setModalTone] = useState(undefined); // undefined = cerrado, null = nuevo
  const [deletingId, setDeletingId] = useState(null);

  // En gratis no se pide nada: la tarjeta es el candado con datos inventados.
  const load = useCallback(() => {
    if (!orgId || !canManageBilling || !isBusiness) return;
    Promise.all([fetchReplyTones(orgId), fetchLocationRows(orgId)])
      .then(([rows, locations]) => {
        setTones(rows);
        setLocationNames(new Map(locations.map((l) => [l.id, l.name])));
        setError(null);
      })
      .catch((err) => {
        console.error('No se pudieron cargar los tonos:', err);
        setError('No pudimos cargar tus tonos. Probá recargar la página.');
      });
  }, [orgId, canManageBilling, isBusiness]);

  useEffect(() => { load(); }, [load]);

  async function remove(tone) {
    setDeletingId(tone.id);
    try {
      await deleteReplyTone(tone.id);
      setTones((prev) => prev.filter((t) => t.id !== tone.id));
    } catch (err) {
      setError(replySettingsErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  const head = (action) => (
    <CardHead
      icon="palette"
      iconVariant="gold"
      title="Tonos de marca"
      subtitle={<p className="settings-card__subtitle">Definí cómo responde la IA por local. El tono específico de un local tiene prioridad sobre el global.</p>}
      action={action}
    />
  );

  return (
    <div className="settings-card">
      <BusinessLock
        {...LOCKS.tones}
        preview={(
          <>
            {head(<button type="button" className="settings-save-btn">+ Añadir tono</button>)}
            <TonesList tones={SAMPLE_TONES} locationNames={new Map()} />
          </>
        )}
      >
        {head(canManageBilling && (
          <button type="button" className="settings-save-btn" onClick={() => setModalTone(null)} disabled={tones === null}>
            + Añadir tono
          </button>
        ))}

        {!canManageBilling ? (
          <AdminOnlyNotice />
        ) : error ? (
          <p className="settings-card__hint settings-card__hint--block" role="alert">{error}</p>
        ) : tones === null ? (
          <p className="settings-card__hint settings-card__hint--block">Cargando tonos…</p>
        ) : tones.length === 0 ? (
          <div className="settings-empty-state">
            <div className="settings-empty-state__icon"><Icon name="palette" size={22} /></div>
            <p className="settings-empty-state__title">No hay tonos configurados todavía.</p>
            <p className="settings-empty-state__text">
              Creá tu primer tono para que la IA responda con tu voz. Sin tono, responde de forma amable y profesional.
            </p>
          </div>
        ) : (
          <TonesList
            tones={tones}
            locationNames={locationNames}
            onEdit={(tone) => setModalTone(tone)}
            onDelete={remove}
            deletingId={deletingId}
          />
        )}

        {modalTone !== undefined && (
          <BrandToneModal
            fromSettings
            tone={modalTone}
            onClose={() => setModalTone(undefined)}
            onSaved={() => { setModalTone(undefined); load(); }}
          />
        )}
      </BusinessLock>
    </div>
  );
}

/* ─── Datos para las respuestas ───────────────────────────────────────────── */

function ContactRow({ options, scope, onScope, email, onEmail, onSave, saving, invalid, dirty }) {
  return (
    <div className="settings-contact-email-row">
      <Select value={scope} onChange={onScope} options={options} triggerClassName="settings-select" />
      <input
        type="email"
        value={email}
        onChange={(e) => onEmail(e.target.value)}
        placeholder="contacto@tunegocio.com"
        className="settings-text-input"
        aria-invalid={invalid}
        aria-label="Email de contacto"
      />
      <button type="button" className="settings-save-btn" onClick={onSave} disabled={saving || invalid || !dirty}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

export function ReplyContactCard() {
  const { org, canManageBilling, isBusiness } = useOrg();
  const orgId = org?.organization_id;
  const [locations, setLocations] = useState([]);
  const [emails, setEmails] = useState(null);     // Map<location_id | null, email>
  const [scope, setScope] = useState('all');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!orgId || !canManageBilling || !isBusiness) return undefined;
    let cancelled = false;
    Promise.all([fetchReplySettings(orgId), fetchLocationRows(orgId)])
      .then(([map, rows]) => {
        if (cancelled) return;
        setEmails(map);
        setLocations(rows);
        setEmail(map.get(null) ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('No se pudieron cargar los datos de respuesta:', err);
        setStatus({ text: 'No pudimos cargar los emails de contacto. Probá recargar la página.', error: true });
      });
    return () => { cancelled = true; };
  }, [orgId, canManageBilling, isBusiness]);

  const keyOf = (value) => (value === 'all' ? null : value);
  const saved = emails?.get(keyOf(scope)) ?? '';

  const options = useMemo(() => [
    { value: 'all', label: 'Todos los locales', checked: Boolean(emails?.get(null)) },
    ...locations.map((l) => ({ value: l.id, label: l.name, checked: Boolean(emails?.get(l.id)) })),
  ], [locations, emails]);

  function changeScope(value) {
    setScope(value);
    setEmail(emails?.get(keyOf(value)) ?? '');
    setStatus(null);
  }

  const trimmed = email.trim();
  const invalid = trimmed !== '' && !isEmail(trimmed);
  const dirty = trimmed !== saved;

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await saveReplySettings(orgId, keyOf(scope), { contactEmail: trimmed });
      setEmails((prev) => {
        const next = new Map(prev);
        if (trimmed) next.set(keyOf(scope), trimmed);
        else next.delete(keyOf(scope));
        return next;
      });
      const usesGlobal = !trimmed && scope !== 'all' && emails?.get(null);
      setStatus({
        text: trimmed ? 'Listo, guardado.' : usesGlobal ? 'Listo: este local va a usar el email de todos los locales.' : 'Listo, se quitó el email.',
      });
    } catch (err) {
      console.error('No se pudo guardar el email de contacto:', err);
      setStatus({ text: replySettingsErrorMessage(err), error: true });
    } finally {
      setSaving(false);
    }
  }

  const head = (
    <CardHead
      icon="mail"
      iconVariant="forest"
      title="Email de contacto para reseñas negativas"
      subtitle={<p className="settings-card__subtitle">La IA lo va a citar en las respuestas a reseñas de 1, 2 y 3 estrellas.</p>}
    />
  );

  const hint = (
    <p className="settings-card__hint settings-card__hint--block">
      Distinto de las alertas de Automatizaciones (que te avisan a vos). Este email es público: el cliente lo va a ver en la
      respuesta visible en Google Maps. Un local sin email propio usa el de «Todos los locales»; los marcados con ✓ ya tienen uno.
    </p>
  );

  return (
    <div className="settings-card settings-card--raised">
      <BusinessLock
        {...LOCKS.contact}
        preview={(
          <>
            {head}
            <ContactRow
              options={[{ value: 'all', label: 'Todos los locales', checked: true }]}
              scope="all" onScope={() => {}} email="hola@cafeaurora.com" onEmail={() => {}}
              onSave={() => {}} saving={false} invalid={false} dirty
            />
          </>
        )}
      >
        {head}
        {!canManageBilling ? (
          <AdminOnlyNotice />
        ) : (
          <>
            <ContactRow
              options={options}
              scope={scope}
              onScope={changeScope}
              email={email}
              onEmail={(v) => { setEmail(v); setStatus(null); }}
              onSave={save}
              saving={saving || emails === null}
              invalid={invalid}
              dirty={dirty}
            />
            {invalid && <p className="settings-card__hint settings-card__hint--block" role="alert">Ese email no parece válido.</p>}
            {status && (
              <p className={`settings-card__hint settings-card__hint--block${status.error ? ' settings-card__hint--error' : ''}`} role={status.error ? 'alert' : 'status'}>
                {status.text}
              </p>
            )}
            {hint}
          </>
        )}
      </BusinessLock>
    </div>
  );
}
