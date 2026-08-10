-- ============================================================================
-- LINKSTAR — 0005: Facturación, suscripciones y pedidos
-- ============================================================================

-- ---------------------------------------------------------------------------
-- plans — catálogo público de planes. Es tabla y no constante en el código
-- porque vas a querer cambiar precios sin redeploy (y en Argentina vas a
-- cambiarlos seguido).
-- ---------------------------------------------------------------------------
create table public.plans (
  code                     text primary key,        -- 'free', 'starter', 'pro', 'business'
  name                     text not null,
  description              text,
  price_ars                numeric(12,2) not null default 0,
  billing_period           text not null default 'monthly'
                             check (billing_period in ('monthly', 'yearly')),

  -- Límites. NULL = ilimitado.
  max_locations            integer,
  max_devices              integer,
  max_employees            integer,
  max_members              integer,
  data_retention_days      integer not null default 90,   -- cuánta historia ve el cliente

  features                 jsonb not null default '{}'::jsonb,
  -- id del preapproval_plan creado en Mercado Pago (POST /preapproval_plan)
  mp_preapproval_plan_id   text,

  is_public                boolean not null default true,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function private.set_updated_at();

insert into public.plans (code, name, price_ars, max_locations, max_devices, max_employees, max_members, data_retention_days, sort_order) values
  ('trial',    'Prueba gratis', 0,     1,    3,    5,   2,   30,  0),
  ('starter',  'Starter',       0,     1,    5,   10,   3,   90,  1),
  ('pro',      'Pro',           0,     5,   25,   50,  10,  365,  2),
  ('business', 'Business',      0,  null, null, null, null, 1095, 3)
on conflict (code) do nothing;
-- Los precios quedan en 0 a propósito: cargalos vos junto con el
-- mp_preapproval_plan_id real cuando crees los planes en Mercado Pago.

-- ---------------------------------------------------------------------------
-- subscriptions — una por organización.
--
-- Nota sobre Mercado Pago: el flujo de suscripciones usa dos objetos.
--   preapproval_plan  — la plantilla del plan (precio, frecuencia, trial)
--   preapproval       — la suscripción concreta de UN cliente a ese plan
-- El id que guardás por cliente es el del preapproval.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null unique references public.organizations(id) on delete cascade,
  plan_code               text not null references public.plans(code),
  status                  public.subscription_status not null default 'trialing',

  mp_preapproval_id       text unique,
  mp_preapproval_plan_id  text,
  mp_payer_id             text,
  mp_payer_email          citext,

  trial_ends_at           timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,

  -- Período de gracia tras un pago rechazado. Clave para no cortarle el
  -- servicio a un cliente porque venció la tarjeta un domingo.
  grace_until             timestamptz,
  failed_payment_count    integer not null default 0,

  cancel_at_period_end    boolean not null default false,
  cancelled_at            timestamptz,
  cancellation_reason     text,

  amount_ars              numeric(12,2),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index subscriptions_status_idx on public.subscriptions (status, current_period_end);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

-- ¿Tiene la organización acceso pago vigente ahora mismo?
create or replace function public.org_has_access(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.organization_id = p_org
      and (
        s.status in ('trialing', 'active')
        or (s.status = 'past_due' and s.grace_until > now())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- subscription_payments — historial de cobros. Alimentado por webhooks.
-- ---------------------------------------------------------------------------
create table public.subscription_payments (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  subscription_id             uuid references public.subscriptions(id) on delete set null,

  mp_payment_id               text unique,
  mp_authorized_payment_id    text unique,

  status                      text not null,      -- approved | rejected | pending | refunded | charged_back
  status_detail               text,
  amount                      numeric(12,2) not null,
  currency                    char(3) not null default 'ARS',
  fee_amount                  numeric(12,2),      -- comisión de Mercado Pago
  net_received                numeric(12,2),

  period_start                date,
  period_end                  date,
  paid_at                     timestamptz,

  -- Facturación electrónica AFIP/ARCA
  invoice_number              text,
  invoice_type                text,               -- 'A', 'B', 'C'
  invoice_cae                 text,
  invoice_url                 text,
  invoiced_at                 timestamptz,

  raw                         jsonb,
  created_at                  timestamptz not null default now()
);

create index sub_payments_org_idx  on public.subscription_payments (organization_id, paid_at desc);
create index sub_payments_uninvoiced_idx
  on public.subscription_payments (paid_at)
  where status = 'approved' and invoice_number is null;

-- ---------------------------------------------------------------------------
-- orders — pedidos del SITIO DE VENTA (pago único de expositores).
-- Comparte base de datos con la app: así, cuando el comprador se registra,
-- podés vincularle automáticamente los dispositivos que compró.
-- Puede existir sin organización (compra sin cuenta previa).
-- ---------------------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations(id) on delete set null,
  order_number        text not null unique default ('LS-' || to_char(now(), 'YYMM') || '-' || upper(private.generate_public_id(5))),

  buyer_email         citext not null,
  buyer_name          text,
  buyer_phone         text,
  buyer_tax_id        text,

  status              public.order_status not null default 'pending',

  mp_preference_id    text,
  mp_payment_id       text unique,
  mp_merchant_order_id text,
  payment_method      text,        -- credit_card | debit_card | bank_transfer | account_money
  installments        integer,

  subtotal            numeric(12,2) not null default 0,
  shipping_cost       numeric(12,2) not null default 0,
  discount            numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  currency            char(3) not null default 'ARS',

  shipping_address    jsonb,
  shipping_carrier    text,
  tracking_code       text,

  invoice_number      text,
  invoice_url         text,

  paid_at             timestamptz,
  shipped_at          timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index orders_email_idx  on public.orders (buyer_email, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_org_idx    on public.orders (organization_id) where organization_id is not null;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  sku           text not null,
  product_name  text not null,
  form_factor   public.device_form,
  kind          public.device_kind,
  quantity      integer not null check (quantity > 0),
  unit_price    numeric(12,2) not null,
  total_price   numeric(12,2) not null
);

create index order_items_order_idx on public.order_items (order_id);

-- Recién ahora existe orders: cerramos la FK que dejamos pendiente en 0003.
alter table public.devices
  add constraint devices_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete set null;

-- ---------------------------------------------------------------------------
-- webhook_events — IDEMPOTENCIA. No es opcional.
--
-- Mercado Pago reintenta las notificaciones ante cualquier respuesta que no
-- sea 200, y a veces manda la misma notificación dos veces aunque hayas
-- respondido bien. Sin esta tabla, un reintento te duplica un pago, o peor,
-- vuelve a activar una suscripción cancelada. Vive en `private` porque el
-- cliente no tiene por qué verla nunca.
-- ---------------------------------------------------------------------------
create table private.webhook_events (
  id                bigint generated always as identity primary key,
  provider          text not null default 'mercadopago',
  topic             text not null,        -- payment | subscription_preapproval | subscription_authorized_payment
  external_id       text not null,        -- data.id del webhook
  payload           jsonb not null,
  signature_valid   boolean,              -- validación de la cabecera x-signature
  processed_at      timestamptz,
  attempts          integer not null default 0,
  error             text,
  received_at       timestamptz not null default now(),
  unique (provider, topic, external_id)
);

create index webhook_events_pending_idx
  on private.webhook_events (received_at)
  where processed_at is null;
