import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader/PageHeader';
import Select from '../../components/Select/Select';
import GoogleConnect from '../../components/GoogleConnect/GoogleConnect';
import { useOrg } from '../../context/OrgContext';
import {
  createGooglePost,
  deleteGooglePost,
  fetchGoogleLocations,
  fetchGooglePosts,
  fetchPostQuota,
  uploadPostImage,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
} from '../../lib/googleApi';
import './GoogleBusiness.css';
import './GoogleProfile.css';
import './GooglePosts.css';

/*
 * Publicaciones en la ficha de Google — la pantalla real (fase 4.7).
 *
 * Se publica EN EL ACTO: programar publicaciones (y el job cada hora que eso
 * pide) es la evolución probable, anotada en el roadmap, no esta versión.
 *
 * El plan gratis tiene 1 publicación por mes (Tapstar hace lo mismo); Business,
 * sin límite. El cupo lo cuenta y lo hace cumplir la base (google_post_reserve,
 * 0031); el banner de acá sólo lo anticipa.
 *
 * Las publicaciones se leen en vivo de Google. No se muestran vistas ni clics:
 * Google dejó de darlos por publicación en 2023, y la maqueta que había acá los
 * inventaba.
 */

const TYPES = [
  {
    id: 'STANDARD',
    title: 'Actualización',
    text: 'Una novedad, una noticia o un anuncio general sobre tu negocio.',
    example: 'Ej: Nuevo menú de temporada disponible',
  },
  {
    id: 'OFFER',
    title: 'Oferta',
    text: 'Un descuento o una promoción con fechas de validez y, si querés, un código de cupón.',
    example: 'Ej: 20% de descuento este fin de semana',
  },
  {
    id: 'EVENT',
    title: 'Evento',
    text: 'Algo que va a pasar en una fecha concreta: un show, una degustación, una jornada especial.',
    example: 'Ej: Noche de jazz el viernes',
  },
];

const CTA_OPTIONS = [
  { value: '', label: 'Sin botón' },
  { value: 'LEARN_MORE', label: 'Más información' },
  { value: 'BOOK', label: 'Reservar' },
  { value: 'ORDER', label: 'Pedir online' },
  { value: 'SHOP', label: 'Comprar' },
  { value: 'SIGN_UP', label: 'Registrarse' },
  { value: 'CALL', label: 'Llamar' },
];

const STATE_LABELS = {
  LIVE: ['Publicada', 'live'],
  PROCESSING: ['En revisión', 'processing'],
  REJECTED: ['Rechazada por Google', 'rejected'],
  SCHEDULED: ['Programada', 'processing'],
  RECURRING: ['Recurrente', 'live'],
};

const STEPS = ['Tipo', 'Foto', 'Qué contar', 'Revisar'];
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

function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('No pudimos leer la imagen')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function scheduleLabel(schedule) {
  if (!schedule?.startDate) return null;
  const d = ({ year, month, day }) => `${day}/${month}/${year}`;
  return `${d(schedule.startDate)} – ${d(schedule.endDate ?? schedule.startDate)}`;
}

