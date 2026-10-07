-- ============================================================================
-- LINKSTAR — 0032: volver al plan gratis después de perder el acceso, y un
--                  desempate determinista para «la organización más vieja»
-- ============================================================================
-- Dos correcciones independientes, las dos encontradas el 7 de octubre de 2026.
--
-- ── 1. select_free_plan() no hacía nada y no avisaba ─────────────────────────
-- La 0013 sólo actualiza la suscripción si
--   plan_selected_at is null or plan_code = 'free'
-- y si no coincide ninguna fila, termina sin error. Dos casos caen afuera y
-- quedan trabados en /alta/plan para siempre: RequireActivePlan los manda ahí
-- porque no tienen acceso, eligen «Gratis», la RPC responde OK sin cambiar
-- nada, y el panel los vuelve a mandar al selector.
--
--   a) Un Business cancelado, vencido o pausado. El webhook deja la fila con
--      plan_code = 'business' y plan_selected_at cargado. Es el caso que importa:
--      le pasa a un cliente real el día que da de baja Business.
--   b) Un plan viejo de antes de la 0013 ('trial', 'starter', 'pro'). Pasó en
--      producción el 7 de octubre: la primera corrida de run_expire_subscriptions()
--      venció un 'trial' de agosto y hubo que arreglarlo a mano.
--
-- La regla nueva: se puede pasar a gratis si nunca se eligió plan, si ya era
-- gratis, o si la organización perdió el acceso (org_has_access = false). Lo
-- único que sigue bloqueado es bajar de un plan pago VIGENTE, porque Mercado
-- Pago lo seguiría cobrando; eso ahora es un error explícito (hint
-- 'paid_plan_active'), no un silencio. Al bajar desde otro plan se limpian las
-- fechas del plan anterior, como en cualquier fila 'free' recién creada.
--
-- Los ids de Mercado Pago (mp_preapproval_id, pending_plan_code) NO se tocan,
-- por lo mismo que explica la 0013 sobre pending_plan_code. Consecuencia
-- aceptada: si después llega un webhook tardío del preapproval viejo (p. ej.
-- 'cancelled'), apply_preapproval_event() puede volver a dejar la fila sin
-- acceso. Ya no es una trampa: el selector vuelve a aceptar «Gratis».
--
-- ── 2. «La organización más vieja» sin desempate ─────────────────────────────
-- private.active_org_id_for() y my_org_context() eligen la organización activa
-- con `order by (es la última elegida) desc, m.created_at asc limit 1`. Dos
-- membresías del mismo usuario creadas en la misma transacción tienen el mismo
-- now(), y entonces decide el orden físico de las filas: la sección 11 de
-- rls_isolation.sql falló así el 6 de octubre. En uso real no pasa, pero si
-- pasara, el panel y las RPC del API podrían elegir organizaciones distintas.
-- Se agrega m.organization_id como desempate en las dos.
-- list_my_organizations() (0027) ya ordena por (lower(name), id): no cambia.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. SELECT_FREE_PLAN
-- ---------------------------------------------------------------------------
create or replace function public.select_free_plan(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if not exists (
    select 1 from public.memberships
    where organization_id = p_org
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) then
    raise exception 'No tenés permiso para elegir el plan de esta organización'
      using errcode = '42501';
  end if;

  -- En el SET, plan_code es el valor ANTERIOR de la fila: así se distingue
  -- «ya era gratis» (se conservan sus fechas) de «baja desde otro plan».
  update public.subscriptions
  set plan_code            = 'free',
      status               = 'active',
      plan_selected_at     = coalesce(plan_selected_at, now()),
      current_period_start = case when plan_code = 'free'
                                  then coalesce(current_period_start, now())
                                  else now() end,
      current_period_end   = case when plan_code = 'free' then current_period_end end,
      trial_ends_at        = case when plan_code = 'free' then trial_ends_at end,
      grace_until          = case when plan_code = 'free' then grace_until end,
      cancel_at_period_end = case when plan_code = 'free' then cancel_at_period_end else false end
  where organization_id = p_org
    and (
      plan_selected_at is null
      or plan_code = 'free'
      or not public.org_has_access(p_org)
    );

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if not exists (select 1 from public.subscriptions where organization_id = p_org) then
      raise exception 'Esta organización no tiene suscripción'
        using errcode = 'P0002', hint = 'no_subscription';
    end if;
    raise exception 'Tu plan actual sigue vigente: cancelalo desde Facturación antes de pasar a Gratis'
      using errcode = 'P0001', hint = 'paid_plan_active';
  end if;
end;
$$;

revoke all on function public.select_free_plan(uuid) from public, anon;
grant execute on function public.select_free_plan(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. DESEMPATE EN LA ORGANIZACIÓN ACTIVA
-- ---------------------------------------------------------------------------
create or replace function private.active_org_id_for(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.organization_id
  from public.memberships m
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.user_id = p_user
  order by
    (o.id = (select pr.last_organization_id from public.profiles pr where pr.id = p_user)) desc,
    m.created_at asc,
    m.organization_id asc
  limit 1;
$$;

revoke all on function private.active_org_id_for(uuid) from public, anon, authenticated;
grant execute on function private.active_org_id_for(uuid) to service_role;

-- Mismo cuerpo que la 0015, con el desempate al final. Si alguna vez cambia el
-- criterio, cambia acá y en active_org_id_for() a la vez: el panel y el API
-- tienen que operar sobre la misma organización.
create or replace function public.my_org_context()
returns table (
  organization_id   uuid,
  organization_name text,
  organization_slug text,
  role              public.org_role,
  plan_code         text,
  plan_name         text,
  status            public.subscription_status,
  plan_selected_at  timestamptz,
  trial_ends_at     timestamptz,
  current_period_end timestamptz,
  grace_until       timestamptz,
  cancel_at_period_end boolean,
  has_access        boolean,
  has_devices       boolean,
  is_activated      boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id,
    o.name,
    o.slug::text,
    m.role,
    s.plan_code,
    p.name,
    s.status,
    s.plan_selected_at,
    s.trial_ends_at,
    s.current_period_end,
    s.grace_until,
    s.cancel_at_period_end,
    public.org_has_access(o.id),
    exists (
      select 1 from public.devices d
      where d.organization_id = o.id
        and d.deleted_at is null
        and d.status <> 'retired'
    ),
    public.org_is_activated(o.id)
  from public.memberships m
  join public.organizations o  on o.id = m.organization_id and o.deleted_at is null
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans p         on p.code = s.plan_code
  where m.user_id = auth.uid()
  order by
    (o.id = (select pr.last_organization_id from public.profiles pr where pr.id = auth.uid())) desc,
    m.created_at asc,
    m.organization_id asc
  limit 1;
$$;

revoke all on function public.my_org_context() from public, anon;
grant execute on function public.my_org_context() to authenticated;
