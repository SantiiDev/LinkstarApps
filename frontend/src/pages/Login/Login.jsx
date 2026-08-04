import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { translateAuthError } from '../../lib/authErrors';
import './Login.css';

export default function Login({ onSuccess, onGoRegister, onBack }) {
  const { signIn, sessionExpired, clearSessionExpired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // El aviso de sesión expirada sólo es válido para esta visita a Login —
  // se limpia al navegar fuera para no reaparecer en un logout manual posterior.
  function handleBack() {
    clearSessionExpired();
    onBack();
  }

  function handleGoRegister() {
    clearSessionExpired();
    onGoRegister();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { error: signInError } = await signIn(email, password);

    setSubmitting(false);
    if (signInError) {
      setError(translateAuthError(signInError.message));
      return;
    }
    onSuccess();
  }

  return (
    <div className="auth-page">
      <button type="button" className="auth-page__back" onClick={handleBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Volver
      </button>

      <div className="auth-card">
        <div className="auth-card__logo" onClick={handleBack}>
          linkstar<span className="auth-card__logo-dot">.</span>
        </div>

        <h1 className="auth-card__title">Bienvenido de vuelta</h1>
        <p className="auth-card__subtitle">Iniciá sesión para acceder a tu panel</p>

        {sessionExpired && !error && (
          <div className="auth-card__notice">Tu sesión expiró por inactividad. Iniciá sesión nuevamente.</div>
        )}
        {error && <div className="auth-card__error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
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
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" className="auth-form__submit" disabled={submitting}>
            {submitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="auth-card__switch">
          ¿No tenés cuenta?{' '}
          <button type="button" className="auth-card__switch-link" onClick={handleGoRegister}>
            Registrate
          </button>
        </p>
      </div>
    </div>
  );
}
