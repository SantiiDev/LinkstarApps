import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

/* Organización activa del usuario y estado de su suscripción.
 *
 * Todo sale de una sola RPC, my_org_context() (migración 0013), y no de
 * consultas sueltas a `organizations` / `subscriptions`. El motivo es RLS: la
 * política subscriptions_select sólo deja leer la suscripción a owner/admin,
 * así que un manager o un viewer que consultara la tabla directo no vería
 * nada y el guard lo mandaría al selector de planes para siempre, sin salida.
 * La RPC es SECURITY DEFINER y devuelve únicamente lo necesario para enrutar.
 *
 * `context` en null con sesión activa significa "este usuario no tiene
 * organización todavía" — es un estado válido, no un error: pasa siempre
 * entre el registro y el alta de la empresa. */
const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      setContext(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('my_org_context');

    if (rpcError) {
      console.error('No se pudo leer el contexto de la organización:', rpcError);
      setError(rpcError);
      setContext(null);
    } else {
      // La RPC devuelve un set: como mucho una fila (la organización activa).
      setContext(data?.[0] ?? null);
      setError(null);
    }
    setLoading(false);
  }, [user]);

  // Se espera a que AuthContext termine de restaurar la sesión: consultar
  // antes devolvería vacío para un usuario que sí está logueado.
  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const value = {
    org: context,
    /* Atajos, para que las pantallas no repitan la misma lógica de estado. */
    hasOrg: Boolean(context?.organization_id),
    hasChosenPlan: Boolean(context?.plan_selected_at),
    /* hasAccess = la suscripción está vigente. isActivated = eso Y, si el plan
       es gratis, hay un expositor vinculado. Son dos cosas distintas y el
       guard las usa para decidir a qué paso mandar al usuario: al selector de
       planes o a vincular su expositor. */
    hasAccess: Boolean(context?.has_access),
    hasDevices: Boolean(context?.has_devices),
    isActivated: Boolean(context?.is_activated),
    canManageBilling: context?.role === 'owner' || context?.role === 'admin',
    loading: authLoading || loading,
    error,
    refresh: load,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg debe usarse dentro de <OrgProvider>');
  return ctx;
}
