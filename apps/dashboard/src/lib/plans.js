import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

/*
 * El plan Business, leído de la tabla `plans` — la fuente de verdad del precio,
 * la prueba gratis y el modo de alta (ver «Pricing» en CLAUDE.md). Lo usa la
 * oferta de Business (components/BusinessOffer: el modal de ventas y
 * Configuración → Plan); el selector de planes y la landing leen su propia
 * lista completa.
 *
 * Se pide una vez por pestaña: el precio no cambia mientras alguien navega, y el
 * modal aparece en tres secciones seguidas. Un error no se guarda, así el
 * próximo modal vuelve a intentar.
 */

let cached = null;
let pending = null;

function loadBusinessPlan() {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = supabase
      .from('plans')
      .select('code, name, description, price_ars, trial_days, checkout_mode, max_locations, max_devices, features')
      .eq('code', 'business')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        cached = data;
        return data;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

/* { plan, loading, error }: `plan` es null mientras carga o si falló. */
export function useBusinessPlan() {
  const [state, setState] = useState(() => ({ plan: cached, loading: !cached, error: null }));

  useEffect(() => {
    if (cached) return undefined;
    let cancelled = false;
    loadBusinessPlan()
      .then((plan) => { if (!cancelled) setState({ plan, loading: false, error: null }); })
      .catch((error) => {
        console.error('No se pudo leer el plan Business:', error);
        if (!cancelled) setState({ plan: null, loading: false, error });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
