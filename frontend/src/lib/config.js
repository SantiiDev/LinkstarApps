// Dominio corto grabado en el NFC / impreso en el QR: https://<REDIRECT_DOMAIN>/d/<public_id>
// Mismo valor que backend/lib/config.js REDIRECT_DOMAIN — cada app lo define
// por separado porque son deploys independientes (ver CLAUDE.md).
export const REDIRECT_DOMAIN = import.meta.env.VITE_REDIRECT_DOMAIN || 'l.linkstar.com.ar';
