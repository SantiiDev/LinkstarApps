import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader/PageHeader';
import './Profile.css';

function initialsFor(name, email) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ProfilePage() {
  const { user } = useAuth();
  const fullName = user?.user_metadata?.full_name || '';
  const [name, setName] = useState(fullName);

  return (
    <div className="profile-page">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mi Perfil"
        subtitle="Administrá tu información personal y tu contraseña"
      />

      <div className="profile-panel">
        <div className="profile-card profile-card--hero">
          <div className="profile-avatar">{initialsFor(fullName, user?.email)}</div>
          <div className="profile-hero-body">
            <div className="profile-hero-name">{fullName || 'Usuario'}</div>
            <div className="profile-hero-email">{user?.email}</div>
          </div>
        </div>

        <div className="profile-card">
          <h3 className="profile-card__title">Información personal</h3>
          <p className="profile-card__subtitle">Estos datos aparecen en tu cuenta y en las respuestas que firmes.</p>

          <div className="profile-form-grid">
            <label className="profile-field">
              <span>Nombre completo</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="profile-field">
              <span>Email</span>
              <input type="email" value={user?.email || ''} disabled />
            </label>
          </div>

          <button className="profile-save-btn">Guardar cambios</button>
        </div>

        <div className="profile-card">
          <h3 className="profile-card__title">Cambiar contraseña</h3>
          <p className="profile-card__subtitle">Elegí una contraseña segura que no uses en otros sitios.</p>

          <div className="profile-form-grid">
            <label className="profile-field profile-field--full">
              <span>Contraseña actual</span>
              <input type="password" placeholder="••••••••" />
            </label>
            <label className="profile-field">
              <span>Nueva contraseña</span>
              <input type="password" placeholder="••••••••" />
            </label>
            <label className="profile-field">
              <span>Confirmar nueva contraseña</span>
              <input type="password" placeholder="••••••••" />
            </label>
          </div>

          <button className="profile-save-btn">Actualizar contraseña</button>
        </div>
      </div>
    </div>
  );
}
