-- ============================================================================
-- LINKSTAR — 0017: correctiva de las RPC de suscripción de 0013
-- ============================================================================
-- Esta migración no agrega nada nuevo. Redefine dos funciones con exactamente
-- el mismo cuerpo que ya está en 0013_subscription_onboarding.sql, y existe
-- sólo por una cuestión de tiempos.
--
-- Qué pasó: 0013 se corrigió editando el archivo, con el argumento —correcto
-- en ese momento— de que todavía no estaba aplicada en ninguna base. Entre esa
-- corrección y su push, 0013 se aplicó en producción. Desde entonces el
-- archivo y la base dicen cosas distintas, y `db push` no vuelve a correr una
-- migración ya aplicada, así que las dos correcciones nunca llegaron a
-- Postgres. Verificado contra la base: pg_proc no contenía ninguna de las dos.
--
-- Las dos correcciones que faltaban:
--
--   apply_preapproval_event — no pisar pending_plan_code cuando el evento
--     'pending' de un preapproval llega DESPUÉS de su propio 'authorized'.
--     Mercado Pago no garantiza el orden de las notificaciones. Sin esto, un
--     plan ya activado y cobrado queda marcado como pendiente.
--
--   record_subscription_payment — current_period_end sale por coalesce, para
--     no pisarlo con NULL cuando el cobro no trae next_payment_date y dejar la
--     pestaña de Facturación sin período que mostrar.
--
-- Es idempotente y convergente: en una base nueva, 0013 crea estas funciones ya
-- corregidas y 0017 las vuelve a crear iguales; en la base que existía antes,
-- 0017 es lo único que las arregla. Las dos terminan en el mismo lugar.
--
-- ⚠️  Para la próxima: 0013, 0014, 0015 y 0016 YA están aplicadas en
-- producción. Corregir cualquiera de ellas editando su archivo no cambia nada
-- en la base. De acá en adelante, toda corrección va en una migración nueva.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- apply_preapproval_event() — copia fiel de la versión corregida en 0013
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
-- record_subscription_payment() — copia fiel de la versión corregida en 0013
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
