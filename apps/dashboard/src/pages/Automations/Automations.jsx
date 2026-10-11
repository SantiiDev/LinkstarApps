import { useCallback, useEffect, useMemo, useState } from 'react';
import BusinessLock from '../../components/BusinessLock/BusinessLock';
import Icon from '../../components/Icon/Icon';
import PageHeader from '../../components/PageHeader/PageHeader';
import { useOrg } from '../../context/OrgContext';
import { fetchLocationRows } from '../../lib/catalogApi';
import {
  AUTO_REPLY_DEFAULTS,
  PAST_REPLY_MAX,
  fetchAutoReplyRule,
  fetchAutoReplyStats,
  replyPastReviews,
  saveAutoReplyRule,
} from '../../lib/automationsApi';
import {
  ALERT_MAX_RECIPIENTS,
  ALERT_MAX_TERMS,
  DEFAULT_PREFERENCES,
  fetchNotificationPreferences,
  isEmail,
  notificationsErrorMessage,
  saveNotificationPreferences,
} from '../../lib/notificationsApi';
import {
  AutoReplyCard,
  AutoReplyStatsCard,
  DeviceAlertsCard,
  KeywordAlertCard,
  LowRatingAlertCard,
  PastRepliesCard,
  ScopeCard,
} from './AutomationsBlocks';
import { AUTO_REPLY_LOCK, AUTO_REPLY_STATS_LOCK, PAST_REPLIES_LOCK } from './automationLocks';
import { SAMPLE_AUTO_REPLY, SAMPLE_AUTO_REPLY_STATS, SAMPLE_PAST_REPLIES } from './automationsSample';
import './Automations.css';

/*
 * Automatizaciones — la estructura de Tapstar, con nuestra estética:
 *
 *   1. Selector de local («Configurar automatizaciones de»).
 *   2. Responder reseñas anteriores        ┐ Business, con IA. El backend es del
 *   3. Respuesta automática a reseñas       │ socio: el contrato (rutas y forma de
 *   4. Reseñas respondidas automáticamente  ┘ los datos) está en lib/automationsApi.js.
 *   5. Alerta por palabras clave            ┐ Todos los planes. Nuestras, reales
 *   6. Alerta por valoración baja           ┘ (0036): las manda send-alerts.js.
 *   7. Avisos de tus expositores (0023).
 *
 * En gratis, 2–4 van detrás de BusinessLock con datos inventados
 * (automationsSample.js). Un viewer no ve 2–4: no puede responder reseñas (0026).
 *
 * El mail de los cambios de Google en la ficha (0030) sigue saliendo para
 * Business, pero no tiene tarjeta acá: se maneja desde Perfil. Y no se muestra el
 * registro de lo enviado (notification_log): se sigue escribiendo, porque es lo
 * que evita mandar dos veces el mismo aviso.
 *
 * Las alertas y los avisos (5–7) los ven y cambian sólo owner y admin (RLS de la
 * 0023). Un manager no puede ni leerlos: su consulta vuelve vacía, y mostrarle
 * los valores por defecto como si fueran los de la cuenta sería mentirle, así
 * que ve un aviso en su lugar.
 *
 * Cada tarjeta guarda lo suyo («Activar regla», como Tapstar): las alertas hacen
 * un upsert parcial de notification_preferences con sólo sus campos.
 *
 * Las alertas valen para todos los locales: reglas por local quedan para más
 * adelante (llevan migración). Con un local elegido arriba, lo dicen. Y como las
 * reseñas se leen una vez por día (job `daily`), una alerta puede llegar hasta un
 * día después; un cron horario en Railway lo acortaría (services/api/DEPLOY.md).
 */

const IDLE_HOUR_OPTIONS = [
  { value: 12, label: '12 horas' },
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas' },
  { value: 72, label: '3 días' },
  { value: 168, label: '1 semana' },
];

const KEYWORD_FIELDS = ['keyword_alert_enabled', 'keyword_alert_terms', 'keyword_alert_recipients'];
const LOW_RATING_FIELDS = ['low_rating_enabled', 'low_rating_stars', 'low_rating_recipients'];
const DEVICE_FIELDS = ['device_idle_enabled', 'device_idle_hours', 'weekly_summary_enabled', 'recipient_email'];

/* Con el default de cada campo si falta: una lista nunca llega como null a
   las tarjetas (hacen `.length` sobre ellas). */
