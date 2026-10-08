import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon/Icon';
import Select from '../../components/Select/Select';
import Switch from '../../components/Switch/Switch';
import { settingsTabPath } from '../../lib/routes';
import '../../components/FormModal/FormModal.css';
import './BrandToneModal.css';

/*
 * Tono de marca: cómo tiene que escribir la IA las respuestas a las reseñas.
 *
 * SÓLO FRONTEND por ahora. Las respuestas con IA son el resto de la fase 5 y
 * las está haciendo otra persona; todavía no hay tabla donde guardar esto, así
 * que el formulario funciona entero en pantalla y «Guardar tono» queda
 * deshabilitado. Cuando exista el backend, lo que se guarda es exactamente
 * DEFAULT_BRAND_TONE con lo que se cargó:
 *
 *   {
 *     location_id:  uuid | null,     null = el tono global; uno por local pisa al global
 *     instructions: string (≤ 500),  la consigna libre («agradecé siempre y…»)
 *     signature:    string,          se agrega al final de cada respuesta generada
 *     emojis: {
 *       enabled: boolean,
 *       mode:    'auto' | 'custom',  auto = la IA elige; custom = sólo los de `custom`
 *       amount:  'moderate' | 'few', moderate = 2–4, few = 1–2 (sólo en auto)
 *       custom:  string[],           los emojis elegidos (sólo en custom)
 *     },
 *   }
 *
 * Se abre desde el detalle de una reseña («Crear tono de marca») y desde
 * Configuración → Gestión local → Tonos de marca («+ Añadir tono»); en el
 * segundo caso recibe `locationOptions` y deja elegir a qué local aplica.
 */

const BRAND_TONE_MAX = 500;
const MAX_CUSTOM_EMOJIS = 10;

const DEFAULT_BRAND_TONE = {
  location_id: null,
  instructions: '',
  signature: '',
  emojis: { enabled: false, mode: 'auto', amount: 'moderate', custom: [] },
};

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

/* Dos botones excluyentes, como los de Tapstar. */
function SegmentedChoice({ label, value, options, onChange }) {
  return (
    <div className="tone-choice">
      <span className="tone-choice__label">{label}</span>
      <div className="tone-choice__options" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            className={`tone-choice__btn${value === opt.value ? ' tone-choice__btn--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BrandToneModal({ onClose, locationOptions = null }) {
  const navigate = useNavigate();
  const [tone, setTone] = useState(DEFAULT_BRAND_TONE);
  const [emojiDraft, setEmojiDraft] = useState('');
  const { emojis } = tone;

  const set = (patch) => setTone((prev) => ({ ...prev, ...patch }));
  const setEmojis = (patch) => setTone((prev) => ({ ...prev, emojis: { ...prev.emojis, ...patch } }));

  const draftEmojis = emojisIn(emojiDraft);
  const draftInvalid = emojiDraft.trim() !== '' && !draftEmojis;
  const isFull = emojis.custom.length >= MAX_CUSTOM_EMOJIS;

  function addEmoji() {
    if (!draftEmojis || isFull) return;
    const next = [...new Set([...emojis.custom, ...draftEmojis])].slice(0, MAX_CUSTOM_EMOJIS);
    setEmojis({ custom: next });
    setEmojiDraft('');
  }

  // Desde Configuración el aviso de «tonos por local» sobra: ya está ahí.
  const fromSettings = Boolean(locationOptions);

  return (
    <div className="fmodal-overlay tone-modal-overlay" onClick={onClose}>
      <div className="fmodal tone-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Crear tono">
        <div className="fmodal__header">
          <div>
            <h3 className="fmodal__title">Crear tono</h3>
            <p className="tone-modal__subtitle">Definí cómo la IA se comunica en tus respuestas.</p>
          </div>
          <button className="fmodal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <Icon name="close" size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="fmodal__body">
          {fromSettings && (
            <label className="fmodal__field">
              <span className="fmodal__label">Aplica a</span>
              <Select
                value={tone.location_id ?? 'all'}
                onChange={(v) => set({ location_id: v === 'all' ? null : v })}
                options={[{ value: 'all', label: 'Todos los locales' }, ...locationOptions]}
                triggerClassName="ls-select-field ls-select-field--block"
              />
            </label>
          )}

          <label className="fmodal__field">
            <span className="fmodal__label">Describí cómo querés que responda nuestro sistema</span>
            <textarea
              className="tone-modal__textarea"
              value={tone.instructions}
              onChange={(e) => set({ instructions: e.target.value.slice(0, BRAND_TONE_MAX) })}
              placeholder="Quiero que el sistema agradezca siempre al cliente por la reseña y lo invite a volver"
              rows={4}
              maxLength={BRAND_TONE_MAX}
              autoFocus
            />
            <span className="tone-modal__counter">{tone.instructions.length} / {BRAND_TONE_MAX}</span>
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
              maxLength={120}
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
                      <span className="tone-choice__label">Llegaste al máximo de {MAX_CUSTOM_EMOJIS} emojis.</span>
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

          <p className="tone-modal__soon">
            <Icon name="info" size={14} /> Guardar el tono llega junto con las respuestas con IA. Por ahora podés ver cómo va a funcionar.
          </p>

          {!fromSettings && (
            <button
              type="button"
              className="tone-modal__settings-link"
              onClick={() => { onClose(); navigate(settingsTabPath('local')); }}
            >
              <Icon name="pin" size={14} /> ¿Tonos distintos por local? Gestionalos en Configuración <Icon name="externalLink" size={13} />
            </button>
          )}
        </div>

        <div className="fmodal__footer tone-modal__footer">
          <button type="button" className="fmodal__btn fmodal__btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="fmodal__btn fmodal__btn--primary" disabled title="Próximamente">
            Guardar tono
          </button>
        </div>
      </div>
    </div>
  );
}
