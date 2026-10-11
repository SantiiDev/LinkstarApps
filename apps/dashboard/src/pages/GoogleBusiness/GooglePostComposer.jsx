import { useEffect, useRef, useState } from 'react';
import Select from '../../components/Select/Select';
import Icon from '../../components/Icon/Icon';
import SoonBadge from '../../components/SoonBadge/SoonBadge';
import {
  createGooglePost,
  fetchGoogleProfile,
  uploadPostImage,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
} from '../../lib/googleApi';
import { ComposerHeader, PostTypePicker } from './GooglePostsBlocks';
import { AI_TWEAKS, CTA_OPTIONS, POST_TEXT_MAX, PROFILE_VARIABLES, stepsFor } from './googlePostsModel';

/*
 * «Nueva publicación» — el compositor, con los pasos de Tapstar:
 *
 *   Tipo → Foto → [Detalles] → Qué contar → Revisar
 *
 * «Detalles» (título, fechas, cupón) sólo existe para Oferta y Evento. «Qué
 * contar» es una elección: las sugerencias con IA (Próximamente: la IA la arma
 * el mismo trabajo que las respuestas de Reseñas) o «Escribir yo mismo», que
 * salta directo a Revisar. Revisar tiene el texto, las variables de la ficha, el
 * botón de acción y la vista previa.
 *
 * Diferencias con Tapstar, a propósito:
 *   - La foto es para todos los planes (Tapstar la bloquea en su plan gratis).
 *   - Programar está a la vista pero deshabilitado, Próximamente: hace falta un
 *     job cada hora (decisión #16). Se publica en el acto.
 *   - Se publica en una sola ficha (la del selector de arriba): publicar en
 *     varias choca con el cupo del plan gratis (ver GooglePostsScreen).
 *
 * El cupo del plan gratis lo hace cumplir la base (google_post_reserve, 0031):
 * `disabled` sólo lo anticipa en el botón.
 */

const MIN_IMAGE_SIDE = 250;

const EMPTY_DRAFT = {
  topicType: 'STANDARD',
  summary: '',
  mediaUrl: null,
  ctaType: '',
  ctaUrl: '',
  eventTitle: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  couponCode: '',
  redeemOnlineUrl: '',
  termsConditions: '',
};

const isHttpUrl = (s) => /^https?:\/\//i.test(s.trim());

function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('No pudimos leer la imagen')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/* Lo que se manda al API (googlePostSchema en services/api/lib/validation.js).
   Una oferta va sin horas (como en Tapstar) y sin botón de acción. */
function toRequest(draft) {
  const body = { topicType: draft.topicType, summary: draft.summary.trim() };
  if (draft.mediaUrl) body.mediaUrl = draft.mediaUrl;
  if (draft.ctaType && draft.topicType !== 'OFFER') {
    body.callToAction = { actionType: draft.ctaType };
    if (draft.ctaType !== 'CALL') body.callToAction.url = draft.ctaUrl.trim();
  }
  if (draft.topicType !== 'STANDARD') {
    const withTimes = draft.topicType === 'EVENT';
    body.event = {
      title: draft.eventTitle.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate || draft.startDate,
      ...(withTimes && draft.startTime ? { startTime: draft.startTime } : {}),
      ...(withTimes && draft.endTime ? { endTime: draft.endTime } : {}),
    };
  }
  if (draft.topicType === 'OFFER') {
    const offer = {
      couponCode: draft.couponCode.trim(),
      redeemOnlineUrl: draft.redeemOnlineUrl.trim(),
      termsConditions: draft.termsConditions.trim(),
    };
    body.offer = Object.fromEntries(Object.entries(offer).filter(([, v]) => v));
  }
  return body;
}

/* Qué le falta a «Detalles» para seguir; null si está completo. */
function detailsProblem(draft) {
  if (draft.topicType === 'STANDARD') return null;
  if (!draft.eventTitle.trim() || !draft.startDate) {
    return 'El título y la fecha de inicio son obligatorios para este tipo de publicación.';
  }
  if (draft.endDate && draft.endDate < draft.startDate) return 'La fecha de fin es anterior a la de inicio.';
  if (draft.topicType === 'OFFER' && draft.redeemOnlineUrl.trim() && !isHttpUrl(draft.redeemOnlineUrl)) {
    return 'El enlace para canjear la oferta tiene que empezar con https://';
  }
  return null;
}

