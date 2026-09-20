import { useState } from 'react';
import {
  createLocation,
  updateLocation,
  googleDestinationOf,
  instagramDestinationOf,
  catalogErrorMessage,
} from '../../lib/catalogApi';
import '../../components/FormModal/FormModal.css';

/* Alta y edición de una sucursal.
 *
 * El bloque que importa es "Destino del escaneo". El resto —dirección, teléfono—
 * es ficha, y el panel funciona igual sin eso. Pero sin destino, `resolve_scan()`
 * no tiene a dónde mandar a nadie: el expositor queda apoyado en la mesa
 * redirigiendo al fallback de la organización o, si tampoco hay, a
 * linkstarapp.com. O sea, el cliente compró el producto y no recibe reseñas.
 *
 * Por eso el formulario muestra el destino resuelto en vivo, con la misma
 * cascada que usa la base: es la única forma de que alguien se entere ANTES de
 * mandar a imprimir los QR.
 */

const EMPTY = {
  name: '',
  address: '',
  city: '',
  province: '',
  postal_code: '',
  phone: '',
  google_review_url: '',
  google_place_id: '',
  google_maps_url: '',
  instagram_handle: '',
  instagram_url: '',
};

/* Lo que llega de la base tiene nulls; los inputs controlados necesitan "". */
function toForm(location) {
  if (!location) return { ...EMPTY };
  const form = { ...EMPTY };
  for (const key of Object.keys(EMPTY)) {
    form[key] = location[key] ?? '';
  }
  return form;
}

function Field({ label, hint, children }) {
  return (
    <label className="fmodal__field">
      <span className="fmodal__label">{label}</span>
      {children}
      {hint && <span className="fmodal__hint">{hint}</span>}
    </label>
  );
}

/* Muestra a dónde va a terminar un escaneo con lo que hay cargado ahora mismo.
   Verde con la URL si resuelve, gris si no. */
function DestinationPreview({ kind, url }) {
  return (
    <div className={`fmodal__dest ${url ? 'fmodal__dest--ok' : 'fmodal__dest--empty'}`}>
      <span className="fmodal__dest-kind">{kind}</span>
      {url ? (
        <span className="fmodal__dest-url" title={url}>{url}</span>
      ) : (
        <span className="fmodal__dest-url fmodal__dest-url--empty">Sin destino — un escaneo no llegaría a ninguna parte</span>
      )}
    </div>
  );
}

export default function LocationForm({ organizationId, location, onClose, onSaved }) {
  const isEdit = Boolean(location?.id);
  const [form, setForm] = useState(() => toForm(location));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // La previsualización corre sobre el formulario, no sobre la fila guardada:
  // se actualiza mientras se escribe, que es cuando sirve.
  const googleUrl = googleDestinationOf(form);
  const instagramUrl = instagramDestinationOf(form);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      const saved = isEdit
        ? await updateLocation(location.id, form)
        : await createLocation(organizationId, form);
      onSaved(saved, isEdit);
    } catch (err) {
      console.error('No se pudo guardar la sucursal:', err);
      setError(catalogErrorMessage(err, 'la sucursal'));
      setSaving(false);
    }
  }

  return (
    <div className="fmodal-overlay" onClick={onClose}>
      <div className="fmodal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar sucursal' : 'Nueva sucursal'}>
        <div className="fmodal__header">
          <h3 className="fmodal__title">{isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
          <button className="fmodal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form id="location-form" className="fmodal__body" onSubmit={handleSubmit}>
          <Field label="Nombre de la sucursal *">
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ej. Sucursal Centro"
              maxLength={120}
              required
              autoFocus
            />
          </Field>

          <div className="fmodal__row">
            <Field label="Dirección">
              <input type="text" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Av. Pellegrini 1234" />
            </Field>
            <Field label="Ciudad">
              <input type="text" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Rosario" />
            </Field>
          </div>

          <div className="fmodal__row">
            <Field label="Provincia">
              <input type="text" value={form.province} onChange={e => set('province', e.target.value)} placeholder="Santa Fe" />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="341 555-0100" />
            </Field>
          </div>

          {/* ── Destino ── */}
          <div className="fmodal__section">
            <h4 className="fmodal__section-title">Destino del escaneo</h4>
            <p className="fmodal__section-text">
              Es a dónde llega tu cliente cuando toca o escanea el expositor. Con al menos uno de estos
              campos alcanza — si cargás varios, se usa el primero de la lista.
            </p>
          </div>

          <Field
            label="Link para dejar una reseña"
            hint="En tu perfil de Google Business, botón “Pedir reseñas”. Es el que mejor funciona: abre el formulario con las estrellas ya listas."
          >
            <input
              type="url"
              value={form.google_review_url}
              onChange={e => set('google_review_url', e.target.value)}
              placeholder="https://g.page/r/..."
            />
          </Field>

          <Field
            label="Place ID"
            hint="Alternativa al link de arriba. Lo encontrás buscando tu negocio en el Place ID Finder de Google."
          >
            <input
              type="text"
              value={form.google_place_id}
              onChange={e => set('google_place_id', e.target.value)}
              placeholder="ChIJ..."
            />
          </Field>

          <Field
            label="Link de Google Maps"
            hint="Último recurso: abre tu ficha, no el formulario de reseña. El cliente tiene que buscar dónde puntuar."
          >
            <input
              type="url"
              value={form.google_maps_url}
              onChange={e => set('google_maps_url', e.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </Field>

          <div className="fmodal__row">
            <Field label="Usuario de Instagram" hint="Sin la arroba.">
              <input
                type="text"
                value={form.instagram_handle}
                onChange={e => set('instagram_handle', e.target.value)}
                placeholder="milocal"
              />
            </Field>
            <Field label="Link de Instagram">
              <input
                type="url"
                value={form.instagram_url}
                onChange={e => set('instagram_url', e.target.value)}
                placeholder="https://instagram.com/milocal"
              />
            </Field>
          </div>

          <div className="fmodal__previews">
            <DestinationPreview kind="Expositor Google" url={googleUrl} />
            <DestinationPreview kind="Expositor Instagram" url={instagramUrl} />
          </div>

          {!googleUrl && !instagramUrl && (
            <p className="fmodal__warn">
              Podés guardar igual y completarlo después, pero mientras esté así los expositores de esta
              sucursal no van a llevar a nadie a tu ficha.
            </p>
          )}

          {error && <p className="fmodal__error" role="alert">{error}</p>}
        </form>

        <div className="fmodal__footer">
          <button type="button" className="fmodal__btn fmodal__btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="location-form" className="fmodal__btn fmodal__btn--primary" disabled={saving || !form.name.trim()}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear sucursal'}
          </button>
        </div>
      </div>
    </div>
  );
}
