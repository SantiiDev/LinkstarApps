export const PORT = process.env.PORT || 3001;
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// Dominio corto grabado en el NFC / impreso en el QR: https://<REDIRECT_DOMAIN>/d/<public_id>
// (ver comentario de devices.public_id en supabase/migrations/0003_catalog.sql).
export const REDIRECT_DOMAIN = process.env.REDIRECT_DOMAIN || 'l.linkstar.com.ar';
