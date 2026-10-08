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
 * entre el registro y el alta de la empresa.
 *
 * ── Varias organizaciones (0027) ──────────────────────────────────────────
 * `organizations` es la lista para el selector (list_my_organizations) y
 * `switchOrganization(id)` escribe la elegida con set_active_organization y
 * vuelve a cargar. Esa recarga pone `loading` en true, y RequireActivePlan
 * desmonta y vuelve a montar todo /panel: cada pantalla vuelve a pedir sus
 * datos con la organización nueva y el guard la evalúa de cero (si no tiene
 * plan vigente, va a /alta/plan, que es lo correcto).
 *
 * La lista es un extra: si la RPC falla —por ejemplo, porque la 0027 todavía
 * no se aplicó en ese entorno— queda vacía, el selector no aparece y el resto
 * del panel funciona igual. */
const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  /* El id, no el objeto `user`: Supabase entrega un objeto nuevo cada vez que
     renueva el token, y eso pasa también al volver a la pestaña del navegador.
     Con el objeto como dependencia, cada vuelta a la pestaña recargaba el
     contexto con `loading` en true, RequireActivePlan mostraba «Cargando…» y
     todo /panel se desmontaba y perdía dónde estaba. */
  const userId = user?.id ?? null;
  const [context, setContext] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retentionDays, setRetentionDays] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setContext(null);
      setOrganizations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ data, error: rpcError }, list] = await Promise.all([
      supabase.rpc('my_org_context'),
      supabase.rpc('list_my_organizations'),
    ]);

    if (list.error) {
      console.error('No se pudo leer la lista de organizaciones:', list.error);
      setOrganizations([]);
    } else {
      setOrganizations(list.data ?? []);
    }

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
  }, [userId]);

  // Se espera a que AuthContext termine de restaurar la sesión: consultar
  // antes devolvería vacío para un usuario que sí está logueado.
  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  /* Cuántos días de historial deja ver el plan (plans.data_retention_days, 0034).
     El corte de verdad lo hacen las políticas de la base; esto sólo sirve para
     que las pantallas no ofrezcan un período que la base va a devolver vacío, y
     para que digan por qué. Se pide aparte y no bloquea la carga: mientras no
     llega es null, y null significa «no recortar nada en pantalla». */
  const planCode = context?.plan_code ?? null;
  useEffect(() => {
    if (!planCode) {
      setRetentionDays(null);
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('plans')
      .select('data_retention_days')
      .eq('code', planCode)
      .maybeSingle()
      .then(({ data, error: planError }) => {
        if (cancelled) return;
        if (planError) console.error('No se pudo leer el historial del plan:', planError);
        setRetentionDays(data?.data_retention_days ?? null);
      });
    return () => { cancelled = true; };
  }, [planCode]);

  /* Lanza si la base rechaza el cambio (p. ej. ya no sos miembro): quien llama
     muestra el error. Si sale bien, recarga todo el contexto. */
  const switchOrganization = useCallback(async (organizationId) => {
    if (!organizationId || organizationId === context?.organization_id) return;
    const { error: rpcError } = await supabase.rpc('set_active_organization', { p_org: organizationId });
    if (rpcError) throw rpcError;
    await load();
  }, [context?.organization_id, load]);

  const value = {
    org: context,
    /* Atajos, para que las pantallas no repitan la misma lógica de estado. */
    hasOrg: Boolean(context?.organization_id),
    hasChosenPlan: Boolean(context?.plan_selected_at),
    /* hasAccess = la suscripción está vigente, y es lo único que mira el guard
       del panel.

       `isActivated` llegó con la 0015, cuando el plan gratis además exigía un
       expositor vinculado. La 0022 revirtió esa regla y dejó org_is_activated()
       como alias de org_has_access(), así que hoy los dos valores son iguales.
       Se mantienen los dos en el contrato porque las policies de la 0014 siguen
       llamando a esa función por nombre: es el punto único donde volver a
       agregar una condición de activación sin tocar veinte políticas.

       `hasDevices` sí sigue siendo útil por su cuenta: responde "¿hay algo que
       medir todavía?", que es otra pregunta. */
    hasAccess: Boolean(context?.has_access),
    hasDevices: Boolean(context?.has_devices),
    isActivated: Boolean(context?.is_activated),
    canManageBilling: context?.role === 'owner' || context?.role === 'admin',
    /* Lo que BusinessLock destapa. Es la misma regla que private.org_has_business()
       (0029), que es la que corta de verdad: esto sólo decide qué se dibuja. */
    isBusiness: Boolean(context?.has_access) && ['business', 'enterprise'].includes(context?.plan_code),
    retentionDays,
    loading: authLoading || loading,
    error,
    refresh: load,
    organizations,
    switchOrganization,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg debe usarse dentro de <OrgProvider>');
  return ctx;
}
