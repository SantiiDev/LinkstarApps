import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

// Le avisa al backend que hubo un login para que actualice
// profiles.last_login_at (ver backend/server.js). Best-effort: si el
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

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'INITIAL_SESSION') setLoading(false);
      if (event === 'SIGNED_IN' && newSession) {
        setSessionExpired(false);
        notifyLoginEvent(newSession.access_token);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // Cierra la sesión a los 30 minutos sin actividad del usuario (mouse,
  // teclado, scroll, touch). Cada evento reinicia el timer; sólo corre
  // mientras hay una sesión activa.
  useEffect(() => {
    if (!session) return;

    let timeoutId;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSessionExpired(true);
        supabase.auth.signOut();
      }, INACTIVITY_LIMIT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer));

    return () => {
      clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [session]);

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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
