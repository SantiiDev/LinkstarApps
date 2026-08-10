// Valida el JWT de sesión de Supabase Auth que manda el frontend en
// `Authorization: Bearer <token>`. Usa el cliente service_role (ver
// server.js) porque validar tokens de otros usuarios requiere privilegios
// que el cliente anon no tiene.
export function requireAuth(supabase) {
  return async function (req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Falta el token de sesión' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    req.user = data.user;
    next();
  };
}
