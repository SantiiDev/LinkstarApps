-- ============================================================================
-- LINKSTAR — 0022: el plan gratis YA NO exige un expositor vinculado
-- ============================================================================
-- Revierte la regla de producto de la 0015. El motivo de aquella —"gratis sin
-- dispositivo no es un cliente"— es cierto, pero el costo es peor: el expositor
-- llega días después del alta, así que la regla deja afuera del panel justo al
-- que ya compró y está esperando el envío. Y para distinguir al comprador del
-- curioso haría falta cruzar la cuenta con la orden de compra, que hoy no
-- existe como vínculo.
--
-- La función NO se borra: las políticas de la 0014 y `private.orgs_with_access`
-- la llaman por nombre. Se le saca la condición del dispositivo y queda como un
-- alias de org_has_access() — así el día que vuelva a haber una condición de
-- activación, se cambia acá y no en veinte policies.
--
-- `my_org_context()` no se toca: sigue devolviendo `has_devices` e
-- `is_activated`. El primero le sirve al panel para saber si ya hay algo que
-- medir; el segundo ahora vale lo mismo que `has_access`, y se mantiene en el
-- contrato para no romper el front que ya lo lee.
-- ============================================================================

create or replace function public.org_is_activated(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.org_has_access(p_org);
$$;

comment on function public.org_is_activated(uuid) is
  'Acceso efectivo al panel. Desde la 0022 es equivalente a org_has_access(): el plan gratis ya no exige expositor vinculado. Se conserva como punto único donde volver a agregar condiciones de activación.';