/* Qué le falta a Revisar para publicar; null si está completo. */
function textProblem(draft) {
  if (!draft.summary.trim()) return 'Escribí el texto de la publicación.';
  if (draft.topicType !== 'OFFER' && draft.ctaType && draft.ctaType !== 'CALL' && !isHttpUrl(draft.ctaUrl)) {
    return 'El botón necesita un enlace que empiece con https://';
  }
  return null;
}

/* «2026-10-14» → «14 oct.» */
function shortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function datesLabel(draft) {
  if (!draft.startDate) return null;
  const withTimes = draft.topicType === 'EVENT';
  const from = `${shortDate(draft.startDate)}${withTimes && draft.startTime ? `, ${draft.startTime}` : ''}`;
  const endDate = draft.endDate || draft.startDate;
  const to = `${shortDate(endDate)}${withTimes && draft.endTime ? `, ${draft.endTime}` : ''}`;
  return from === to ? from : `${from} – ${to}`;
}

/* ─── Piezas ──────────────────────────────────────────────────────────────── */

function StepNav({ onBack, children }) {
  return (
    <div className="gbpo-nav">
      {onBack ? (
        <button type="button" className="gbpo-back" onClick={onBack}>← Atrás</button>
      ) : <span />}
      <div className="gbpo-nav__right">{children}</div>
    </div>
  );
}

/* «Insertar variable»: un menú con los datos de la ficha. `profile` es
   { status: 'loading' | 'ok' | 'error', data }. */
