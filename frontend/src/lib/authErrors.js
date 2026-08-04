const TRANSLATIONS = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirmá tu email antes de iniciar sesión.'],
  [/user already registered/i, 'Ya existe una cuenta con ese email.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/unable to validate email address/i, 'El email no es válido.'],
  [/rate limit/i, 'Demasiados intentos. Probá de nuevo en unos minutos.'],
];

export function translateAuthError(message) {
  if (!message) return 'Ocurrió un error inesperado. Intentá de nuevo.';
  const match = TRANSLATIONS.find(([pattern]) => pattern.test(message));
  return match ? match[1] : message;
}
