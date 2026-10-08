import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { API_URL } from '../lib/config';

const AuthContext = createContext(null);

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
const LAST_ACTIVITY_KEY = 'linkstar_last_activity';
// Cada cuánto, como mucho, se procesa un evento de actividad. `mousemove` y
// `scroll` disparan decenas de veces por segundo y el límite de inactividad es
// de 30 minutos: registrar la actividad con 5 segundos de resolución adelanta el
// vencimiento 5 segundos en el peor caso, que no le cambia nada a nadie.
const ACTIVITY_THROTTLE_MS = 5000;

function markActivity() {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

// Si la app estuvo cerrada más de INACTIVITY_LIMIT_MS, la sesión restaurada
// desde localStorage debe tratarse como expirada aunque el token siga vigente.
// Sin marca previa (primer login en este navegador) no hay nada que evaluar.
function isInactiveTooLong() {
  const last = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!last) return false;
  return Date.now() - Number(last) > INACTIVITY_LIMIT_MS;
}

// Le avisa al backend que hubo un login para que actualice
// profiles.last_login_at (ver services/api/routes/auth.js). Best-effort: si el
// backend está caído no debe romper el login del usuario.
async function notifyLoginEvent(accessToken) {
  try {
    await fetch(`${API_URL}/api/auth/login-event`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error('No se pudo registrar el login en el backend:', err);
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  // De quién es la sesión que ya tenemos. Supabase revalida la sesión cada vez
  // que la pestaña vuelve a tener el foco y emite SIGNED_IN (o TOKEN_REFRESHED)
  // con un objeto `user` nuevo para el MISMO usuario. Eso no es un login: no se
  // registra en el backend, y los consumidores tienen que mirar el id, no el
  // objeto (OrgContext recargaba todo el panel con «Cargando…» al volver a la
  // pestaña por eso).
  const currentUserId = useRef(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      // La sesión persistida sigue siendo válida para Supabase (el refresh
      // token no expiró), pero si pasaron más de 30 min desde la última
      // actividad registrada, la tratamos igual que un timeout por inactividad.
      if (event === 'INITIAL_SESSION' && newSession && isInactiveTooLong()) {
        setLoading(false);
        setSessionExpired(true);
        supabase.auth.signOut();
        return;
      }

      const newUserId = newSession?.user?.id ?? null;
      const isNewLogin = event === 'SIGNED_IN' && newSession && newUserId !== currentUserId.current;
      currentUserId.current = newUserId;

      setSession(newSession);
      if (event === 'INITIAL_SESSION') setLoading(false);
      if (isNewLogin) {
        setSessionExpired(false);
        markActivity();
        notifyLoginEvent(newSession.access_token);
      }
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // Cierra la sesión a los 30 minutos sin actividad del usuario (mouse,
  // teclado, scroll, touch). Cada evento reinicia el timer; sólo corre
  // mientras hay una sesión activa. Depende del usuario y no del objeto de
  // sesión: renovar el token (al volver a la pestaña, o cada hora) no es
  // actividad y no tiene que reiniciar el contador.
  const sessionUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (!sessionUserId) return;

    let timeoutId;
    let lastSeen = 0;

    const armTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSessionExpired(true);
        supabase.auth.signOut();
      }, INACTIVITY_LIMIT_MS);
    };

    // El handler corre en CADA evento, y `mousemove` y `scroll` disparan decenas
    // de veces por segundo mientras el usuario usa el panel. Rearmar un timeout
    // de 30 minutos con esa frecuencia es trabajo tirado: adelantar el
    // vencimiento unos segundos no cambia nada para nadie. Así que todo el
    // cuerpo —no sólo la escritura a localStorage— pasa por el mismo throttle,
    // y entre toque y toque el listener sale en la primera línea.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastSeen < ACTIVITY_THROTTLE_MS) return;
      lastSeen = now;
      armTimer();
      markActivity();
    };

    // `passive: true` le promete al browser que esto nunca llama a
    // preventDefault(), así que puede seguir scrolleando sin esperar a que el
    // handler termine. Ninguno de estos listeners cancela nada.
    armTimer();
    lastSeen = Date.now();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );

    return () => {
      clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, [sessionUserId]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    // Si el proyecto de Supabase exige confirmar el email, signUp no
    // devuelve sesión — hay que avisarle al usuario en vez de tratarlo
    // como si ya hubiera iniciado sesión.
    return { error, needsEmailConfirmation: !error && !data.session };
  }, []);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  // El nombre vive en user_metadata, que es de donde lo leen el Sidebar y el
  // Perfil. El trigger on_auth_user_created (0002) lo copia a `profiles` sólo
  // al registrarse, así que cambiarlo acá no actualiza esa tabla — hoy no la
  // lee nadie para mostrar el nombre, pero conviene saberlo.
  const updateFullName = useCallback(async (fullName) => {
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });
    return { error };
  }, []);

  /* Supabase NO pide la contraseña actual para cambiarla mientras hay sesión
     abierta. La pedimos igual y la verificamos con un signInWithPassword
     contra el mismo mail, porque en este producto la computadora del local se
     queda con la sesión iniciada: sin ese paso, cualquiera que pase por ahí se
     queda con la cuenta. Un intento fallido no toca la sesión existente. */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const email = session?.user?.email;
    if (!email) return { error: { message: 'No hay una sesión activa.' } };

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      return { error: { message: 'La contraseña actual no es correcta.' } };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }, [session]);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    sessionExpired,
    clearSessionExpired,
    signIn,
    signUp,
    signOut,
    updateFullName,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
