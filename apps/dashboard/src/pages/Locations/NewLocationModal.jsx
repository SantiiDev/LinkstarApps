import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../context/OrgContext';
import './NewLocationModal.css';

/* ─── TEMPORAL — borrar cuando llegue el OAuth de Google ──────────────────
 *
 * Carga manual de una ubicación. Vive detrás de MANUAL_LOCATION_ENABLED
 * (lib/config.js) y sólo se monta con VITE_ENABLE_MANUAL_LOCATION=true en el
 * .env local.
 *
 * Por qué existe: las ubicaciones definitivas se cargan conectando la ficha de
 * Google, pero ese permiso (scope `business.manage`) lo aprueba Google a mano a
 * nivel del proyecto de Cloud y está en trámite. Hasta que llegue no hay forma
 * de crear una fila en `locations`, y sin local un escaneo no tiene a dónde ir:
 * resolve_scan() cae al fallback. O sea que hoy no se puede probar el circuito
 * completo ni en desarrollo.
 *
 * Esto NO es una maqueta: escribe por el mismo camino que va a usar el OAuth
 * —insert sobre `locations`, policy locations_insert de la 0014, trigger
 * enforce_plan_limit() de la 0007— así que de paso ejercita una RLS de
 * escritura que nunca corrió, porque ninguna pantalla escribía locales.
 *
 * Para sacarlo: borrar este archivo y su CSS, el export MANUAL_LOCATION_ENABLED
 * de lib/config.js, los dos bloques condicionales de Locations.jsx y la línea
 * de .env.example.
 *
 *   git show <este-commit>:apps/dashboard/src/pages/Locations/NewLocationModal.jsx
 * ------------------------------------------------------------------------- */

const EMPTY = {
  name: '',
  google_review_url: '',
  google_place_id: '',
  google_maps_url: '',
  instagram_handle: '',
  city: '',
  address: '',
  province: '',
  phone: '',
};

/* Lo que se manda a la base: sólo los campos con contenido. Un string vacío en
   una columna de texto no es lo mismo que null, y resolve_scan() hace coalesce
   sobre esas columnas — un '' se tomaría como destino válido y mandaría el
   escaneo a ninguna parte. */
function payloadFrom(form, organizationId) {
  const row = { organization_id: organizationId };
  for (const [key, value] of Object.entries(form)) {
    const clean = value.trim();
    if (clean) row[key] = clean;
  }
  // La columna tiene un check que rechaza la arroba: se guarda sin ella.
  if (row.instagram_handle) {
    row.instagram_handle = row.instagram_handle.replace(/^@+/, '');
  }
  return row;
}

