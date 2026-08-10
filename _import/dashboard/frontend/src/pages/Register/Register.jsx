import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { translateAuthError } from '../../lib/authErrors';
import './Register.css';

export default function Register({ onSuccess, onGoLogin, onBack }) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp(email, password, fullName);
    setSubmitting(false);

    if (signUpError) {
      setError(translateAuthError(signUpError.message));
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmationSent(true);
      return;
    }
    onSuccess();
  }

  return (
    <div className="auth-page">
      <button type="button" className="auth-page__back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Volver
      </button>

      <div className="auth-card">
        <div className="auth-card__logo" onClick={onBack}>
          linkstar<span className="auth-card__logo-dot">.</span>
        </div>

        <h1 className="auth-card__title">Creá tu cuenta</h1>
        <p className="auth-card__subtitle">Empezá a gestionar tus reseñas con Linkstar</p>

        {error && <div className="auth-card__error">{error}</div>}
        {confirmationSent && (
          <div className="auth-card__success">
            Te enviamos un email para confirmar tu cuenta. Revisá tu bandeja de entrada.
          </div>
        )}

        {!confirmationSent && (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-form__field">
              <span className="auth-form__label">Nombre completo</span>
              <input
                type="text"
                className="auth-form__input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>

            <label className="auth-form__field">
              <span className="auth-form__label">Email</span>
              <input
                type="email"
                className="auth-form__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="auth-form__field">
              <span className="auth-form__label">Contraseña</span>
              <input
                type="password"
                className="auth-form__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="auth-form__field">
              <span className="auth-form__label">Confirmar contraseña</span>
              <input
                type="password"
                className="auth-form__input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <button type="submit" className="auth-form__submit" disabled={submitting}>
              {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </form>
        )}

        <p className="auth-card__switch">
          ¿Ya tenés cuenta?{' '}
          <button type="button" className="auth-card__switch-link" onClick={onGoLogin}>
            Iniciá sesión
          </button>
        </p>
      </div>
    </div>
  );
}
