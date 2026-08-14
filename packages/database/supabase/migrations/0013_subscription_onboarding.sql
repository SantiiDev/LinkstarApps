-- ============================================================================
-- LINKSTAR — 0013: Elección de plan obligatoria antes de entrar al panel
-- ============================================================================
-- Hasta acá una organización recién creada arrancaba con una suscripción de
-- prueba de 14 días y el usuario entraba derecho al panel sin decidir nada.
-- El producto ahora exige que elija plan ANTES de ver el dashboard, y el plan
-- pago se cobra por débito automático mensual con Suscripciones de Mercado
-- Pago (preapproval).
--
-- El esquema de 0005 ya preveía casi todo (mp_preapproval_id,
-- mp_preapproval_plan_id, grace_until, failed_payment_count). Lo que falta es:
--
--   1. Un catálogo de planes que refleje lo que se vende de verdad.
--   2. Una marca de "ya eligió" — la puerta del onboarding.
--   3. Una función que el frontend pueda llamar para saber en qué paso está.
--   4. Las RPC que el webhook usa para aplicar lo que informa Mercado Pago.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. CATÁLOGO DE PLANES
--
-- Dos columnas nuevas, las dos para que el frontend no tenga que hardcodear
-- reglas por código de plan:
--
--   checkout_mode — qué pasa al apretar el botón de la tarjeta.
--     'free'         → alta inmediata, sin medio de pago.
--     'subscription' → preapproval de Mercado Pago.
--     'contact'      → no es autoservicio, abre el canal de ventas.
--   trial_days     — días de prueba sin cargo. Va acá y no en el código porque
--                    es el mismo número que se manda como free_trial al crear
--                    el preapproval_plan en MP: dos fuentes de verdad para
--                    esto significa cobrarle a alguien un día antes de lo que
--                    le prometiste en pantalla.
-- ---------------------------------------------------------------------------
alter table public.plans
  add column if not exists checkout_mode text not null default 'subscription'
    check (checkout_mode in ('free', 'subscription', 'contact')),
  add column if not exists trial_days integer not null default 0
    check (trial_days >= 0);

comment on column public.plans.checkout_mode is
  'Cómo se contrata: free = alta directa, subscription = preapproval de MP, contact = ventas.';
comment on column public.plans.trial_days is
  'Días de prueba sin cargo. Se manda como free_trial al crear el preapproval_plan en MP.';

-- Los planes viejos ('trial', 'starter', 'pro') no se borran: subscriptions.
-- plan_code los referencia por FK y borrarlos rompería cualquier fila que
-- todavía los apunte. Se sacan de la vitrina y listo.
update public.plans
set is_public = false
where code in ('trial', 'starter', 'pro');

-- El catálogo real. `features.highlights` es lo que lista la tarjeta del
-- selector, en orden — así se agrega un bullet sin tocar React.
insert into public.plans (
  code, name, description, price_ars, billing_period,
  max_locations, max_devices, max_employees, max_members,
  data_retention_days, checkout_mode, trial_days, is_public, sort_order, features
) values
  (
    'free', 'Gratis',
    'Incluido con tu expositor. Para empezar a medir desde el primer día.',
    0, 'monthly',
    1, 3, 5, 2, 30, 'free', 0, true, 1,
    jsonb_build_object('highlights', jsonb_build_array(
      'Hasta 3 dispositivos',
      '1 ubicación',
      'Escaneos y reseñas estimadas en tiempo real',
      '30 días de historial',
      'Soporte por email'
    ))
  ),
  (
    'business', 'Business',
    'Analizá, gestioná y automatizá tu empresa.',
    24900, 'monthly',
    5, 25, 50, 10, 365, 'subscription', 7, true, 2,
    jsonb_build_object('highlights', jsonb_build_array(
      'Hasta 25 dispositivos',
      'Hasta 5 ubicaciones',
      'Reportes de NPS, sentimiento y palabras clave',
      'Automatizaciones e informes mensuales',
      'Métricas de Google Business Profile',
      '1 año de historial',
      'Soporte prioritario'
    ))
  ),
  (
    'enterprise', 'Enterprise',
    'A medida para empresas y cadenas con más de 30 locales.',
    0, 'monthly',
    null, null, null, null, 1095, 'contact', 0, true, 3,
    jsonb_build_object('highlights', jsonb_build_array(
      'Ubicaciones y dispositivos ilimitados',
      'Comparativas entre locales y regiones',
      'Integraciones y exportación de datos',
      '3 años de historial',
      'Onboarding y soporte dedicado'
    ))
  )
