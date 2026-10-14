import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import Switch from '../../components/Switch/Switch';
import { useOrg } from '../../context/OrgContext';
import { fetchLocationRows } from '../../lib/catalogApi';
import {
  EMPTY_TONE,
  fetchBrandTones,
  saveBrandTone,
  TONE_INSTRUCTIONS_MAX,
  TONE_KINDS,
  TONE_MAX_CUSTOM_EMOJIS,
  TONE_SIGNATURE_MAX,
} from '../../lib/automationsApi';
import { settingsTabPath } from '../../lib/routes';
import '../../components/FormModal/FormModal.css';
import './BrandToneModal.css';

/*
 * Tono de marca: cómo escribe la IA las respuestas a las reseñas (0038), con la
 * estructura del modal de Tapstar. Viene de la versión de `develop` (13 oct
 * 2026), pasada al contrato del API (lib/automationsApi.js): el panel no lee ni
 * escribe las tablas de tonos.
 *
 *   1. Para qué reseñas: Positivas (4–5★) o Críticas (1–3★). Si no hay tono
 *      crítico, la IA usa el positivo.
 *   2. A qué locales: «Todos los locales» (por defecto) o una lista. El tono de
 *      un local tiene prioridad sobre el de todos. Un local que ya tiene un tono
 *      del mismo tipo aparece deshabilitado: la base no deja dos.
 *   3. La consigna libre, la firma (se agrega al final de cada respuesta) y los
 *      emojis.
 *
 * Guarda con PUT /api/automations/brand-tones (save_reply_tone). Lo usa la IA
 * tanto en el borrador de Reseñas como en la respuesta automática.
 *
 * Se abre desde el detalle de una reseña («Crear tono de marca») y desde
 * Configuración → Gestión local → Tonos de marca («+ Añadir tono» y «Editar»).
 * Quién puede, como responder una reseña (0026): owner/admin en todo; un
 * encargado sólo para sus locales (los que le devuelve fetchLocationRows) y
 * nunca «Todos los locales» — eso es `allowGlobal`. La base lo vuelve a mirar.
 */

/* Los emojis de lo que se escribió, o null si hay algo que no es un emoji
 * (letras, números, signos). Se separa por grafema y no por carácter: un emoji
 * con tono de piel, una bandera o una familia son varios caracteres y uno solo
 * a la vista. Un grafema vale si es pictográfico, una bandera (dos indicadores
 * regionales) o un keycap (1️⃣). Así se puede pegar varios de una vez. */
const EMOJI_GRAPHEME = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]️?⃣)/u;
const graphemes = new Intl.Segmenter('es', { granularity: 'grapheme' });

function emojisIn(value) {
  const parts = [...graphemes.segment(value.replace(/\s+/g, ''))].map((s) => s.segment);
  if (!parts.length || !parts.every((part) => EMOJI_GRAPHEME.test(part))) return null;
  return parts;
}

/* Lo primero libre de un tipo: «Todos los locales» si nadie lo tiene (y se
 * puede), si no el primer local sin tono de ese tipo. null si no queda nada. */
function firstFreeScope(kind, tones, locations, allowGlobal = true) {
  const sameKind = tones.filter((t) => t.kind === kind);
  if (allowGlobal && !sameKind.some((t) => t.applies_to_all)) return { kind, applies_to_all: true, location_ids: [] };
  const taken = new Set(sameKind.flatMap((t) => t.location_ids));
  const free = locations.find((l) => !taken.has(l.value));
  return free ? { kind, applies_to_all: false, location_ids: [free.value] } : null;
}

