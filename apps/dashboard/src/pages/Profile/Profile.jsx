import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { translateAuthError } from '../../lib/authErrors';
import PageHeader from '../../components/PageHeader/PageHeader';
import { initialsFor } from '../../lib/dashboardApi';
import './Profile.css';

/* Hasta acá los dos botones de esta pantalla no tenían handler: el usuario
   escribía un nombre o una contraseña nueva, apretaba, y no pasaba nada — ni se
   guardaba ni aparecía un error. Ahora las dos cosas escriben de verdad, vía
   AuthContext, que es donde vive todo lo de Supabase Auth. */
export default function ProfilePage() {
  const { user, updateFullName, changePassword } = useAuth();
  const fullName = user?.user_metadata?.full_name || '';

  const [name, setName] = useState(fullName);
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);

  const setPassword = (key) => (e) => {
    setPasswords((p) => ({ ...p, [key]: e.target.value }));
    if (passwordMsg) setPasswordMsg(null);
  };

  async function handleSaveName(e) {
    e.preventDefault();
    if (savingName) return;

    const clean = name.trim();
    if (!clean) {
      setNameMsg({ type: 'error', text: 'Escribí tu nombre.' });
      return;
    }

    setSavingName(true);
    setNameMsg(null);
    const { error } = await updateFullName(clean);
    setSavingName(false);

    setNameMsg(
      error
        ? { type: 'error', text: translateAuthError(error.message) }
        : { type: 'ok', text: 'Listo, guardamos tu nombre.' },
    );
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (savingPassword) return;

    // Las mismas dos reglas que el registro, para no pedir en un lado algo que
    // en el otro se acepta.
    if (passwords.next.length < 6) {
      setPasswordMsg({ type: 'error', text: 'La contraseña nueva debe tener al menos 6 caracteres.' });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordMsg({ type: 'error', text: 'Las contraseñas nuevas no coinciden.' });
      return;
    }

    setSavingPassword(true);
    setPasswordMsg(null);
    const { error } = await changePassword(passwords.current, passwords.next);
    setSavingPassword(false);

    if (error) {
      setPasswordMsg({ type: 'error', text: translateAuthError(error.message) });
      return;
    }

    setPasswords({ current: '', next: '', confirm: '' });
    setPasswordMsg({ type: 'ok', text: 'Contraseña actualizada. Usá la nueva la próxima vez que entres.' });
  }

  return (
    <div className="profile-page">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mi Perfil"
        subtitle="Administrá tu información personal y tu contraseña"
      />

      <div className="profile-panel">
        <div className="profile-card profile-card--hero">
          <div className="profile-avatar">{initialsFor(fullName || user?.email)}</div>
          <div className="profile-hero-body">
            <div className="profile-hero-name">{fullName || 'Usuario'}</div>
            <div className="profile-hero-email">{user?.email}</div>
          </div>
        </div>

        <form className="profile-card" onSubmit={handleSaveName}>
          <h3 className="profile-card__title">Información personal</h3>
          <p className="profile-card__subtitle">Estos datos aparecen en tu cuenta y en las respuestas que firmes.</p>

          <div className="profile-form-grid">
            <label className="profile-field">
              <span>Nombre completo</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="profile-field">
              <span>Email</span>
              {/* El mail es el identificador de la cuenta y cambiarlo necesita
                  confirmar el nuevo por correo. Queda deshabilitado hasta que
                  ese flujo exista. */}
              <input type="email" value={user?.email || ''} disabled />
            </label>
          </div>

          {nameMsg && (
            <p className={`profile-msg profile-msg--${nameMsg.type}`}>{nameMsg.text}</p>
          )}

          <button type="submit" className="profile-save-btn" disabled={savingName}>
            {savingName ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        <form className="profile-card" onSubmit={handleChangePassword}>
          <h3 className="profile-card__title">Cambiar contraseña</h3>
          <p className="profile-card__subtitle">Elegí una contraseña segura que no uses en otros sitios.</p>

          <div className="profile-form-grid">
            <label className="profile-field profile-field--full">
              <span>Contraseña actual</span>
              <input
                type="password"
                placeholder="••••••••"
                value={passwords.current}
                onChange={setPassword('current')}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="profile-field">
              <span>Nueva contraseña</span>
              <input
                type="password"
                placeholder="••••••••"
                value={passwords.next}
                onChange={setPassword('next')}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="profile-field">
              <span>Confirmar nueva contraseña</span>
              <input
                type="password"
                placeholder="••••••••"
                value={passwords.confirm}
                onChange={setPassword('confirm')}
                autoComplete="new-password"
                required
              />
            </label>
          </div>

          {passwordMsg && (
            <p className={`profile-msg profile-msg--${passwordMsg.type}`}>{passwordMsg.text}</p>
          )}

          <button type="submit" className="profile-save-btn" disabled={savingPassword}>
            {savingPassword ? 'Actualizando…' : 'Actualizar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
