-- ============================================================================
-- LINKSTAR — 0015: el plan gratis necesita un expositor vinculado
-- ============================================================================
-- El plan gratis viene incluido CON el dispositivo. Alguien que se registra,
-- lo elige y nunca compró nada no es un cliente: es una cuenta vacía que
-- consume tablas y métricas. Así que el gratis abre la puerta del alta pero no
-- la del panel hasta que haya al menos un expositor vinculado.
--
-- Esto NO aplica a los planes pagos. Un cliente que ya autorizó el débito
-- mensual entra aunque su expositor todavía esté en el correo — cobrarle y
-- después dejarlo afuera es exactamente lo que no hay que hacer.
--
-- ── Dos chequeos distintos, y el orden importa ──────────────────────────
--
--   org_has_access(org)     ¿la suscripción está vigente? (0005)
--   org_is_activated(org)   lo anterior Y, si el plan es gratis, ¿hay un
--                           expositor vinculado?
--
-- claim_device() sigue usando el PRIMERO. Si usara el segundo, vincular el
-- primer expositor exigiría tener ya un expositor vinculado: la organización
-- quedaría encerrada para siempre sin forma de salir. Es el punto entero de
-- que sean dos funciones y no una.
-- ============================================================================

create or replace function public.org_is_activated(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.org_has_access(p_org)
     and (
       -- Planes pagos: alcanza con la suscripción vigente.
       not exists (
         select 1 from public.subscriptions s
         where s.organization_id = p_org and s.plan_code = 'free'
       )
       -- Plan gratis: hace falta un expositor vinculado y no dado de baja.
       or exists (
         select 1 from public.devices d
         where d.organization_id = p_org
           and d.deleted_at is null
           and d.status <> 'retired'
       )
     );
$$;

comment on function public.org_is_activated(uuid) is
  'Acceso efectivo al panel: suscripción vigente + (plan pago o al menos un expositor vinculado).';


-- ---------------------------------------------------------------------------
-- Las políticas de 0014 pasan a usar el chequeo efectivo.
--
-- Se reemplazan las dos funciones y no las políticas: todas las de 0014 se
-- apoyan en estas dos, así que cambiarlas acá alcanza y no hay que volver a
-- escribir una sola policy.
-- ---------------------------------------------------------------------------
create or replace function private.orgs_with_access(p_roles public.org_role[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and (p_roles is null or m.role = any(p_roles))
    and public.org_is_activated(m.organization_id);
$$;

create or replace function private.visible_location_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct l.id), '{}'::uuid[])
  from public.memberships m
  join public.locations l on l.organization_id = m.organization_id
  left join public.membership_locations ml
         on ml.membership_id = m.id and ml.location_id = l.id
  where m.user_id = auth.uid()
    and l.deleted_at is null
    and (m.role <> 'manager' or ml.location_id is not null)
    and public.org_is_activated(m.organization_id);
$$;


-- ---------------------------------------------------------------------------
-- my_org_context() — el dashboard necesita distinguir los dos estados para
-- saber a qué paso mandar al usuario: al selector de planes (no pagó) o a
-- vincular su expositor (eligió gratis y todavía no tiene ninguno).
--
-- Va drop + create y no `create or replace`: se le agregan dos columnas al
-- `returns table`, y Postgres rechaza un replace que cambie el tipo de retorno
-- ("cannot change return type of existing function"). No hay vistas ni
-- políticas colgando de esta función, así que el drop no arrastra nada.
-- ---------------------------------------------------------------------------
drop function if exists public.my_org_context();

create function public.my_org_context()
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
    m.created_at asc
  limit 1;
$$;

revoke all on function public.my_org_context() from public, anon;
grant execute on function public.my_org_context() to authenticated;