/* Lo que se manda al API (googlePostSchema en services/api/lib/validation.js). */
function toRequest(draft) {
  const body = { topicType: draft.topicType, summary: draft.summary.trim() };
  if (draft.mediaUrl) body.mediaUrl = draft.mediaUrl;
  if (draft.ctaType) {
    body.callToAction = { actionType: draft.ctaType };
    if (draft.ctaType !== 'CALL') body.callToAction.url = draft.ctaUrl.trim();
  }
  if (draft.topicType !== 'STANDARD') {
    body.event = {
      title: draft.eventTitle.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate || draft.startDate,
      ...(draft.startTime ? { startTime: draft.startTime } : {}),
      ...(draft.endTime ? { endTime: draft.endTime } : {}),
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

/* Qué le falta al paso «Qué contar» para poder seguir; null si está completo. */
function contentProblem(draft) {
  if (!draft.summary.trim()) return 'Escribí el texto de la publicación.';
  if (draft.topicType !== 'STANDARD') {
    if (!draft.eventTitle.trim()) return 'Ponele un título.';
    if (!draft.startDate) return 'Elegí la fecha de inicio.';
    if (draft.endDate && draft.endDate < draft.startDate) return 'La fecha de fin es anterior a la de inicio.';
  }
  if (draft.ctaType && draft.ctaType !== 'CALL' && !/^https?:\/\//i.test(draft.ctaUrl.trim())) {
    return 'El botón necesita un enlace que empiece con https://';
  }
  if (draft.redeemOnlineUrl.trim() && !/^https?:\/\//i.test(draft.redeemOnlineUrl.trim())) {
    return 'El enlace para canjear la oferta tiene que empezar con https://';
  }
  return null;
}

function Composer({ orgId, googleLocationId, disabled, onPublished }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const type = TYPES.find((t) => t.id === draft.topicType);
  const problem = step === 2 ? contentProblem(draft) : null;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
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

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      await createGooglePost(googleLocationId, toRequest(draft));
      setDraft(EMPTY_DRAFT);
      setStep(0);
      onPublished();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="gb-card gbpo-composer">
      <h3 className="gb-card__title">Nueva publicación</h3>
      <div className="gbpo-steps" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
        <span className="gbpo-steps__count">Paso {step + 1} de {STEPS.length}</span>
        <div className="gbpo-steps__bars">
          {STEPS.map((s, i) => (
            <div key={s} className={`gbpo-steps__bar ${i <= step ? 'gbpo-steps__bar--on' : ''}`}>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {step === 0 && (
        <>
          <h4 className="gbpo-question">¿Qué querés publicar?</h4>
          <p className="gbp-hint">Google permite tres tipos de publicación en tu ficha. Elegí la que mejor encaje.</p>
          <div className="gbpo-types">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`gbpo-type ${draft.topicType === t.id ? 'gbpo-type--on' : ''}`}
                onClick={() => set({ topicType: t.id })}
                aria-pressed={draft.topicType === t.id}
              >
                <strong>{t.title}</strong>
                <span>{t.text}</span>
                <em>{t.example}</em>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h4 className="gbpo-question">Una foto (opcional, pero recomendada)</h4>
          <p className="gbp-hint">JPG o PNG, hasta 5 MB. Las publicaciones con foto se ven mucho más en Google.</p>
          {draft.mediaUrl ? (
            <div className="gbpo-photo">
              <img src={draft.mediaUrl} alt="Foto de la publicación" />
              <button type="button" className="gbp-btn-ghost" onClick={() => set({ mediaUrl: null })}>Quitar foto</button>
            </div>
          ) : (
            <label className="gbpo-drop">
              <input type="file" accept="image/jpeg,image/png" onChange={handleFile} disabled={uploading} />
              {uploading ? 'Subiendo…' : 'Elegir una foto'}
            </label>
          )}
        </>
      )}

      {step === 2 && (
        <div className="gbpo-form">
          {draft.topicType !== 'STANDARD' && (
            <>
              <label className="gbp-input">
                <span>Título <em>{draft.eventTitle.length}/58</em></span>
                <input maxLength={58} value={draft.eventTitle} onChange={(e) => set({ eventTitle: e.target.value })} />
              </label>
              <div className="gbp-grid-2">
                <label className="gbp-input"><span>Desde</span>
                  <input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
                </label>
                <label className="gbp-input"><span>Hora de inicio <em>opcional</em></span>
                  <input type="time" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
                </label>
                <label className="gbp-input"><span>Hasta</span>
                  <input type="date" value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} />
                </label>
                <label className="gbp-input"><span>Hora de fin <em>opcional</em></span>
                  <input type="time" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} />
                </label>
              </div>
            </>
          )}

          <label className="gbp-input">
            <span>Texto <em>{draft.summary.length}/1500</em></span>
            <textarea rows={5} maxLength={1500} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} />
          </label>

          {draft.topicType === 'OFFER' && (
            <div className="gbp-grid-2">
              <label className="gbp-input"><span>Código de cupón <em>opcional</em></span>
                <input maxLength={58} value={draft.couponCode} onChange={(e) => set({ couponCode: e.target.value })} />
              </label>
              <label className="gbp-input"><span>Enlace para canjear <em>opcional</em></span>
                <input type="url" placeholder="https://" value={draft.redeemOnlineUrl} onChange={(e) => set({ redeemOnlineUrl: e.target.value })} />
              </label>
              <label className="gbp-input gbpo-span-2"><span>Condiciones <em>opcional</em></span>
                <textarea rows={2} value={draft.termsConditions} onChange={(e) => set({ termsConditions: e.target.value })} />
              </label>
            </div>
          )}

          {draft.topicType !== 'OFFER' && (
            <div className="gbp-grid-2">
              <label className="gbp-input"><span>Botón</span>
                <Select value={draft.ctaType} onChange={(v) => set({ ctaType: v })} options={CTA_OPTIONS} />
              </label>
              {draft.ctaType && draft.ctaType !== 'CALL' && (
                <label className="gbp-input"><span>Enlace del botón</span>
                  <input type="url" placeholder="https://" value={draft.ctaUrl} onChange={(e) => set({ ctaUrl: e.target.value })} />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="gbpo-review">
          {draft.mediaUrl && <img src={draft.mediaUrl} alt="" />}
          <div>
            <span className="gbpo-chip">{type.title}</span>
            {draft.eventTitle && draft.topicType !== 'STANDARD' && <h4>{draft.eventTitle}</h4>}
            {draft.startDate && draft.topicType !== 'STANDARD' && (
              <p className="gbp-hint">{draft.startDate}{draft.endDate && draft.endDate !== draft.startDate ? ` – ${draft.endDate}` : ''}</p>
            )}
            <p className="gbpo-review__text">{draft.summary}</p>
            {draft.couponCode && <p className="gbp-hint">Cupón: <b>{draft.couponCode}</b></p>}
            {draft.ctaType && <span className="gbpo-cta">{CTA_OPTIONS.find((c) => c.value === draft.ctaType)?.label}</span>}
          </div>
          <p className="gbp-hint gbpo-span-2">
            Se publica en tu ficha real y la ve cualquiera en Google. Google la revisa antes de mostrarla; puede tardar
            unos minutos.
          </p>
        </div>
      )}

      {(error || problem) && <p className="gbm-error" role="alert">{error || problem}</p>}

      <div className="gbpo-nav">
        {step > 0 && (
          <button type="button" className="gbp-btn-ghost" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={publishing}>
            Atrás
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            className="gb-btn-primary"
            onClick={() => { setError(null); setStep((s) => s + 1); }}
            disabled={uploading || Boolean(problem)}
          >
            Siguiente
          </button>
        ) : (
          <button type="button" className="gb-btn-primary" onClick={publish} disabled={publishing || disabled}>
            {publishing ? 'Publicando…' : 'Publicar en Google'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function GooglePostsScreen({ google, onNavigateSettings }) {
  const { org, isBusiness } = useOrg();
  const orgId = org?.organization_id;

  const [fichas, setFichas] = useState(null);
  const [selected, setSelected] = useState(null);
  const [posts, setPosts] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [quota, setQuota] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    if (!orgId) return;
    fetchGoogleLocations(orgId)
      .then((rows) => {
        const linked = rows.filter((f) => f.location_id);
        setFichas(linked);
        setSelected((prev) => prev ?? linked[0]?.id ?? null);
      })
      .catch(() => setError('No pudimos cargar tus fichas.'));
  }, [orgId]);

  const load = useCallback(() => {
    if (!selected) return;
    setPosts(null);
    setError(null);
    Promise.all([fetchGooglePosts(selected), fetchPostQuota(orgId)])
      .then(([result, q]) => {
        setPosts(result.posts);
        setCanEdit(result.canEdit);
        setQuota(q);
      })
      .catch((err) => setError(err.message));
  }, [selected, orgId]);

  useEffect(() => { load(); }, [load]);

  async function remove(post) {
    if (!window.confirm('¿Borrar esta publicación de tu ficha de Google? No se puede deshacer.')) return;
    setDeleting(post.name);
    try {
      await deleteGooglePost(selected, post.name);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  const header = (
    <PageHeader eyebrow="Google Business" title="Publicaciones" subtitle="Publicá novedades, ofertas y eventos en tu ficha de Google" />
  );

  const reauthNotice = google.connection?.status === 'needs_reauth' && (
    <div className="gbm-notice">
      <p>Google cortó el acceso a tu ficha. Para ver y crear publicaciones, volvé a conectarla.</p>
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
          <p>Elegí cuál de tus fichas de Google corresponde a cada sucursal para poder publicar en ella.</p>
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
  const quotaLeft = quota && quota.limite != null ? Math.max(0, quota.limite - quota.usadas) : null;
  const outOfQuota = quotaLeft === 0;

  return (
    <div className="gb-page">
      {header}
      {reauthNotice}

      {quota && !isBusiness && (
        <div className={`gbpo-quota ${outOfQuota ? 'gbpo-quota--out' : ''}`}>
          <span>
            {outOfQuota
              ? 'Ya usaste tu publicación gratis de este mes. Con Business publicás sin límite.'
              : `Te queda ${quotaLeft} publicación gratis este mes.`}
          </span>
          {onNavigateSettings && (
            <button type="button" className="gbpo-quota__link" onClick={() => onNavigateSettings('facturacion')}>
              Ver plan Business
            </button>
          )}
        </div>
      )}

      {options.length > 1 && (
        <div className="gb-card gbp-toolbar">
          <label className="gbm-field">
            <span>Sucursal</span>
            <Select value={selected ?? ''} onChange={setSelected} options={options} />
          </label>
        </div>
      )}

      {notice && <p className="gbp-saved" role="status">{notice}</p>}
      {error && <p className="gbm-error" role="alert">{error}</p>}

      {selected && canEdit && (
        <Composer
          orgId={orgId}
          googleLocationId={selected}
          disabled={outOfQuota}
          onPublished={() => {
            setNotice('Listo, mandamos la publicación a Google. Va a aparecer en tu ficha cuando Google la apruebe.');
            load();
          }}
        />
      )}

      <div className="gb-card">
        <div className="gb-card__header">
          <div>
            <h3 className="gb-card__title">Publicaciones recientes {posts ? `(${posts.length})` : ''}</h3>
            <span className="gb-card__subtitle">Lo que está publicado en tu ficha de Google</span>
          </div>
        </div>
        {!posts && !error && <p className="gbm-muted">Leyendo tus publicaciones en Google…</p>}
        {posts?.length === 0 && <p className="gbm-muted">Todavía no hay publicaciones en esta ficha.</p>}
        <div className="gbpo-list">
          {posts?.map((p) => {
            const [label, tone] = STATE_LABELS[p.state] ?? [p.state ?? 'Sin estado', 'processing'];
            const typeLabel = TYPES.find((t) => t.id === p.topicType)?.title ?? p.topicType;
            return (
              <div key={p.name} className="gbpo-post">
                {p.mediaUrl ? <img src={p.mediaUrl} alt="" /> : <div className="gbpo-post__noimg" />}
                <div className="gbpo-post__body">
                  <div className="gbpo-post__top">
                    <span className="gbpo-chip">{typeLabel}</span>
                    <span className={`gbpo-state gbpo-state--${tone}`}>{label}</span>
                  </div>
                  {p.eventTitle && <strong>{p.eventTitle}</strong>}
                  <p>{p.summary}</p>
                  <span className="gbp-hint">
                    {scheduleLabel(p.schedule) ?? `Publicada el ${formatDate(p.createTime)}`}
                    {p.couponCode ? ` · Cupón ${p.couponCode}` : ''}
                  </span>
                </div>
                <div className="gbpo-post__actions">
                  {p.searchUrl && (
                    <a className="gbp-link" href={p.searchUrl} target="_blank" rel="noopener noreferrer">Ver en Google</a>
                  )}
                  {canEdit && (
                    <button type="button" className="gbp-btn-ghost" onClick={() => remove(p)} disabled={deleting === p.name}>
                      {deleting === p.name ? 'Borrando…' : 'Borrar'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