const pick = (source, keys) =>
  Object.fromEntries(keys.map((k) => [k, source?.[k] ?? DEFAULT_PREFERENCES[k] ?? null]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const noop = () => {};

/* El borrador de una tarjeta de alertas: sus campos de las preferencias
   guardadas, lo que se cambió en pantalla, y si hay diferencia. Se vuelve a lo
   guardado sólo cuando cambian SUS campos: guardar otra tarjeta reescribe la
   fila entera, y no tiene que borrar lo que se estaba editando acá. */
/* El borrador se deriva en el mismo render, no en un efecto: con un efecto, el
   primer render después de cargar las preferencias usaba el borrador viejo
   (todo null) y la pantalla entera se caía. Lo editado vale mientras sea sobre
   la misma versión guardada (`key`). */
function useCardDraft(saved, keys) {
  const baseKey = JSON.stringify(pick(saved, keys));
  const [edit, setEdit] = useState({ key: null, draft: null });
  const draft = edit.key === baseKey ? edit.draft : JSON.parse(baseKey);
  return {
    draft,
    update: (patch) => setEdit({ key: baseKey, draft: { ...draft, ...patch } }),
    dirty: baseKey !== JSON.stringify(draft),
  };
}

export default function Automations({ onNavigateSettings }) {
  const { org, isBusiness, canManageBilling, loading: orgLoading } = useOrg();
  const orgId = org?.organization_id;
  const isViewer = org?.role === 'viewer';

  /* ── Locales para el selector ── */
  const [locations, setLocations] = useState([]);
  const [scope, setScope] = useState('');
  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    fetchLocationRows(orgId)
      .then((rows) => { if (!cancelled) setLocations(rows); })
      .catch((err) => console.error('No se pudieron cargar los locales:', err));
    return () => { cancelled = true; };
  }, [orgId]);
  const scopeOptions = useMemo(
    () => [{ value: '', label: 'Todos los locales' }, ...locations.map((l) => ({ value: l.id, label: l.name }))],
    [locations]
  );
  const scopeLabel = scopeOptions.find((o) => o.value === scope)?.label ?? 'Todos los locales';
  const locationId = scope || null;

  /* ── Preferencias de avisos y registro (0023/0036) ── */
  const [saved, setSaved] = useState(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsError, setPrefsError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [cardState, setCardState] = useState({});   // { [card]: { saving, status } }

  useEffect(() => {
    if (orgLoading || !orgId || !canManageBilling) return undefined;
    let cancelled = false;
    setPrefsLoading(true);
    setPrefsError(null);
    fetchNotificationPreferences(orgId)
      .then(({ prefs }) => {
        if (!cancelled) setSaved(prefs);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('No se pudieron leer las preferencias de avisos:', err);
        setPrefsError('No pudimos leer la configuración de tus avisos.');
      })
      .finally(() => { if (!cancelled) setPrefsLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, canManageBilling, orgLoading, reloadKey]);

  const keyword = useCardDraft(saved, KEYWORD_FIELDS);
  const lowRating = useCardDraft(saved, LOW_RATING_FIELDS);
  const devices = useCardDraft(saved, DEVICE_FIELDS);

  async function savePrefs(card, patch, okText) {
    setCardState((s) => ({ ...s, [card]: { saving: true, status: null } }));
    try {
      const row = await saveNotificationPreferences(orgId, patch);
      setSaved(row);
      setCardState((s) => ({ ...s, [card]: { saving: false, status: { text: okText } } }));
    } catch (err) {
      console.error('No se pudieron guardar los avisos:', err);
      setCardState((s) => ({
        ...s,
        [card]: { saving: false, status: { text: notificationsErrorMessage(err), error: true } },
      }));
    }
  }

  const hourOptions = useMemo(() => {
    const current = Number(devices.draft.device_idle_hours ?? 48);
    if (IDLE_HOUR_OPTIONS.some((o) => o.value === current)) return IDLE_HOUR_OPTIONS;
    return [...IDLE_HOUR_OPTIONS, { value: current, label: `${current} horas` }].sort((a, b) => a.value - b.value);
  }, [devices.draft.device_idle_hours]);
  const deviceEmail = (devices.draft.recipient_email ?? '').trim();
  const deviceEmailInvalid = deviceEmail !== '' && !isEmail(deviceEmail);

  /* ── Respuestas con IA (Business, backend del socio) ── */
  const aiVisible = isBusiness && !isViewer;
  const [autoSaved, setAutoSaved] = useState(AUTO_REPLY_DEFAULTS);
  const [autoDraft, setAutoDraft] = useState(AUTO_REPLY_DEFAULTS);
  const [stats, setStats] = useState(null);
  const [past, setPast] = useState({ count: 50, stars: '4-5' });
  const [pastConfirming, setPastConfirming] = useState(false);

  useEffect(() => {
    if (!aiVisible || !orgId) return undefined;
    let cancelled = false;
    setPastConfirming(false);
    // Una lectura que falla deja los valores por defecto, sin mensaje: la
    // pantalla sigue sirviendo para configurar.
    fetchAutoReplyRule(orgId, locationId)
      .catch((err) => { console.error('No se pudo leer la respuesta automática:', err); return AUTO_REPLY_DEFAULTS; })
      .then((rule) => { if (!cancelled) { setAutoSaved(rule); setAutoDraft(rule); } });
    fetchAutoReplyStats(orgId, locationId)
      .catch((err) => { console.error('No se pudieron leer las reseñas respondidas:', err); return null; })
      .then((s) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [aiVisible, orgId, locationId]);

  const saveAutoReply = useCallback(async (enabled) => {
    setCardState((s) => ({ ...s, autoReply: { saving: true, status: null } }));
    try {
      const rule = await saveAutoReplyRule(orgId, locationId, { ...autoDraft, enabled });
      const next = { ...AUTO_REPLY_DEFAULTS, ...autoDraft, ...rule, enabled };
      setAutoSaved(next);
      setAutoDraft(next);
      setCardState((s) => ({
        ...s,
        autoReply: { saving: false, status: { text: enabled ? 'Listo, la regla está activa.' : 'Regla desactivada.' } },
      }));
    } catch (err) {
      setCardState((s) => ({ ...s, autoReply: { saving: false, status: { text: err.message, error: true } } }));
    }
  }, [orgId, locationId, autoDraft]);

  async function runPastReplies() {
    setCardState((s) => ({ ...s, past: { saving: true, status: null } }));
    try {
      const { queued } = await replyPastReviews(orgId, locationId, past);
      setPastConfirming(false);
      setCardState((s) => ({
        ...s,
        past: {
          saving: false,
          status: {
            text: queued
              ? `Listo: ${queued} reseña${queued === 1 ? '' : 's'} en camino. Las respuestas aparecen en Reseñas a medida que se publican.`
              : 'No había reseñas sin responder con ese filtro.',
          },
        },
      }));
    } catch (err) {
      setCardState((s) => ({ ...s, past: { saving: false, status: { text: err.message, error: true } } }));
    }
  }

  const pastCount = Number(past.count);
  const pastValid = Number.isInteger(pastCount) && pastCount >= 1 && pastCount <= PAST_REPLY_MAX;

  /* ── Render ── */
  const toneSettings = onNavigateSettings ? () => onNavigateSettings('local') : null;

  return (
    <div className="automations-page">
      <PageHeader
        eyebrow="Automatizaciones"
        title="Automatizaciones"
        subtitle="Reglas que trabajan solas sobre tus reseñas y tus expositores. Sólo afectan a lo que entra desde que guardás la regla."
      />

      <ScopeCard options={scopeOptions} value={scope} onChange={setScope} />

      {!isViewer && (
        <div className="automations-stack">
          <BusinessLock
            {...PAST_REPLIES_LOCK}
            preview={(
              <PastRepliesCard
                scopeLabel={SAMPLE_PAST_REPLIES.scopeLabel}
                count={SAMPLE_PAST_REPLIES.count}
                stars={SAMPLE_PAST_REPLIES.stars}
                onCount={noop} onStars={noop} onAsk={noop} onConfirm={noop} onCancel={noop}
              />
            )}
          >
            <PastRepliesCard
              scopeLabel={scopeLabel}
              count={past.count}
              onCount={(count) => { setPast((p) => ({ ...p, count })); setPastConfirming(false); }}
              stars={past.stars}
              onStars={(stars) => { setPast((p) => ({ ...p, stars })); setPastConfirming(false); }}
              confirming={pastConfirming}
              onAsk={() => {
                if (!pastValid) {
                  setCardState((s) => ({ ...s, past: { status: { text: `Elegí entre 1 y ${PAST_REPLY_MAX} reseñas.`, error: true } } }));
                  return;
                }
                setCardState((s) => ({ ...s, past: { status: null } }));
                setPastConfirming(true);
              }}
              onConfirm={runPastReplies}
              onCancel={() => setPastConfirming(false)}
              busy={cardState.past?.saving}
              status={cardState.past?.status}
            />
          </BusinessLock>

          <BusinessLock
            {...AUTO_REPLY_LOCK}
            preview={(
              <AutoReplyCard rule={SAMPLE_AUTO_REPLY} onChange={noop} savedEnabled dirty={false} onSave={noop} onDisable={noop} />
            )}
          >
            <AutoReplyCard
              rule={autoDraft}
              onChange={(patch) => setAutoDraft((d) => ({ ...d, ...patch }))}
              onToneSettings={toneSettings}
              savedEnabled={autoSaved.enabled}
              dirty={!same(
                { stars: [...autoSaved.stars].sort(), delay: autoSaved.delay },
                { stars: [...autoDraft.stars].sort(), delay: autoDraft.delay }
              )}
              onSave={() => saveAutoReply(true)}
              onDisable={() => saveAutoReply(false)}
              saving={cardState.autoReply?.saving}
              status={cardState.autoReply?.status}
            />
          </BusinessLock>

          <BusinessLock {...AUTO_REPLY_STATS_LOCK} preview={<AutoReplyStatsCard stats={SAMPLE_AUTO_REPLY_STATS} />}>
            <AutoReplyStatsCard stats={stats} />
          </BusinessLock>
        </div>
      )}

      {orgLoading ? (
        <p className="automations-muted">Cargando…</p>
      ) : !canManageBilling ? (
        <div className="automations-notice">
          <Icon name="lock" size={18} />
          <p>
            Sólo el propietario o un administrador de la cuenta pueden ver y cambiar las alertas y los avisos por
            mail. Si necesitás recibirlos, pedile a alguno de ellos que los configure.
          </p>
        </div>
      ) : prefsLoading || !saved ? (
        prefsError ? (
          <div className="automations-notice automations-notice--error" role="alert">
            <p>{prefsError}</p>
            <button type="button" className="automations-link" onClick={() => setReloadKey((k) => k + 1)}>
              Reintentar
            </button>
          </div>
        ) : (
          <p className="automations-muted">Cargando tus alertas…</p>
        )
      ) : (
        <>
          <div className="automations-stack">
            <KeywordAlertCard
              draft={keyword.draft}
              onChange={keyword.update}
              savedEnabled={Boolean(saved.keyword_alert_enabled)}
              dirty={keyword.dirty}
              saving={cardState.keyword?.saving}
              status={cardState.keyword?.status}
              globalNote={Boolean(scope)}
              maxTerms={ALERT_MAX_TERMS}
              maxRecipients={ALERT_MAX_RECIPIENTS}
              onSave={() => savePrefs('keyword', { ...keyword.draft, keyword_alert_enabled: true },
                saved.keyword_alert_enabled ? 'Listo, guardado.' : 'Listo, la alerta está activa.')}
              onDisable={() => savePrefs('keyword', { keyword_alert_enabled: false }, 'Alerta desactivada.')}
            />

            <LowRatingAlertCard
              draft={lowRating.draft}
              onChange={lowRating.update}
              savedEnabled={Boolean(saved.low_rating_enabled)}
              dirty={lowRating.dirty}
              saving={cardState.lowRating?.saving}
              status={cardState.lowRating?.status}
              globalNote={Boolean(scope)}
              maxRecipients={ALERT_MAX_RECIPIENTS}
              onSave={() => savePrefs('lowRating', { ...lowRating.draft, low_rating_enabled: true },
                saved.low_rating_enabled ? 'Listo, guardado.' : 'Listo, la alerta está activa.')}
              onDisable={() => savePrefs('lowRating', { low_rating_enabled: false }, 'Alerta desactivada.')}
            />
          </div>

          <h2 className="automations-section__title">Avisos por mail</h2>
          <div className="automations-stack">
            <DeviceAlertsCard
              draft={devices.draft}
              onChange={devices.update}
              hourOptions={hourOptions}
              dirty={devices.dirty}
              saving={cardState.devices?.saving}
              status={cardState.devices?.status}
              emailInvalid={deviceEmailInvalid}
              globalNote={Boolean(scope)}
              onSave={() => savePrefs('devices', devices.draft, 'Listo, guardado.')}
            />
          </div>
        </>
      )}
    </div>
  );
}
