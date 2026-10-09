const TRANSLATIONS = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirmá tu email antes de iniciar sesión.'],
  [/user already registered/i, 'Ya existe una cuenta con ese email.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/unable to validate email address/i, 'El email no es válido.'],
  [/rate limit/i, 'Demasiados intentos. Probá de nuevo en unos minutos.'],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Login y Registro validan acá, con `noValidate` en el <form>: el globo nativo
   del navegador sale con su idioma y su estilo, no en el cuadro de error de la
   tarjeta donde aparece todo lo demás. Devuelve '' si está todo bien. */
export function credentialsError(email, password) {
  if (!email.trim()) return 'Ingresá tu email.';
  if (!EMAIL_RE.test(email.trim())) return 'El email no es válido.';
  if (!password) return 'Ingresá tu contraseña.';
  return '';
}

export function translateAuthError(message) {
  if (!message) return 'Ocurrió un error inesperado. Intentá de nuevo.';
  const match = TRANSLATIONS.find(([pattern]) => pattern.test(message));
  return match ? match[1] : message;
}
