import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { API_URL } from './config';

/* Conexión con Google Business Profile (migración 0024 + services/api/routes/google.js).
 *
 * El panel nunca toca credenciales ni tokens de Google. Hace tres cosas:
 *
 *   - Lee el ESTADO de la conexión de `google_connections`, que es una tabla
 *     sin secretos con RLS (el refresh token vive cifrado en `private`).
 *   - Pide al API la URL de Google y navega a ella. El fetch lleva
 *     `credentials: 'include'` por una razón concreta: el API setea en esa
 *     respuesta la cookie con el `state` anti-CSRF, y el callback exige que el
 *     navegador que vuelve de Google la traiga. Sin `include` el navegador la
 *     descarta y la conexión falla SIEMPRE en el último paso, con "error_estado".
 *   - Pide al API que desconecte (revoca en Google y borra).
 */

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión vencida');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function fetchGoogleConnection(organizationId) {
  const { data, error } = await supabase
    .from('google_connections')
    .select('status, connected_at, last_synced_at, last_error, last_error_at')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* No devuelve: si sale bien, el navegador ya se fue a Google. */
export async function startGoogleConnect() {
  const response = await fetch(`${API_URL}/api/google/oauth/start`, {
    method: 'POST',
    credentials: 'include',
    headers: await authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) {
    throw new Error(body.error || 'No se pudo iniciar la conexión con Google');
  }
  window.location.assign(body.url);
}

export async function disconnectGoogle() {
  const response = await fetch(`${API_URL}/api/google/disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo desconectar Google');
  }
}

/* Lo que vuelve en ?google= después de pasar por Google (backToDashboard en
 * routes/google.js). Un código desconocido cae en `error`. */
export const GOOGLE_RESULT_MESSAGES = {
  conectado: { tone: 'ok', text: 'Listo, tu ficha de Google quedó conectada. Estamos leyendo tus reseñas.' },
  cancelado: { tone: 'info', text: 'Cancelaste la conexión con Google. Podés intentarlo de nuevo cuando quieras.' },
  sin_permiso: {
    tone: 'error',
    text: 'Google no nos dio permiso para leer tu ficha. Volvé a intentarlo y dejá marcada la casilla de Google Business Profile.',
  },
  sin_rol: { tone: 'error', text: 'Sólo un propietario o administrador de la cuenta puede conectar Google.' },
  error_estado: {
    tone: 'error',
    text: 'La conexión venció o se abrió en otro navegador. Volvé a tocar “Conectar” desde acá.',
  },
  error: { tone: 'error', text: 'No pudimos conectar tu ficha de Google. Probá de nuevo en unos minutos.' },
};

/* Estado de la conexión de la organización activa.
 *
 * Mientras la primera lectura corre en segundo plano (el callback la dispara
 * apenas se conecta), consulta cada 5 segundos hasta que termine — así la
 * pantalla pasa de "leyendo tu ficha" a "última lectura" sin recargar. Corta a
 * los 2 minutos: si para entonces no terminó, lo va a resolver el job diario. */
export function useGoogleConnection(organizationId) {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(Boolean(organizationId));
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!organizationId) return;
    try {
      setConnection(await fetchGoogleConnection(organizationId));
      setFailed(false);
    } catch (err) {
      console.error('No se pudo leer el estado de la conexión con Google:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const firstSyncPending =
    connection?.status === 'active' && !connection.last_synced_at && !connection.last_error;

  useEffect(() => {
    if (!firstSyncPending) return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > 120_000) clearInterval(timer);
      else reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [firstSyncPending, reload]);

  return { connection, loading, failed, reload, firstSyncPending };
}