on conflict (code) do update set
  name                = excluded.name,
  description         = excluded.description,
  price_ars           = excluded.price_ars,
  max_locations       = excluded.max_locations,
  max_devices         = excluded.max_devices,
  max_employees       = excluded.max_employees,
  max_members         = excluded.max_members,
  data_retention_days = excluded.data_retention_days,
  checkout_mode       = excluded.checkout_mode,
  trial_days          = excluded.trial_days,
  is_public           = excluded.is_public,
  sort_order          = excluded.sort_order,
  features            = excluded.features;
-- mp_preapproval_plan_id NO se toca en el upsert: lo escribe el backend la
-- primera vez que crea el plan en Mercado Pago, y pisarlo acá obligaría a
-- recrear el plan en MP en cada `db reset`.


-- ---------------------------------------------------------------------------
-- 2. LA PUERTA: subscriptions.plan_selected_at
--
-- NULL = la organización existe pero su dueño todavía no eligió plan ⇒ el
-- dashboard lo manda al selector. Es una columna y no un status nuevo del
-- enum a propósito: "no eligió" no es un estado de la suscripción frente a
-- Mercado Pago, es un estado del onboarding. Mezclarlos obligaría a tocar
-- subscription_status y con eso org_has_access(), que ya funciona bien.
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists plan_selected_at timestamptz;

comment on column public.subscriptions.plan_selected_at is
  'Cuándo el dueño eligió plan. NULL = onboarding pendiente, el panel no se muestra.';

-- Plan que el cliente empezó a contratar y todavía no autorizó en Mercado
-- Pago. Va en su propia columna y NO en plan_code porque plan_code es lo que
-- lee private.plan_limit(): escribirlo antes del pago le daría los límites del
-- plan pago a cualquiera que abra el checkout y cierre la pestaña. Cuando MP
-- confirma, este valor pasa a plan_code y la columna se limpia.
alter table public.subscriptions
  add column if not exists pending_plan_code text references public.plans(code);

comment on column public.subscriptions.pending_plan_code is
  'Plan con checkout iniciado y sin autorizar todavía. No otorga límites.';

-- Las organizaciones que ya existían (desarrollo) se dan por elegidas: nadie
-- las creó pasando por un selector que todavía no existía.
update public.subscriptions
set plan_selected_at = created_at
where plan_selected_at is null;