export default function NewLocationModal({ onClose, onCreated }) {
  const { org } = useOrg();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (error) setError('');
  };

  /* Un local sin ningún destino no sirve para nada: el expositor que se le
     asigne va a caer al fallback igual que si no existiera. Mejor frenarlo acá
     que dejar cargar algo que no resuelve. */
  const hasDestination = Boolean(
    form.google_review_url.trim() ||
    form.google_place_id.trim() ||
    form.google_maps_url.trim() ||
    form.instagram_handle.trim(),
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

    if (!form.name.trim()) {
      setError('Poné un nombre para el local.');
      return;
    }
    if (!hasDestination) {
      setError('Cargá al menos un destino: el link de reseñas de Google, el Place ID, el link de Maps o tu usuario de Instagram.');
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase
      .from('locations')
      .insert(payloadFrom(form, org?.organization_id));
    setSaving(false);

    if (insertError) {
      // El límite de plan ya viene con un mensaje en castellano desde el
      // trigger (0007), así que se muestra tal cual en vez de reescribirlo.
      setError(
        insertError.hint === 'plan_limit_reached'
          ? insertError.message
          : 'No pudimos guardar el local. Revisá los datos e intentá de nuevo.',
      );
      console.error('No se pudo crear la ubicación:', insertError);
      return;
    }

    onCreated?.();
    onClose();
  }

  return (
    <div className="loc-modal-overlay" onClick={onClose}>
      <div className="loc-modal nlm" onClick={(e) => e.stopPropagation()}>
        <div className="nlm__head">
          <div>
            <h3 className="nlm__title">Nueva ubicación</h3>
            <p className="nlm__subtitle">
              Carga manual, sólo para desarrollo. Cuando conectemos tu ficha de Google los
              locales se van a importar solos.
            </p>
          </div>
          <button className="loc-modal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className="nlm__body" onSubmit={handleSubmit}>
          {error && <p className="nlm__error">{error}</p>}

          <label className="nlm__field">
            <span className="nlm__label">Nombre del local *</span>
            <input
              type="text"
              className="nlm__input"
              value={form.name}
              onChange={set('name')}
              placeholder="Sucursal Centro"
              maxLength={120}
              autoFocus
            />
          </label>

          <div className="nlm__section">Destino de los escaneos</div>

          <label className="nlm__field">
            <span className="nlm__label">Link del formulario de reseñas de Google</span>
            <input
              type="url"
              className="nlm__input"
              value={form.google_review_url}
              onChange={set('google_review_url')}
              placeholder="https://g.page/r/.../review"
            />
            <span className="nlm__hint">
              Lo sacás de tu Perfil de Empresa de Google → “Pedir reseñas” / “Compartir formulario
              de reseñas”. Es a donde va a aterrizar el cliente cuando toque el expositor.
            </span>
          </label>

          <div className="nlm__row">
            <label className="nlm__field">
              <span className="nlm__label">Place ID</span>
              <input
                type="text"
                className="nlm__input"
                value={form.google_place_id}
                onChange={set('google_place_id')}
                placeholder="ChIJ…"
              />
            </label>
            <label className="nlm__field">
              <span className="nlm__label">Link de Google Maps</span>
              <input
                type="url"
                className="nlm__input"
                value={form.google_maps_url}
                onChange={set('google_maps_url')}
                placeholder="https://maps.google.com/…"
              />
            </label>
          </div>
          <p className="nlm__hint nlm__hint--block">
            Los tres campos de Google son escalones de la misma cascada: se usa el link de reseñas
            si está, si no se arma uno con el Place ID, y si no se manda al link de Maps. Con uno
            alcanza.
          </p>

          <label className="nlm__field">
            <span className="nlm__label">Usuario de Instagram</span>
            <input
              type="text"
              className="nlm__input"
              value={form.instagram_handle}
              onChange={set('instagram_handle')}
              placeholder="tunegocio"
            />
            <span className="nlm__hint">Sin la arroba. Es el destino de los expositores de Instagram.</span>
          </label>

          <div className="nlm__section">Datos del local (opcionales)</div>

          <div className="nlm__row">
            <label className="nlm__field">
              <span className="nlm__label">Dirección</span>
              <input type="text" className="nlm__input" value={form.address} onChange={set('address')} placeholder="Av. Corrientes 1234" />
            </label>
            <label className="nlm__field">
              <span className="nlm__label">Ciudad</span>
              <input type="text" className="nlm__input" value={form.city} onChange={set('city')} placeholder="Buenos Aires" />
            </label>
          </div>

          <div className="nlm__row">
            <label className="nlm__field">
              <span className="nlm__label">Provincia</span>
              <input type="text" className="nlm__input" value={form.province} onChange={set('province')} placeholder="CABA" />
            </label>
            <label className="nlm__field">
              <span className="nlm__label">Teléfono</span>
              <input type="tel" className="nlm__input" value={form.phone} onChange={set('phone')} placeholder="+54 11 0000-0000" />
            </label>
          </div>

          <div className="nlm__footer">
            <button type="button" className="loc-modal__action-btn loc-modal__action-btn--secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="loc-modal__action-btn loc-modal__action-btn--primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear ubicación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
