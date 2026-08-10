import { createClient } from '@supabase/supabase-js';

// El schema en packages/database/supabase/migrations/0006_rls.sql niega insert/update/delete
// sobre `orders` y ejecución de `resolve_scan` a `anon`/`authenticated` a
// propósito: sólo un cliente de confianza (este backend) puede escribir ahí.
// Por eso este cliente usa la service_role key, no la publishable/anon.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️  Falta SUPABASE_SERVICE_ROLE_KEY en .env — las escrituras a `orders` y ' +
    'las funciones resolve_scan/record_webhook_event van a fallar por RLS. ' +
    'Buscala en el dashboard de Supabase: Project Settings → API → service_role secret.'
  );
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
