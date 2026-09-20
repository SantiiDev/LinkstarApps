import { useState } from 'react';
import { createEmployee, updateEmployee, catalogErrorMessage } from '../../lib/catalogApi';
import '../../components/FormModal/FormModal.css';

/* Alta y edición de un empleado.
 *
 * "Empleado" acá NO es un miembro del equipo. El mozo y el cajero no inician
 * sesión y no tienen usuario: existen para poder responder "qué empleado
 * consigue más reseñas" (v_employee_leaderboard). Los que entran al panel son
 * `memberships`, y se gestionan en pages/Settings/TeamMembers.jsx. Las dos
 * cosas conviven en la pestaña "Equipo" y confundirlas ya costó una vez.
 *
 * La sucursal es opcional en el esquema (`location_id` es nullable), pero sin
 * ella el empleado no puede recibir la atribución de ningún escaneo: los
 * expositores se asignan a un empleado desde Dispositivos, y `check_same_org()`
 * exige que empleado y sucursal sean de la misma organización.
 */

const EMPTY = {
  full_name: '',
  role_title: '',
  location_id: '',
  employee_code: '',
  email: '',
  phone: '',
};

function toForm(employee) {
  if (!employee) return { ...EMPTY };
  const form = { ...EMPTY };
  for (const key of Object.keys(EMPTY)) {
    form[key] = employee[key] ?? '';
  }
  return form;
}

export default function EmployeeForm({ organizationId, employee, locations = [], onClose, onSaved }) {
  const isEdit = Boolean(employee?.id);
  const [form, setForm] = useState(() => toForm(employee));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateEmployee(employee.id, form);
      } else {
        await createEmployee(organizationId, form);
      }
      onSaved();
    } catch (err) {
      console.error('No se pudo guardar el empleado:', err);
      setError(catalogErrorMessage(err, 'el empleado'));
      setSaving(false);
    }
  }

  return (
    <div className="fmodal-overlay" onClick={onClose}>
      <div className="fmodal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar empleado' : 'Nuevo empleado'}>
        <div className="fmodal__header">
          <h3 className="fmodal__title">{isEdit ? 'Editar empleado' : 'Nuevo empleado'}</h3>
          <button className="fmodal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form id="employee-form" className="fmodal__body" onSubmit={handleSubmit}>
          <p className="fmodal__section-text">
            Los empleados no inician sesión en el panel. Se cargan acá para poder asignarles un expositor
            y ver quién consigue más reseñas. Si querés darle acceso al panel a alguien, eso se hace desde
            «Miembros del equipo».
          </p>

          <label className="fmodal__field">
            <span className="fmodal__label">Nombre y apellido *</span>
            <input
              type="text"
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Ej. Lucía Fernández"
              minLength={2}
              maxLength={120}
              required
              autoFocus
            />
          </label>

          <div className="fmodal__row">
            <label className="fmodal__field">
              <span className="fmodal__label">Puesto</span>
              <input type="text" value={form.role_title} onChange={e => set('role_title', e.target.value)} placeholder="Mozo, Cajera, Recepcionista…" />
            </label>
            <label className="fmodal__field">
              <span className="fmodal__label">Sucursal</span>
              {/* select nativo y no el componente Select: éste vive dentro de un
                  modal con scroll propio, y el desplegable custom se recorta
                  contra el borde del cuerpo. */}
              <select value={form.location_id} onChange={e => set('location_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="fmodal__row">
            <label className="fmodal__field">
              <span className="fmodal__label">Legajo</span>
              <input type="text" value={form.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="Interno, opcional" />
            </label>
            <label className="fmodal__field">
              <span className="fmodal__label">Teléfono</span>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="341 555-0100" />
            </label>
          </div>

          <label className="fmodal__field">
            <span className="fmodal__label">Email</span>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="opcional" />
            <span className="fmodal__hint">Sólo como dato de contacto. No le da acceso al panel.</span>
          </label>

          {locations.length === 0 && (
            <p className="fmodal__warn">
              Todavía no cargaste ninguna sucursal. Podés crear al empleado igual y asignársela después,
              pero hasta entonces no va a poder recibir escaneos.
            </p>
          )}

          {error && <p className="fmodal__error" role="alert">{error}</p>}
        </form>

        <div className="fmodal__footer">
          <button type="button" className="fmodal__btn fmodal__btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="employee-form" className="fmodal__btn fmodal__btn--primary" disabled={saving || form.full_name.trim().length < 2}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear empleado'}
          </button>
        </div>
      </div>
    </div>
  );
}
