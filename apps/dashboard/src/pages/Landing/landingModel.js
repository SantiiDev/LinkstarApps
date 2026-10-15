import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useBusinessPlan } from '../../lib/plans';
import { BUSINESS_CHECKOUT_ENABLED, effectiveCheckoutMode } from '../../lib/config';
import { PUBLIC_ROUTES } from '../../lib/routes';

/*
 * Lo que comparten las páginas de la landing y no es un componente: el contexto
 * de las acciones, los hooks y las listas. Vive aparte de LandingBlocks.jsx para
 * que el fast refresh de Vite siga funcionando (un archivo de componentes sólo
 * debería exportar componentes).
 */

/* ─── Acciones ─────────────────────────────────────────────────────────────
   Las provee Landing.jsx: `onLogin` (login o panel), `onStart(planCode)`
   (registro o panel) y `loggedIn`. Es un contexto propio y no el del <Outlet>
   porque el navbar y el pie viven en el layout, fuera del Outlet. */
export const LandingActionsContext = createContext({ loggedIn: false, onLogin: () => {}, onStart: () => {} });

export function useLandingActions() {
  return useContext(LandingActionsContext);
}

/* El botón principal de toda la landing. Sigue al modo REAL del plan Business
   (effectiveCheckoutMode): con el cobro prendido invita a la prueba de Business;
   con VITE_BUSINESS_CHECKOUT=off invita al plan gratis, porque ofrecer una
   prueba que después termina en «Contactar con ventas» sería prometer algo que
   el alta no puede cumplir. Con sesión, lleva al panel. */
export function useStartCta() {
  const { onStart, loggedIn } = useLandingActions();
  const { plan } = useBusinessPlan();

  if (loggedIn) return { label: 'Ir al panel', onClick: () => onStart() };

  // Mientras el plan carga (o si la consulta falla) se decide sólo con el
  // interruptor de la compilación, que es lo que más pesa.
  const mode = plan ? effectiveCheckoutMode(plan) : BUSINESS_CHECKOUT_ENABLED ? 'subscription' : 'contact';
  if (mode === 'subscription') {
    const days = plan?.trial_days || 7;
    return { label: `Probar ${days} días gratis`, onClick: () => onStart('business') };
  }
  return { label: 'Empezar gratis', onClick: () => onStart('free') };
}

/* ─── Funciones ────────────────────────────────────────────────────────────
   Las seis partes de Funciones: el desplegable del navbar, los chips del hero
   de Funciones y las tarjetas de Inicio salen de esta lista. `hash` es el id
   de la sección en FeaturesPage. */
export const FEATURE_LINKS = [
  { hash: 'seo', icon: 'search', title: 'Visibilidad SEO', desc: 'Tu puntaje y qué cambiar para aparecer más' },
  { hash: 'resenas', icon: 'star', title: 'Reseñas', desc: 'Todas tus reseñas de Google en una bandeja' },
  { hash: 'ia', icon: 'sparkles', title: 'IA y automatizaciones', desc: 'Respuestas con tu tono, con un clic o solas' },
  { hash: 'google', icon: 'globe', title: 'Google Business', desc: 'Perfil, publicaciones y métricas de tu ficha' },
  { hash: 'reportes', icon: 'trend', title: 'Reportes', desc: 'NPS, sentimiento y palabras clave' },
  { hash: 'dispositivos', icon: 'qr', title: 'Expositores', desc: 'Escaneos de cada expositor y avisos si uno se apaga' },
];

export const featurePath = (hash) => `${PUBLIC_ROUTES.features}#${hash}`;

/* ─── Planes ───────────────────────────────────────────────────────────────
   Salen de la tabla `plans` — la misma que lee el selector del alta, así que la
   vitrina y lo que se cobra no pueden separarse (plans_public_select, 0006, deja
   leerla sin sesión).

   PRICING_FALLBACK es sólo para cuando la consulta falla: la landing no puede
   quedarse sin precios porque Supabase tardó. Copia el seed de la 0013. */
const PRICING_FALLBACK = [
  {
    code: 'free',
    name: 'Gratis',
    description: 'Incluido con tu expositor. Para empezar a medir desde el primer día.',
    price_ars: 0,
    checkout_mode: 'free',
    trial_days: 0,
    max_locations: 1,
    features: {
      highlights: [
        'Hasta 3 dispositivos',
        '1 ubicación',
        'Escaneos y reseñas estimadas en tiempo real',
        '30 días de historial',
        'Soporte por email',
      ],
    },
  },
  {
    code: 'business',
    name: 'Business',
    description: 'Analizá, gestioná y automatizá tu empresa.',
    price_ars: 24900,
    checkout_mode: 'subscription',
    trial_days: 7,
    max_locations: 5,
    features: {
      highlights: [
        'Hasta 25 dispositivos',
        'Hasta 5 ubicaciones',
        'Reportes de NPS, sentimiento y palabras clave',
        'Automatizaciones e informes mensuales',
        'Métricas de Google Business Profile',
        '1 año de historial',
        'Soporte prioritario',
      ],
    },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'A medida para empresas y cadenas con más de 30 locales.',
    price_ars: 0,
    checkout_mode: 'contact',
    trial_days: 0,
    max_locations: null,
    features: {
      highlights: [
        'Ubicaciones y dispositivos ilimitados',
        'Comparativas entre locales y regiones',
        'Integraciones y exportación de datos',
        '3 años de historial',
        'Onboarding y soporte dedicado',
      ],
    },
  },
];

// Se pide una vez por pestaña: Inicio, Multiubicaciones y Planes leen la misma lista.
let plansCache = null;

export function usePublicPlans() {
  const [plans, setPlans] = useState(plansCache ?? PRICING_FALLBACK);

  useEffect(() => {
    if (plansCache) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('code, name, description, price_ars, checkout_mode, trial_days, max_locations, features')
        .eq('is_public', true)
        .order('sort_order', { ascending: true });
      // Ante error o catálogo vacío queda el fallback: una sección de precios en
      // blanco es peor que precios de hace un deploy.
      if (error || !data?.length) return;
      plansCache = data;
      if (!cancelled) setPlans(data);
    })();
    return () => { cancelled = true; };
  }, []);

  return plans;
}

/* ─── Título de la pestaña ───────────────────────────────────────────── */
export function usePageTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);
}