/* Dos botones excluyentes, como los de Tapstar. */
function SegmentedChoice({ label, value, options, onChange, large = false }) {
  return (
    <div className="tone-choice">
      {label && <span className="tone-choice__label">{label}</span>}
      <div className="tone-choice__options" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            className={`tone-choice__btn${large ? ' tone-choice__btn--large' : ''}${value === opt.value ? ' tone-choice__btn--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Una fila con checkbox real (como la lista de locales de Tapstar). */
function CheckRow({ checked, disabled, onChange, label, aside, highlighted = false }) {
  return (
    <label className={`tone-check${checked ? ' tone-check--on' : ''}${highlighted ? ' tone-check--all' : ''}${disabled ? ' tone-check--disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="tone-check__box" aria-hidden="true">{checked && <Icon name="check" size={12} strokeWidth={3} />}</span>
      <span className="tone-check__label">{label}</span>
      {aside && <span className="tone-check__aside">{aside}</span>}
    </label>
  );
}

export default function BrandToneModal({ onClose, onSaved, tone: initialTone = null, fromSettings = false }) {
  const navigate = useNavigate();
  const { org, canManageBilling } = useOrg();
  const orgId = org?.organization_id;
  // Owner/admin. Un encargado arma tonos sólo para sus locales.
  const allowGlobal = canManageBilling;
  const editing = Boolean(initialTone?.id);
  const initialId = initialTone?.id ?? null;
  const isNew = !initialTone;

  const [tone, setTone] = useState(() => ({
    ...EMPTY_TONE,
    ...initialTone,
    ...(!initialTone && !allowGlobal ? { applies_to_all: false } : {}),
    emojis: { ...EMPTY_TONE.emojis, ...initialTone?.emojis },
  }));
  const [emojiDraft, setEmojiDraft] = useState('');
  const [locations, setLocations] = useState(null);
  const [others, setOthers] = useState([]);   // los demás tonos, para saber qué está tomado
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { emojis } = tone;

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    Promise.all([fetchLocationRows(orgId), fetchBrandTones(orgId)])
      .then(([rows, tones]) => {
        if (cancelled) return;
        const options = rows.map((l) => ({ value: l.id, label: l.name }));
        const rest = tones.filter((t) => t.id !== initialId);
        setLocations(options);
        setOthers(rest);
        // Un tono nuevo arranca en lo primero libre: positivas antes que
        // críticas, y «Todos los locales» antes que un local. Si todo está
        // cubierto queda como está y el aviso de abajo lo explica.
        if (isNew) {
          const scope = firstFreeScope('positive', rest, options, allowGlobal)
            ?? firstFreeScope('critical', rest, options, allowGlobal);
          if (scope) setTone((prev) => ({ ...prev, ...scope }));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('No se pudieron cargar los locales o los tonos:', err);
        setLocations([]);
        setError('No pudimos cargar tus locales. Cerrá y volvé a intentar.');
      });
    return () => { cancelled = true; };
  }, [orgId, initialId, isNew, allowGlobal]);

  const set = (patch) => setTone((prev) => ({ ...prev, ...patch }));
  const setEmojis = (patch) => setTone((prev) => ({ ...prev, emojis: { ...prev.emojis, ...patch } }));

  // Lo que ya está tomado por otro tono del MISMO tipo.
  const sameKind = others.filter((t) => t.kind === tone.kind);
  const allTaken = sameKind.some((t) => t.applies_to_all);
  const takenLocations = new Set(sameKind.flatMap((t) => (t.applies_to_all ? [] : t.location_ids)));

  /* Al cambiar de tipo, si lo elegido ya está tomado en el otro tipo, se pasa a
     lo primero libre de ése (si hay). */
  function changeKind(kind) {
    setTone((prev) => {
      const sameKind = others.filter((t) => t.kind === kind);
      const takenAll = sameKind.some((t) => t.applies_to_all);
      const taken = new Set(sameKind.flatMap((t) => t.location_ids));
      const clash = prev.applies_to_all ? takenAll : prev.location_ids.some((id) => taken.has(id));
      const scope = clash || (!prev.applies_to_all && !prev.location_ids.length)
        ? firstFreeScope(kind, others, locations ?? [], allowGlobal)
        : null;
      return { ...prev, kind, ...(scope ?? {}) };
    });
  }

  function toggleAll(checked) {
    if (checked) set({ applies_to_all: true, location_ids: [] });
    else set({ applies_to_all: false });
  }

  function toggleLocation(id, checked) {
    setTone((prev) => {
      const next = new Set(prev.location_ids);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...prev, applies_to_all: false, location_ids: [...next] };
    });
  }

  const draftEmojis = emojisIn(emojiDraft);
  const draftInvalid = emojiDraft.trim() !== '' && !draftEmojis;
  const isFull = emojis.custom.length >= TONE_MAX_CUSTOM_EMOJIS;

  function addEmoji() {
    if (!draftEmojis || isFull) return;
    const next = [...new Set([...emojis.custom, ...draftEmojis])].slice(0, TONE_MAX_CUSTOM_EMOJIS);
    setEmojis({ custom: next });
    setEmojiDraft('');
  }

  // Lo que todavía choca con otro tono (al cambiar de tipo, por ejemplo).
  const conflict = tone.applies_to_all
    ? allTaken
    : tone.location_ids.some((id) => takenLocations.has(id));
  const noScope = !tone.applies_to_all && tone.location_ids.length === 0;
  // Tono nuevo y no queda nada libre en ninguno de los dos tipos.
  const allCovered = !editing && locations !== null
    && !firstFreeScope('positive', others, locations, allowGlobal)
    && !firstFreeScope('critical', others, locations, allowGlobal);
  const canSave = !saving && locations !== null && !conflict && !noScope;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await saveBrandTone(orgId, tone);
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  // Portal: desde Configuración el modal se abre dentro de una tarjeta de vidrio
  // (contexto de apilamiento propio), y sin portal quedaría debajo de las demás.
  return createPortal(
    <div className="fmodal-overlay tone-modal-overlay" onClick={onClose}>
      <div className="fmodal tone-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={editing ? 'Editar tono' : 'Crear tono'}>
        <div className="fmodal__header">
          <div>
            <h3 className="fmodal__title">{editing ? 'Editar tono' : 'Crear tono'}</h3>
            <p className="tone-modal__subtitle">Definí cómo la IA se comunica en tus respuestas.</p>
          </div>
          <button className="fmodal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <Icon name="close" size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="fmodal__body">
          <div className="tone-section">
            <span className="tone-section__title"><Icon name="star" size={15} /> ¿Para qué reseñas es este tono?</span>
            <SegmentedChoice
              large
              value={tone.kind}
              onChange={changeKind}
              options={TONE_KINDS}
            />
            <span className="tone-section__hint">
              Podés tener dos tonos por ámbito: uno para agradecer y otro para responder a quien no quedó contento.
              Si no creás el de reseñas críticas, se usa el positivo.
            </span>
          </div>

          <div className="tone-section">
            <span className="tone-section__title"><Icon name="pin" size={15} /> ¿A qué locales se aplica este tono?</span>
            {locations === null ? (
              <span className="tone-section__hint">Cargando locales…</span>
            ) : (
              <>
                <CheckRow
                  highlighted
                  checked={tone.applies_to_all}
                  disabled={(allTaken || !allowGlobal) && !tone.applies_to_all}
                  onChange={toggleAll}
                  label="Todos los locales"
                  aside={!allowGlobal ? 'sólo propietario o administrador' : allTaken ? 'ya hay uno de este tipo' : 'por defecto'}
                />
                {locations.length > 0 && (
                  <>
                    <span className="tone-section__hint">o elegí locales concretos:</span>
                    <div className="tone-check-list">
                      {locations.map((loc) => {
                        const taken = takenLocations.has(loc.value);
                        const checked = !tone.applies_to_all && tone.location_ids.includes(loc.value);
                        return (
                          <CheckRow
                            key={loc.value}
                            checked={checked}
                            disabled={taken && !checked}
                            onChange={(on) => toggleLocation(loc.value, on)}
                            label={loc.label}
                            aside={taken ? 'ya tiene tono' : null}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <label className="fmodal__field">
            <span className="fmodal__label">Describí cómo querés que responda nuestro sistema</span>
            <textarea
              className="tone-modal__textarea"
              value={tone.instructions}
              onChange={(e) => set({ instructions: e.target.value.slice(0, TONE_INSTRUCTIONS_MAX) })}
              placeholder="Quiero que el sistema agradezca siempre al cliente por la reseña y lo invite a volver"
              rows={4}
              maxLength={TONE_INSTRUCTIONS_MAX}
            />
            <span className="tone-modal__counter">{tone.instructions.length} / {TONE_INSTRUCTIONS_MAX}</span>
          </label>

          <div className="tone-modal__signature">
            <span className="tone-modal__signature-title"><Icon name="pen" size={15} /> Firma de las respuestas</span>
            <span className="tone-modal__signature-hint">
              Se agrega automáticamente al final de todas las respuestas generadas por la IA.
            </span>
            <input
              type="text"
              value={tone.signature}
              onChange={(e) => set({ signature: e.target.value })}
              placeholder='Ej: "— Equipo Linkstar" / "Saludos cordiales" / "Atentamente,"'
              maxLength={TONE_SIGNATURE_MAX}
            />
          </div>

          <div className="tone-modal__emojis">
            <div className="tone-modal__emojis-head">
              <span className="tone-modal__emojis-title"><Icon name="smile" size={15} /> Usar emojis en las respuestas</span>
              <Switch checked={emojis.enabled} onChange={(v) => setEmojis({ enabled: v })} label={emojis.enabled ? 'Sí' : 'No'} />
            </div>

            {emojis.enabled && (
              <>
                <SegmentedChoice
                  label="Tipo de emojis"
                  value={emojis.mode}
                  onChange={(v) => setEmojis({ mode: v })}
                  options={[{ value: 'auto', label: 'Automáticos' }, { value: 'custom', label: 'Los elijo yo' }]}
                />

                {emojis.mode === 'auto' ? (
                  <SegmentedChoice
                    label="Cantidad"
                    value={emojis.amount}
                    onChange={(v) => setEmojis({ amount: v })}
                    options={[{ value: 'moderate', label: 'Moderados (2–4)' }, { value: 'few', label: 'Pocos (1–2)' }]}
                  />
                ) : (
                  <div className="tone-choice">
                    <span className="tone-choice__label">Emojis que quiero incluir siempre</span>
                    <div className="tone-modal__emoji-input">
                      <input
                        type="text"
                        value={emojiDraft}
                        onChange={(e) => setEmojiDraft(e.target.value.slice(0, 64))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmoji(); } }}
                        placeholder="Escribí un emoji y tocá +"
                        aria-label="Emoji para agregar"
                        aria-invalid={draftInvalid}
                        className={draftInvalid ? 'tone-modal__input--invalid' : ''}
                      />
                      <button
                        type="button"
                        className="tone-modal__emoji-add"
                        onClick={addEmoji}
                        disabled={!draftEmojis || isFull}
                        aria-label="Agregar emoji"
                      >
                        <Icon name="plus" size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                    {draftInvalid && (
                      <span className="tone-modal__emoji-error" role="alert">Sólo se aceptan emojis, sin letras, números ni signos.</span>
                    )}
                    {isFull && (
                      <span className="tone-choice__label">Llegaste al máximo de {TONE_MAX_CUSTOM_EMOJIS} emojis.</span>
                    )}
                    {emojis.custom.length > 0 && (
                      <ul className="tone-modal__chips">
                        {emojis.custom.map((emoji) => (
                          <li key={emoji} className="tone-modal__chip">
                            {emoji}
                            <button
                              type="button"
                              onClick={() => setEmojis({ custom: emojis.custom.filter((x) => x !== emoji) })}
                              aria-label={`Quitar ${emoji}`}
                            >
                              <Icon name="close" size={11} strokeWidth={2.5} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {conflict && (
            <p className="fmodal__warn">
              {allCovered
                ? `Ya tenés tonos positivos y críticos para todos ${allowGlobal ? 'tus' : 'los'} locales. Para cambiar uno, editalo desde Configuración → Gestión local.`
                : tone.applies_to_all
                ? 'Ya hay un tono de este tipo para todos los locales. Editá ese, o elegí locales concretos.'
                : 'Alguno de los locales elegidos ya tiene un tono de este tipo.'}
            </p>
          )}
          {error && <p className="fmodal__error" role="alert">{error}</p>}

          {!fromSettings && (
            <button
              type="button"
              className="tone-modal__settings-link"
              onClick={() => { onClose(); navigate(settingsTabPath('local')); }}
            >
              <Icon name="pin" size={14} /> Ver todos tus tonos en Configuración <Icon name="externalLink" size={13} />
            </button>
          )}
        </div>

        <div className="fmodal__footer tone-modal__footer">
          <button type="button" className="fmodal__btn fmodal__btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="fmodal__btn fmodal__btn--primary" onClick={save} disabled={!canSave}>
            {saving ? 'Guardando…' : 'Guardar tono'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