function VariablesMenu({ profile, onInsert }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ready = profile?.status === 'ok';
  return (
    <div className="gbpo-vars" ref={ref}>
      <button
        type="button"
        className="gbpo-vars__btn"
        onClick={() => setOpen((v) => !v)}
        disabled={!ready}
        aria-expanded={open}
      >
        <Icon name="braces" size={14} />
        {profile?.status === 'loading' ? 'Leyendo tu ficha…' : 'Insertar variable'}
        <Icon name="chevronDown" size={13} />
      </button>
      <span className="gbpo-vars__info" title="Inserta el dato tal como está hoy en tu ficha de Google.">
        <Icon name="info" size={14} />
      </span>
      {profile?.status === 'error' && (
        <span className="gbpo-vars__error">No pudimos leer los datos de tu ficha.</span>
      )}
      {open && ready && (
        <ul className="gbpo-vars__menu" role="menu">
          {PROFILE_VARIABLES.map((v) => {
            const value = v.valueOf(profile.data)?.trim?.() || null;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!value}
                  onClick={() => { onInsert(value); setOpen(false); }}
                >
                  <span>{v.label}</span>
                  <small>{value ?? 'No está cargado'}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* La vista previa, al estilo de una publicación en Google. */
function PostPreview({ draft, businessName }) {
  const [mode, setMode] = useState('mobile');
  const ctaLabel = draft.topicType !== 'OFFER' && draft.ctaType
    ? CTA_OPTIONS.find((c) => c.value === draft.ctaType)?.label
    : null;
  const title = draft.topicType !== 'STANDARD' ? draft.eventTitle.trim() : '';
  const dates = draft.topicType !== 'STANDARD' ? datesLabel(draft) : null;
  const empty = !draft.summary.trim() && !draft.mediaUrl && !title;

  return (
    <div className="gbpo-preview">
      <div className="gbpo-preview__head">
        <strong>Vista previa</strong>
        <div className="gbpo-preview__modes" role="group" aria-label="Ver como">
          <button type="button" aria-pressed={mode === 'mobile'} onClick={() => setMode('mobile')} title="Celular">
            <Icon name="smartphone" size={15} />
          </button>
          <button type="button" aria-pressed={mode === 'desktop'} onClick={() => setMode('desktop')} title="Computadora">
            <Icon name="monitor" size={15} />
          </button>
        </div>
      </div>

      <div className={`gbpo-preview__stage gbpo-preview__stage--${mode}`}>
        {empty ? (
          <div className="gbpo-preview__empty">La publicación va a aparecer acá</div>
        ) : (
          <article className="gbpo-gpost">
            <header className="gbpo-gpost__head">
              <span className="gbpo-gpost__avatar">{(businessName || '?').trim().charAt(0).toUpperCase()}</span>
              <span>
                <strong>{businessName}</strong>
                <small>Hace un momento</small>
              </span>
            </header>
            {draft.mediaUrl && <img className="gbpo-gpost__img" src={draft.mediaUrl} alt="" />}
            <div className="gbpo-gpost__body">
              {title && <p className="gbpo-gpost__title">{title}</p>}
              {dates && <p className="gbpo-gpost__dates">{dates}</p>}
              {draft.summary.trim() && <p className="gbpo-gpost__text">{draft.summary}</p>}
              {draft.topicType === 'OFFER' && draft.couponCode.trim() && (
                <div className="gbpo-gpost__coupon">
                  <span>Mostrá este código en el local</span>
                  <strong>{draft.couponCode.trim()}</strong>
                </div>
              )}
              {draft.topicType === 'OFFER' && draft.redeemOnlineUrl.trim() && (
                <span className="gbpo-gpost__link">Canjear online</span>
              )}
              {ctaLabel && <span className="gbpo-gpost__cta">{ctaLabel}</span>}
              {draft.topicType === 'OFFER' && draft.termsConditions.trim() && (
                <small className="gbpo-gpost__terms">Términos y condiciones</small>
              )}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

/* ─── El compositor ───────────────────────────────────────────────────────── */

export default function GooglePostComposer({
  orgId, googleLocationId, fichaName, disabled, isBusiness, onNavigateSettings, onPublished,
}) {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  // Datos de cada ficha para las variables, leídos al entrar a Revisar.
  const [profiles, setProfiles] = useState({});
  const fileRef = useRef(null);
  const textRef = useRef(null);
  // Dónde estaba el cursor del texto: tocar el menú de variables le saca el foco.
  const caret = useRef(null);

  const steps = stepsFor(draft.topicType);
  const step = steps[index].id;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const go = (id) => { setError(null); setIndex(steps.findIndex((s) => s.id === id)); };
  const next = () => { setError(null); setIndex((i) => i + 1); };
  const back = () => { setError(null); setIndex((i) => i - 1); };

  const profile = profiles[googleLocationId];
  useEffect(() => {
    if (step !== 'review' || !googleLocationId || profiles[googleLocationId]) return;
    setProfiles((p) => ({ ...p, [googleLocationId]: { status: 'loading' } }));
    fetchGoogleProfile(googleLocationId)
      .then((data) => setProfiles((p) => ({ ...p, [googleLocationId]: { status: 'ok', data: data.profile } })))
      .catch((err) => {
        console.error('No se pudieron leer los datos de la ficha:', err);
        setProfiles((p) => ({ ...p, [googleLocationId]: { status: 'error' } }));
      });
  }, [step, googleLocationId, profiles]);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    if (!POST_IMAGE_TYPES.includes(file.type)) return setError('La foto tiene que ser JPG o PNG.');
    if (file.size > POST_IMAGE_MAX_BYTES) return setError('La foto pesa más de 5 MB.');
    try {
      const { w, h } = await imageSize(file);
      if (w < MIN_IMAGE_SIDE || h < MIN_IMAGE_SIDE) {
        return setError(`La foto es muy chica: Google pide al menos ${MIN_IMAGE_SIDE}×${MIN_IMAGE_SIDE} píxeles.`);
      }
      setUploading(true);
      set({ mediaUrl: await uploadPostImage(orgId, file) });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function insertVariable(value) {
    const text = draft.summary;
    const start = caret.current?.start ?? text.length;
    const end = caret.current?.end ?? start;
    const summary = (text.slice(0, start) + value + text.slice(end)).slice(0, POST_TEXT_MAX);
    const at = Math.min(start + value.length, summary.length);
    set({ summary });
    caret.current = { start: at, end: at };
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(at, at);
    });
  }

  const rememberCaret = (e) => {
    caret.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
  };

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      await createGooglePost(googleLocationId, toRequest(draft));
      setDraft(EMPTY_DRAFT);
      setIndex(0);
      caret.current = null;
      onPublished();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  const details = detailsProblem(draft);
  const text = textProblem(draft);
  // El «escribí el texto» no se muestra como error mientras el campo está vacío:
  // ya lo dice el botón deshabilitado.
  const visibleTextProblem = draft.summary.trim() ? text : null;
  const isOffer = draft.topicType === 'OFFER';
  const isEvent = draft.topicType === 'EVENT';
  const count = draft.summary.length;

  return (
    <div className="gb-card gbpo-composer">
      <ComposerHeader steps={steps} current={index} />

      {step === 'type' && (
        <>
          <PostTypePicker value={draft.topicType} onChange={(id) => set({ topicType: id })} />
          <StepNav>
            <button type="button" className="gb-btn-primary" onClick={next}>
              Siguiente <Icon name="arrowRight" size={15} />
            </button>
          </StepNav>
        </>
      )}

      {step === 'photo' && (
        <>
          <h4 className="gbpo-question">Añadí una foto</h4>
          <p className="gbp-hint gbpo-lead">
            Recomendado: una publicación con foto llama más la atención en Google. Si no tenés ninguna, podés saltar
            este paso.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="gbpo-file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleFile(f); }}
          />
          {draft.mediaUrl ? (
            <div className="gbpo-photo">
              <img src={draft.mediaUrl} alt="Foto de la publicación" />
              <div className="gbpo-photo__actions">
                <button type="button" className="gbp-btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Subiendo…' : 'Cambiar'}
                </button>
                <button type="button" className="gbp-btn-ghost" onClick={() => set({ mediaUrl: null })} disabled={uploading}>
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`gbpo-drop${dragging ? ' gbpo-drop--over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
              disabled={uploading}
            >
              <span className="gbpo-drop__icon"><Icon name="upload" size={20} /></span>
              <strong>{uploading ? 'Subiendo…' : 'Elegí una foto o arrastrala acá'}</strong>
              <span>JPG o PNG, hasta 5 MB y de al menos {MIN_IMAGE_SIDE}×{MIN_IMAGE_SIDE} píxeles.</span>
            </button>
          )}
          {error && <p className="gbm-error" role="alert">{error}</p>}
          <StepNav onBack={back}>
            <button type="button" className="gb-btn-primary" onClick={next} disabled={uploading}>
              {draft.mediaUrl ? <>Siguiente <Icon name="arrowRight" size={15} /></> : 'Saltar este paso'}
            </button>
          </StepNav>
        </>
      )}

      {step === 'details' && (
        <>
          <h4 className="gbpo-question">{isOffer ? 'Detalles de la oferta' : 'Detalles del evento'}</h4>
          <p className="gbp-hint gbpo-lead">Google muestra estos datos destacados encima del texto de la publicación.</p>
          <div className="gbpo-fields">
            <label className="gbp-input">
              <span>Título <em>{draft.eventTitle.length}/58</em></span>
              <input
                maxLength={58}
                placeholder={isOffer ? 'Ej: 20% de descuento' : 'Ej: Noche de jazz en vivo'}
                value={draft.eventTitle}
                onChange={(e) => set({ eventTitle: e.target.value })}
              />
            </label>
            <div className="gbp-grid-2">
              <label className="gbp-input"><span>Fecha de inicio</span>
                <input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
              </label>
              <label className="gbp-input"><span>Fecha de fin <em>opcional</em></span>
                <input type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} />
              </label>
            </div>
            {isEvent && (
              <div className="gbp-grid-2">
                <label className="gbp-input"><span>Hora de inicio <em>opcional</em></span>
                  <input type="time" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
                </label>
                <label className="gbp-input"><span>Hora de fin <em>opcional</em></span>
                  <input type="time" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} />
                </label>
              </div>
            )}
            {isOffer && (
              <>
                <hr className="gbpo-sep" />
                <div className="gbp-grid-2">
                  <label className="gbp-input"><span>Código de cupón <em>opcional</em></span>
                    <input maxLength={58} placeholder="Ej: VERANO20" value={draft.couponCode} onChange={(e) => set({ couponCode: e.target.value })} />
                  </label>
                  <label className="gbp-input"><span>Enlace para canjear <em>opcional</em></span>
                    <input type="url" placeholder="https://" value={draft.redeemOnlineUrl} onChange={(e) => set({ redeemOnlineUrl: e.target.value })} />
                  </label>
                </div>
                <label className="gbp-input"><span>Términos y condiciones <em>opcional</em></span>
                  <textarea
                    rows={2}
                    placeholder="Ej: Válido sólo en el local. No acumulable con otras promociones."
                    value={draft.termsConditions}
                    onChange={(e) => set({ termsConditions: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
          {details && <p className="gbpo-warn">{details}</p>}
          <StepNav onBack={back}>
            <button type="button" className="gb-btn-primary" onClick={next} disabled={Boolean(details)}>
              Siguiente <Icon name="arrowRight" size={15} />
            </button>
          </StepNav>
        </>
      )}

      {step === 'content' && (
        <>
          <h4 className="gbpo-question">¿Qué querés contar?</h4>
          <p className="gbp-hint gbpo-lead">Escribí vos el texto de la publicación.</p>

          {/* Sólo la tarjeta: las sugerencias con IA todavía no existen. En gratis
              lleva a Configuración → Plan; en Business no tiene botón. */}
          <div className="gbpo-ai-card">
            <span className="gbpo-ai-card__icon"><Icon name={isBusiness ? 'sparkles' : 'lock'} size={20} /></span>
            <strong>Sugerencias con IA <SoonBadge /></strong>
            <p>
              {isBusiness
                ? 'Pronto la IA te va a proponer textos listos para publicar a partir de tu ficha y tu foto.'
                : 'Va a estar en el plan Business: la IA te va a proponer textos listos para publicar a partir de tu ficha y tu foto.'}
            </p>
            {!isBusiness && onNavigateSettings && (
              <button type="button" className="gb-btn-primary" onClick={() => onNavigateSettings('plan')}>
                Ver plan Business
              </button>
            )}
          </div>

          <div className="gbpo-or"><span>o</span></div>

          <button type="button" className="gbpo-write" onClick={() => go('review')}>
            <span className="gbpo-write__icon"><Icon name="pen" size={17} /></span>
            <span className="gbpo-write__text">
              <strong>Escribir yo mismo</strong>
              <small>Empezá con el editor en blanco.</small>
            </span>
          </button>

          <StepNav onBack={back} />
        </>
      )}

      {step === 'review' && (
        <>
          <h4 className="gbpo-question">Revisá y publicá</h4>
          <div className="gbpo-review">
            <div className="gbpo-review__form">
              <label className="gbp-input">
                <span>Texto de la publicación</span>
                <textarea
                  ref={textRef}
                  rows={6}
                  maxLength={POST_TEXT_MAX}
                  placeholder="Escribí el texto que van a ver tus clientes…"
                  value={draft.summary}
                  onChange={(e) => { set({ summary: e.target.value }); rememberCaret(e); }}
                  onSelect={rememberCaret}
                />
              </label>
              <div className="gbpo-meter" aria-hidden="true">
                <span style={{ width: `${(count / POST_TEXT_MAX) * 100}%` }} />
              </div>
              <span className="gbpo-count">{count} / {POST_TEXT_MAX}</span>

              <VariablesMenu profile={profile} onInsert={insertVariable} />

              <div className="gbpo-tweaks">
                <span className="gbpo-tweaks__label"><b>IA</b> · Ajustes rápidos <SoonBadge /></span>
                <div className="gbpo-tweaks__chips">
                  {AI_TWEAKS.map((t) => (
                    <button key={t} type="button" className="gbpo-tweak" disabled>
                      {!isBusiness && <Icon name="lock" size={11} />}
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {!isOffer && (
                <div className="gbp-grid-2">
                  <label className="gbp-input"><span>Botón de acción <em>opcional</em></span>
                    <Select value={draft.ctaType} onChange={(v) => set({ ctaType: v })} options={CTA_OPTIONS} />
                  </label>
                  {draft.ctaType && draft.ctaType !== 'CALL' && (
                    <label className="gbp-input"><span>Enlace del botón</span>
                      <input type="url" placeholder="https://" value={draft.ctaUrl} onChange={(e) => set({ ctaUrl: e.target.value })} />
                    </label>
                  )}
                </div>
              )}

              {/* Programar todavía no existe (decisión #16): a la vista, deshabilitado. */}
              <label className="gbp-input gbpo-schedule-field">
                <span><Icon name="calendar" size={13} /> Programar para <em>opcional</em> <SoonBadge /></span>
                <input type="datetime-local" disabled />
              </label>

              {(error || visibleTextProblem) && <p className="gbm-error" role="alert">{error || visibleTextProblem}</p>}

              <div className="gbpo-publish">
                <button
                  type="button"
                  className="gb-btn-primary"
                  onClick={publish}
                  disabled={publishing || disabled || Boolean(text)}
                >
                  <Icon name="send" size={15} />
                  {publishing ? 'Publicando…' : 'Publicar ahora'}
                </button>
                <button type="button" className="gbpo-schedule" disabled>
                  <Icon name="calendar" size={15} /> Programar <SoonBadge />
                </button>
              </div>
              <p className="gbp-hint">
                Se publica en tu ficha real y la ve cualquiera en Google. Google la revisa antes de mostrarla; puede
                tardar unos minutos.
              </p>
            </div>

            <PostPreview draft={draft} businessName={profile?.data?.title || fichaName} />
          </div>
          <StepNav onBack={back} />
        </>
      )}
    </div>
  );
}