-- ---------------------------------------------------------------------------
-- 3. BOOTSTRAP DE ORGANIZACIÓN — reemplaza la versión de 0007
--
-- Cambia la suscripción inicial: antes 'trial' / 'trialing' / 14 días, que le
-- daba acceso completo a alguien que nunca eligió nada. Ahora nace en el plan
-- gratis y activa, pero con plan_selected_at en NULL, así que el guard la
-- frena en el selector. Si elige Gratis se sella la marca y sigue; si elige
-- Business, el webhook de MP la pisa con 'business' / 'trialing'.
--
-- La membresía de owner no cambia: sigue creándose en la misma transacción
-- que la organización, por la razón de siempre (una org sin dueño es una org
-- irrecuperable).
-- ---------------------------------------------------------------------------
create or replace function private.bootstrap_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.memberships (organization_id, user_id, role)
  values (new.id, coalesce(new.created_by, auth.uid()), 'owner')
  on conflict do nothing;

  insert into public.subscriptions (
    organization_id, plan_code, status,
    current_period_start, plan_selected_at
  )
  values (
    new.id, 'free', 'active',
    now(), null
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. my_org_context() — lo único que el dashboard necesita para decidir
--
-- Devuelve la organización activa del usuario y el estado de su suscripción
-- en una sola llamada. Existe por una razón concreta de RLS: la política
-- subscriptions_select de 0006 sólo deja leer la suscripción a owner/admin.
-- Un manager o un viewer que inicia sesión NO puede leer su propia fila, así
-- que un guard que consultara la tabla directo lo mandaría eternamente al
-- selector de planes sin forma de salir. Esta función es SECURITY DEFINER y
-- devuelve sólo lo que hace falta para enrutarlo — ningún dato de cobro.
--
-- Organización activa: la última que el usuario estaba mirando
-- (profiles.last_organization_id), y si no hay, la membresía más antigua.
-- No hay selector de organizaciones todavía; esto sólo evita que un usuario
-- con dos orgs vea una distinta en cada login.
-- ---------------------------------------------------------------------------
create or replace function public.my_org_context()
returns table (
  organization_id   uuid,
  organization_name text,
  organization_slug citext,
  role              public.org_role,
  plan_code         text,
  plan_name         text,
  status            public.subscription_status,
  plan_selected_at  timestamptz,
  trial_ends_at     timestamptz,
  current_period_end timestamptz,
  grace_until       timestamptz,
  cancel_at_period_end boolean,
  has_access        boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id,
    o.name,
    o.slug,
    m.role,
    s.plan_code,
    p.name,
    s.status,
    s.plan_selected_at,
    s.trial_ends_at,
    s.current_period_end,
    s.grace_until,
    s.cancel_at_period_end,
    public.org_has_access(o.id)
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


-- ---------------------------------------------------------------------------
-- 5. select_free_plan() — alta en el plan gratis
--
-- subscriptions tiene revocados insert/update/delete para authenticated
-- (0006), así que el cliente no puede sellar la marca por su cuenta. Esta RPC
-- es el único camino, y valida el rol: sólo owner/admin deciden el plan de la
-- organización.
--
-- Es idempotente y NO degrada: si la organización ya está en un plan pago no
-- hace nada, para que un doble click en "Empezar gratis" no le cancele el
-- Business a nadie. Bajar de plan es otra operación, con su propia baja en MP.
-- ---------------------------------------------------------------------------
create or replace function public.select_free_plan(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  update public.subscriptions
  set plan_code            = 'free',
      status               = 'active',
      -- pending_plan_code NO se limpia acá, aunque quede colgado el intento de
      -- un checkout pago abandonado. Es deliberado: si el cliente sí llegó a
      -- autorizar en Mercado Pago y volvió al selector antes de que entrara el
      -- webhook, ese valor es lo único que le dice al 'authorized' a qué plan
      -- activar. Borrarlo cambiaría un campo sucio por un cliente al que MP le
      -- cobra Business mientras el panel lo deja en Gratis.
      plan_selected_at     = coalesce(plan_selected_at, now()),
      current_period_start = coalesce(current_period_start, now())
  where organization_id = p_org
    and (plan_selected_at is null or plan_code = 'free');
end;
$$;

revoke all on function public.select_free_plan(uuid) from public, anon;
grant execute on function public.select_free_plan(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. apply_preapproval_event() — lo que el webhook aplica
--
-- Mercado Pago informa el estado de la suscripción (preapproval) con cuatro
-- valores: pending | authorized | paused | cancelled. La traducción a nuestro
-- enum y la aritmética de períodos viven acá, en una sola sentencia, y no en
-- Express: el webhook ya respondió 200 antes de llegar a esto, así que si el
-- proceso se cae a mitad de camino nadie reintenta. Una fila a medio escribir
-- es una organización que pagó y no puede entrar.
--
-- 'pending' (el usuario abrió el checkout y no terminó) sólo guarda los ids:
-- NO sella plan_selected_at, así que el guard lo sigue mandando al selector.
-- Autorizar es lo único que abre la puerta.
-- ---------------------------------------------------------------------------
create or replace function public.apply_preapproval_event(
  p_preapproval_id      text,
  p_org                 uuid,
  p_plan_code           text,
  p_mp_status           text,
  p_payer_email         text default null,
  p_payer_id            text default null,
  p_amount              numeric default null,
  p_next_payment_date   timestamptz default null,
  p_preapproval_plan_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trial_days integer;
  v_trial_ends timestamptz;
  v_status     public.subscription_status;
begin
  if p_org is null then
    raise exception 'apply_preapproval_event sin organización (external_reference vacío)';
  end if;

  select trial_days into v_trial_days from public.plans where code = p_plan_code;

  case p_mp_status
    -- Autorizada: si el plan tiene prueba y todavía no venció, entra como
    -- 'trialing'. El primer cobro real lo confirma después el topic
    -- subscription_authorized_payment.
    when 'authorized' then
      v_trial_ends := case
        when coalesce(v_trial_days, 0) > 0
        then now() + make_interval(days => v_trial_days)
        else null
      end;
      v_status := case when v_trial_ends is not null then 'trialing' else 'active' end;

      update public.subscriptions
      set plan_code              = p_plan_code,
          pending_plan_code      = null,     -- se consumió: ya es el plan real
          status                 = v_status,
          mp_preapproval_id      = p_preapproval_id,
          mp_preapproval_plan_id = coalesce(p_preapproval_plan_id, mp_preapproval_plan_id),
          mp_payer_id            = coalesce(p_payer_id, mp_payer_id),
          mp_payer_email         = coalesce(p_payer_email, mp_payer_email),
          amount_ars             = coalesce(p_amount, amount_ars),
          trial_ends_at          = coalesce(v_trial_ends, trial_ends_at),
          current_period_start   = now(),
          current_period_end     = coalesce(p_next_payment_date, v_trial_ends),
          -- Reactivar limpia lo que dejó un ciclo anterior: si volvió, no
          -- arrastra la gracia ni el contador de rechazos de la vez pasada.
          grace_until            = null,
          failed_payment_count   = 0,
          cancel_at_period_end   = false,
          cancelled_at           = null,
          cancellation_reason    = null,
          plan_selected_at       = coalesce(plan_selected_at, now())
      where organization_id = p_org;

    when 'paused' then
      update public.subscriptions
      set status            = 'paused',
          mp_preapproval_id = coalesce(p_preapproval_id, mp_preapproval_id)
      where organization_id = p_org;

    when 'cancelled' then
      update public.subscriptions
      set status              = 'cancelled',
          cancelled_at        = coalesce(cancelled_at, now()),
          mp_preapproval_id   = coalesce(p_preapproval_id, mp_preapproval_id)
      where organization_id = p_org;

    -- pending: se deja rastro del intento (incluido QUÉ plan se estaba
    -- contratando) para poder retomarlo y para que el webhook de autorización
    -- sepa a qué plan activar. Nada de esto habilita nada todavía.
    --
    -- Mercado Pago no garantiza el orden de las notificaciones: el 'pending'
    -- de un preapproval puede llegar DESPUÉS de su propio 'authorized'. Por eso
    -- pending_plan_code no se escribe cuando el evento es de un preapproval que
    -- ya está autorizado — si no, quedaría marcado como pendiente un plan que
    -- en realidad ya se activó y se cobró.
    --
    -- La condición mira el preapproval y no sólo el status a propósito: una
    -- organización que pasa de Gratis a Business ya está 'active' cuando abre
    -- el checkout, así que filtrar por status a secas dejaría ese upgrade sin
    -- anotar y el 'authorized' posterior la reactivaría en Gratis.
    else
      update public.subscriptions
      set mp_preapproval_id      = coalesce(p_preapproval_id, mp_preapproval_id),
          mp_preapproval_plan_id = coalesce(p_preapproval_plan_id, mp_preapproval_plan_id),
          mp_payer_email         = coalesce(p_payer_email, mp_payer_email),
          pending_plan_code      = case
            when mp_preapproval_id is not distinct from p_preapproval_id
                 and status in ('trialing', 'active')
            then pending_plan_code
            else coalesce(p_plan_code, pending_plan_code)
          end
      where organization_id = p_org;
  end case;
end;
$$;

revoke all on function public.apply_preapproval_event(text, uuid, text, text, text, text, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.apply_preapproval_event(text, uuid, text, text, text, text, numeric, timestamptz, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 7. record_subscription_payment() — cada cobro mensual
--
-- Idempotente por el unique de mp_authorized_payment_id: Mercado Pago
-- reintenta las notificaciones y no puede terminar en dos filas de cobro ni
-- en dos meses de período sumados.
--
-- El caso importante es el rechazo: NO se corta el servicio en el acto. Se
-- pasa a past_due con 5 días de gracia, que es exactamente lo que
-- org_has_access() ya sabe interpretar (0005). A nadie se le cae el negocio
-- porque se le venció la tarjeta un domingo.
-- ---------------------------------------------------------------------------
create or replace function public.record_subscription_payment(
  p_org                      uuid,
  p_mp_authorized_payment_id text,
  p_mp_payment_id            text,
  p_status                   text,
  p_amount                   numeric,
  p_paid_at                  timestamptz default null,
  p_next_payment_date        timestamptz default null,
  p_raw                      jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where organization_id = p_org;
  if not found then
    raise exception 'record_subscription_payment: la organización % no tiene suscripción', p_org;
  end if;

  insert into public.subscription_payments (
    organization_id, subscription_id, mp_authorized_payment_id, mp_payment_id,
    status, amount, period_start, period_end, paid_at, raw
  )
  values (
    p_org, v_sub.id, p_mp_authorized_payment_id, p_mp_payment_id,
    p_status, p_amount,
    (v_sub.current_period_start)::date,
    (coalesce(p_next_payment_date, v_sub.current_period_end))::date,
    p_paid_at, p_raw
  )
  on conflict (mp_authorized_payment_id) do nothing;

  if p_status = 'approved' then
    update public.subscriptions
    set status               = 'active',
        current_period_start = coalesce(p_paid_at, now()),
        -- coalesce y no asignación directa: si MP no manda next_payment_date
        -- en este cobro, se conserva el fin de período que ya había. Pisarlo
        -- con NULL deja la pestaña de Facturación sin período que mostrar.
        current_period_end   = coalesce(p_next_payment_date, current_period_end),
        amount_ars           = coalesce(p_amount, amount_ars),
        failed_payment_count = 0,
        grace_until          = null
    where organization_id = p_org;

  elsif p_status in ('rejected', 'cancelled') then
    update public.subscriptions
    set status               = 'past_due',
        failed_payment_count = failed_payment_count + 1,
        grace_until          = greatest(coalesce(grace_until, now()), now() + interval '5 days')
    where organization_id = p_org;
  end if;
end;
$$;

revoke all on function public.record_subscription_payment(uuid, text, text, text, numeric, timestamptz, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_subscription_payment(uuid, text, text, text, numeric, timestamptz, timestamptz, jsonb)
  to service_role;

-- Nota sobre plans.mp_preapproval_plan_id (columna de 0005): queda sin usar.
-- Mercado Pago tiene dos formas de armar una suscripción y sólo una sirve acá.
-- Con plan asociado (preapproval_plan_id) el cliente entra por el checkout del
-- plan, que NO acepta external_reference — el webhook llegaría sin forma de
-- saber a qué organización corresponde el cobro, y habría que adivinarlo por
-- el mail del pagador. Sin plan asociado, el preapproval se crea con el
-- auto_recurring completo y con external_reference = organization_id. Se usa
-- esa. La columna se deja por si algún día se agrupan los planes en el panel
-- de MP.
