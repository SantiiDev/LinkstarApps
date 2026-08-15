# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Linkstar sells NFC/QR "expositores" — physical cards a business puts on tables and counters so customers
tap or scan them and land on the business's Google review form. Buyers then manage those devices from
**LinkstarApp**, a multi-tenant SaaS dashboard (devices, locations, employees (soon), scan analytics).

The dashboard has **three plans**, and choosing one is a mandatory step between signing up and reaching
`/panel`: `free` (bundled with the device, no card), `business` (monthly, 7-day free trial, charged by
Mercado Pago direct debit) and `enterprise` (contact sales, not self-serve). No lock-in. See "Pricing"
below before touching any price or plan wording, and "Subscription gate" for how the step is enforced.

**Status: pre-launch.** Nothing is sold yet and nothing but the schema is deployed. There are no real
tenants, so the schema and the API can still change shape without a migration story for production data —
but the invariants under "Data model" are the part that gets expensive to undo *after* launch, so they
hold now too. Concretely: `services/api` and `apps/dashboard` have no deploy target, checkout is
disconnected, and large parts of the dashboard are UI ahead of their data (see `apps/dashboard` below).
This file describes what is actually wired today, not the roadmap — when something lands, update the
section that claimed it was missing.

This is a monorepo, created by merging two previously separate repos (`SantiiDev/Linkstar` and
`SantiiDev/LinkstarApp`) with `git subtree add`, so `git log` contains both histories. The tags
`pre-monorepo-ventas` and `pre-monorepo-dashboard` point at the last commit each repo had before the merge.

## Layout

npm workspaces, one `package-lock.json` at the root. Four packages:

| Path                | Package               | What it is |
|---------------------|-----------------------|------------|
| `apps/ventas`       | `@linkstar/ventas`    | Marketing site + shop. React 19 + Vite, deployed to Cloudflare Workers at `linkstarapp.com/*`. |
| `apps/dashboard`    | `@linkstar/dashboard` | The SaaS dashboard + its own landing page. React 19 + Vite. Not deployed yet. |
| `services/api`      | `@linkstar/api`       | The only backend. Express: scan redirect, Mercado Pago orders/webhooks, login tracking. |
| `packages/database` | `@linkstar/database`  | Postgres schema as ordered migrations, RLS policies, SQL tests. Source of truth for the data model. |

The schema lives at `packages/database/supabase/`, not directly under `packages/database/` — the Supabase
CLI walks up from the cwd looking for a directory literally named `supabase` containing `config.toml`, so
flattening it breaks `supabase db reset` / `db push`.

There is no `apps/ventas` backend anymore. It was a second Express app with a duplicate, older inline copy
of `/d/:publicId`; its `helmet` + `express-rate-limit` setup was merged into `services/api` and the rest
deleted.

## Commands

All from the repo root:

```bash
npm install              # installs every workspace, one lockfile

npm run dev:ventas       # Vite on http://localhost:5174 (strictPort)
npm run dev:dashboard    # Vite on http://localhost:5173 (strictPort)
npm run dev:api          # node --watch, http://localhost:3001

npm run build            # builds both frontends
npm run build:ventas
npm run build:dashboard
npm run lint             # oxlint over the dashboard (the only workspace with a lint config)
npm run deploy:ventas    # vite build && wrangler deploy
```

Both dev ports are pinned with `strictPort`. Don't remove that: the two frontends run at the same time and
the API's CORS allowlist and the `.env` files reference those exact ports, so a silently-reassigned port
turns into a CORS failure that looks like an auth bug.

Supabase (the CLI is a `devDependency` of `packages/database`, so `npm install` at the root is enough —
no global install; `npm i -g supabase` is disabled upstream anyway). Each developer still has to
`supabase login` and `supabase link --project-ref <ref>` once: the link state lives in the gitignored
`packages/database/supabase/.temp/`, so it does not travel with the repo.

```bash
npm run db:push          # -> supabase db push, from packages/database
npm run db:reset         # -> supabase db reset (applies 0000 → 0019 in order, locally)
npm run db:status        # -> supabase migration list (local vs remote), from packages/database
```

`supabase migration list` compares local vs remote. If a migration was applied by hand outside the CLI
(has happened, see `0010`), `supabase migration repair --status applied <version>` fixes the history
without re-running the SQL. Run `packages/database/supabase/tests/rls_isolation.sql` before any RLS change
ships — it needs a running local stack and is executed with
`docker exec -i supabase_db_Linkstar psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/rls_isolation.sql`
from `packages/database`. It exits 0 and prints `=== Todos los tests de aislamiento pasaron ===` when green;
`ON_ERROR_STOP=1` matters, because a failing assert aborts rather than returning false, and without it the
rest of the file would keep going and look like it passed. **On Windows `supabase start` usually fails on
first run with "ports are not available"** — Hyper-V reserves the whole 54320–54329 default range; see
`packages/database/supabase/README.md` for the temporary port remap.

Ops scripts live in `services/api/scripts/` and run with `node scripts/<name>.js` from `services/api`
(`provision-devices.js` and `rebuild-today-rollup.js` also have npm aliases — `npm run provision-devices`,
`npm run rebuild-today-rollup`; `seed-test-device.js` doesn't). They use the same `service_role` client as
the server, so `services/api/.env` decides whether you are writing to local or production.

No test runner is configured in any workspace.

### Environment

`.env` files are **not** in git (`services/api/.env` used to be, with a real `service_role` key in it — it
was untracked during the monorepo migration, but it is still reachable in the pre-monorepo history of
`SantiiDev/LinkstarApp`, so that key must stay rotated).

The `.env.example` files **are** tracked and are the only spec of what each service needs — this repo has
more than one developer, so a new variable is only real once it's in the matching `.env.example`. Copy them
to `.env`, don't rename them away.

- `services/api/.env` — see `services/api/.env.example`. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `PORT`, `FRONTEND_URL`, `DASHBOARD_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `WEBHOOK_URL`,
  `WEB3FORMS_KEY`, `REDIRECT_DOMAIN` (optional, defaults to `l.linkstar.com.ar`).
  `DASHBOARD_URL` is optional too (defaults to the *second* entry of `FRONTEND_URL`) and is where the
  subscription returns from Mercado Pago — it cannot be `FRONTEND_URL`, which points at the sales site.
  `FRONTEND_URL` is **comma-separated**: this one service serves both frontends, so CORS needs both
  origins. The first entry is the one used for Mercado Pago `back_urls`, so it must be the ventas site
  (that's where checkout lives). Missing `SUPABASE_SERVICE_ROLE_KEY` only warns at boot — writes then fail
  later at request time via RLS rejection.
- `apps/dashboard/.env` — see `apps/dashboard/.env.example`. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL`, `VITE_REDIRECT_DOMAIN` (optional, same default as the API's `REDIRECT_DOMAIN` — the two
  apps deploy separately, so each defines it on its own; they must agree or the QR the dashboard generates
  points somewhere the API doesn't serve).
- `apps/ventas/.env.production` — `VITE_API_URL`, still the `BACKEND_URL_PENDIENTE` placeholder until the
  API is deployed. Tracked in git on purpose (`.gitignore` whitelists `.env.production`); it holds no
  secrets.

## Architecture

### Data model — read `packages/database/supabase/README.md` before touching migrations

The tenant is `organizations`, not `locations`: a business with 5 branches is one org with 5 `locations`
rows, so cross-branch comparisons stay possible. Six invariants are baked into the schema and are easy to
accidentally undo:

1. **Attribution is a snapshot, not a JOIN.** `scan_events` copies `location_id`/`employee_id`/`kind` at
   scan time. Deriving attribution via JOIN means reassigning a device retroactively zeroes out the
   previous employee's history.
2. **The dashboard never reads `scan_events` directly.** It reads `scan_daily_rollups`, rebuilt with an
   idempotent `DELETE + INSERT` per day, so any day can be safely recomputed. ("Nightly" is the design,
   not the current state — see below.)
3. **`resolve_scan()` is never granted to `anon`.** Only the `service_role` backend may call it — `anon`
   reaching it directly would let anyone pollute another tenant's metrics with a known `public_id`.
4. **Devices are never created client-side.** Provisioned with `status = 'unassigned'` + a printed
   `claim_code`, claimed via `claim_device()`. No client INSERT policy on `devices` — that would bypass
   plan device limits.
5. **Every view has `security_invoker = on`.** Without it a view runs with the creator's privileges and
   silently ignores RLS on its underlying tables.
6. **"Estimated reviews" is a product constraint, not a UI nitpick.** Google gives no webhook for new
   reviews. Ground truth is the daily total review count per location
   (`location_review_snapshots`); day-over-day deltas (`review_deltas`) are the only real signal.
   Anything finer (per employee, per device) is a prorated estimate and must stay labeled "estimado".

**Nothing schedules the nightly jobs yet.** `private.rebuild_daily_rollups()`,
`compute_review_deltas()`, `expire_subscriptions()` and `purge_old_scan_events()` all exist in `0007`, but
the four `cron.schedule(...)` calls at the bottom of that file are **commented out** and `pg_cron` has not
been enabled. So `scan_daily_rollups` only fills when someone runs
`services/api/scripts/rebuild-today-rollup.js` by hand — and since the dashboard reads exclusively from the
rollups (invariant 2), every view in `0008` reports zero until that happens. Before debugging "the
dashboard shows no data", check this first; it is far more likely than an RLS problem. Enabling `pg_cron`
and uncommenting those lines is a tracked pending in `packages/database/supabase/README.md`.

A second consequence, easy to miss: the rollup runs for *yesterday*, so a scan is invisible until the next
run. `0012`'s `public.rebuild_today_rollup()` exists to close that gap, and nothing calls it either —
whether it runs on dashboard load, on a short interval, or not at all is still undecided.

**One shared trigger function, two tables — don't collapse the nested `if`** (`0019`). `private.check_same_org()`
backs both `employees_check_same_org` and `devices_check_same_org`. It used to read
`if tg_table_name = 'devices' and new.employee_id is not null`, which looks like a guard and is not one:
PL/pgSQL prepares the whole boolean as a single SQL expression against the triggering table's rowtype, so
firing on `employees` — which has no `employee_id` — failed to resolve the field no matter what the left
operand said. Effect: **every insert and update on `employees` errored, for every role including
`service_role`, from `0003` until `0019`.** It went unnoticed because no screen creates employees yet and
`rls_isolation.sql` had never been run end to end. The fix nests the two `if`s so the inner expression is
only ever prepared for `devices`; merging them back reintroduces the bug, and it surfaces on the *other*
table, which is what made it hard to see.

Migration responsibilities: `0001` extensions/enums/ID & IP-hash helpers · `0002` tenancy
(`organizations`, `profiles`, `memberships`, `invitations`, plus the `on_auth_user_created` trigger that
creates a `profiles` row on signup) · `0003` catalog (`locations`, `employees`, `devices`) ·
`0004` events/rollups/review snapshots/audit · `0005` billing + `orders` · `0006` **all RLS policies** ·
`0007` `resolve_scan`, `claim_device`, plan limits, nightly jobs · `0008` dashboard views
(`security_invoker`) · `0009` webhook RPCs · `0010` `profiles.last_login_at` · `0011` `scan_events.medium`
(`qr`/`nfc`) and the `resolve_scan` overload that takes `p_medium` · `0012` `public.rebuild_today_rollup()` ·
`0013` subscription onboarding (real `plans` catalog, `subscriptions.plan_selected_at`, `my_org_context()`,
`select_free_plan()`, the two preapproval webhook RPCs, and a rewritten `bootstrap_organization()`) ·
`0014` enforcement of paid access in RLS (`private.orgs_with_access()`, rewritten select/write policies on
the business tables, `claim_device()` gated) · `0015` `org_is_activated()` — the free plan also needs a
linked device · `0016` per-entity daily series views (`v_device_scans_daily`, `v_location_scans_daily`,
`v_employee_scans_daily`) — pure projections of `scan_daily_rollups`, no new capture ·
`0017` corrective: re-applies the two `0013` RPC fixes that never reached Postgres (see below) ·
`0018` `human_scans` / `bot_scans` on the five aggregating `0008` views, so every screen counts the same
thing (see "Scans are human taps" below) · `0019` corrective: `insert into employees` had failed **since
`0003`** (see below).

**Everything up to `0019` is applied in production** (pushed 15 Aug 2026, verified with
`supabase migration list`). Correcting an already-applied migration by editing
its file changes nothing in the database — `db push` skips migrations already in the history table. That
is exactly how `0017` came to exist: `0013` was fixed in place on the reasonable assumption that it had
not shipped yet, it shipped in between, and for a while the file and Postgres disagreed with nobody
noticing. From here on, every correction is a new migration. To check what actually runs in the database
rather than what the files say, query `pg_proc.prosrc` / `information_schema` directly — not the repo.

### Subscription gate — nobody reaches `/panel` without a plan

Between signing up and the dashboard there are forced steps: create an organization, choose a plan, and —
**on the free plan only** — link a device. The plan state lives in **one column**,
`subscriptions.plan_selected_at` (`0013`): `null` means the onboarding is unfinished, whatever else the
row says. It is not a `subscription_status` value because
"hasn't chosen yet" is a state of the onboarding, not of the relationship with Mercado Pago.

- `bootstrap_organization()` creates every new org on `free` / `active` with `plan_selected_at = null`.
  It used to hand out a 14-day `trialing` subscription, which let someone who never chose anything in.
- The dashboard asks `my_org_context()` — never `subscriptions` directly. The RLS policy on that table
  only lets owner/admin read it, so a `manager` querying it would look planless and bounce forever.
- Free is taken with `select_free_plan()`. Business goes through `POST /api/subscriptions/checkout`,
  which returns a Mercado Pago `init_point`; **only the webhook activates it**, never the return URL.
- `0014` is what makes it real. `RequireActivePlan` in `App.jsx` is a convenience, not the boundary:
  the RLS policies on `locations`, `employees`, `devices`, `scan_events`, `scan_daily_rollups` and the
  review tables all run through `private.orgs_with_access()`, and `claim_device()` checks it too.
  Billing tables are deliberately excluded — a lapsed customer has to be able to see their plan and pay.
  `resolve_scan()` is also excluded: a physical device must keep redirecting no matter what.

**Two access checks, and confusing them locks people out** (`0015`). `org_has_access()` answers "is the
subscription current?". `org_is_activated()` answers that *and*, when the plan is `free`, "is there a
device linked?" — because the free plan is what ships bundled with the hardware, so an account with no
device is not a customer. The RLS policies and the `RequireActivePlan` guard use `org_is_activated()`;
**`claim_device()` deliberately still uses `org_has_access()`**, because gating it on activation would
mean you need a linked device in order to link your first device. Paid plans never hit this check: someone
who already authorized the monthly debit gets in while their device is still in the mail.

Mercado Pago subscriptions use **preapproval without an associated plan**, because the plan-linked
checkout does not accept `external_reference`, and without it a webhook arrives with no way to tell which
organization was charged. `plans.mp_preapproval_plan_id` therefore stays unused.

**Two things about `external_reference` that cost an afternoon to find**, both handled in
`lib/subscriptions.js`:

1. MP's WAF rejects a value in **UUID format** — `POST /preapproval` answers `400 Request contains invalid
   or disallowed content` — while the same 32 hex characters without hyphens go through. So the org id
   travels through `toMpReference()` (strip hyphens) and comes back through `fromMpReference()`. Verified
   against the live API: with hyphens 400, without them the request passes validation.
2. It is a fallback, not the primary lookup. `resolveOrgId()` in `routes/webhooks.js` first matches
   `subscriptions.mp_preapproval_id`, which we wrote ourselves when the checkout was created, so
   attributing a payment never depends on MP echoing our data back.

**`back_url` cannot be localhost.** MP validates it when the preapproval is created and answers
`400 Invalid value for back_url, must be a valid URL`, which surfaces in the dashboard as a generic
"no se pudo iniciar la suscripción". So testing locally needs the *dashboard* exposed through a tunnel
too, not just the API — `DASHBOARD_URL` has to be that public URL, and `lib/config.js` warns at boot if
it still points at localhost. `apps/dashboard/vite.config.js` allows `.trycloudflare.com` hosts for the
same reason.

**`notification_url` is accepted per preapproval**, and `lib/subscriptions.js` sends it from
`WEBHOOK_URL`. That is on top of whatever the MP panel has configured: in development the tunnel URL
changes on every restart, and sending it in the request avoids reconfiguring the panel each time.

Testing the flow needs **two** Mercado Pago test users. The seller token can be a test user's, but
`payer_email` must belong to a *different* real or test MP account: any other address answers
`400 Both payer and collector must be real or test users`, and an unregistered `@testuser.com` address
gets a `500` from MP. Note this only bites in test mode — `payer_email` comes from the logged-in user's
Supabase account, and in production MP accepts any address and asks the payer to log in. To test the real
code path, the Supabase test account's email has to *be* the MP test buyer's.

### How a scan resolves to a URL (`resolve_scan`, `0007`)

The destination is not a stored column — it is built at scan time from a `coalesce` cascade:

1. `devices.destination_url` — manual per-device override; skips everything below.
2. Otherwise branch on `devices.kind` (`'google_review' | 'instagram' | 'custom'`):
   - `google_review` → `locations.google_review_url`, else built from `locations.google_place_id`
     (`https://search.google.com/local/writereview?placeid=<PLACE_ID>`), else `locations.google_maps_url`.
   - `instagram` → `locations.instagram_url`, else built from `locations.instagram_handle`.
   - `custom` → relies entirely on step 1.
3. `organizations.fallback_url`.
4. Hardcoded `'https://linkstar.com.ar'`, so a scan never dead-ends.

`kind` is copied verbatim into `scan_events.kind` / `scan_daily_rollups.kind` (invariant 1) — never
re-derived.

**Scan medium.** `scan_events.medium` (`'qr' | 'nfc'`, nullable) records which physical surface was
touched. `routes/redirect.js` derives it from the `?s=` query param (`q`→`qr`, `n`→`nfc`, anything else →
`null`); the QR-printed URL and the NFC-chip URL for the same `public_id` differ only by that suffix, baked
in at print/provisioning time. `resolve_scan` re-normalizes the value itself and never trusts the caller.
The rollups don't group by medium — the column is additive, for ad-hoc queries.

### `services/api`

`server.js` is only the composition root: it creates the app, sets global middleware, mounts routers. No
route logic. Uses the Supabase `service_role` key deliberately — `0006` denies `orders` writes and
`resolve_scan`/webhook RPCs to `anon`/`authenticated`, so only a trusted server can do either.

Global middleware, in order: `trust proxy = 1`, `helmet()`, `cors({ origin: FRONTEND_URLS })`,
`express.json()`. This backend is **not** behind Cloudflare, so request-level protection happens here, not
at an edge. `trust proxy` is `1` and not `true` on purpose: Railway/Render put exactly one proxy in front,
and trusting the whole chain would let a client spoof its IP with a hand-written `X-Forwarded-For` and
escape the rate limit.

- `lib/config.js` — `PORT`, `FRONTEND_URLS` (parsed list) / `FRONTEND_URL` (first entry, for MP
  `back_urls`), `REDIRECT_DOMAIN`.
- `lib/supabase.js` — the single `service_role` client, imported by every route.
- `lib/mercadopago.js` — MP SDK client, `isValidMpSignature`, `withTimeout`.
- `lib/orders.js` — `generateOrderNumber`, `createOrder`.
- `lib/email.js` — `sendEmailNotification`, posts order details to Web3Forms.
- `lib/validation.js` — zod schemas (`cartItemSchema`, `customerSchema`, `createPreferenceSchema`,
  `orderTransferSchema`, `processPaymentSchema`) plus `validateBody(schema)`, the middleware every payment
  route runs before its handler. Shape validation only — *amounts* are `lib/catalog.js`'s job.
- `lib/catalog.js` — `assertCatalogPrices(items)` / `assertMatchesCatalogTotal(amount, items)`. The server
  never trusts `item.price` or `formData.transaction_amount` from the body; both are checked against a
  hardcoded catalog. See "Pricing" — this file is a deliberate second copy of the ventas prices and has to
  move with them.
- `lib/subscriptions.js` — Mercado Pago **preapproval** (the monthly dashboard subscription), not to be
  confused with `lib/orders.js` (one-off hardware checkout). Card data never touches this service: the
  customer authorizes at MP's `init_point` and comes back.
- `middleware/auth.js` — `requireAuth(supabase)`, validates the Supabase JWT from `Authorization: Bearer`.

Routes, one router per file, all mounted at the app root:

- `routes/redirect.js` — `GET /d/:publicId`, the live NFC/QR entrypoint and the most load-bearing thing in
  the repo. Rate limited to 30/min per IP (a real tap is a few per minute per person; the limit exists for
  `public_id` enumeration and floods). Calls `resolve_scan()` with `p_public_id`/`p_ip`/`p_user_agent`/
  `p_referrer`/`p_medium` and 302s to `data.destination`. **Always redirects somewhere**, falling back to
  `https://linkstar.com.ar` on any error — a dead redirect at a physical device is the failure mode to
  avoid. Does not pass `p_country`/`p_region`/`p_city`/`p_latency_ms`; those are geo/latency enrichment
  nothing computes yet, so those `scan_events` columns stay null in practice.
- `routes/orders.js` — `POST /api/create-preference` (pending order + MP preference; `auto_return` only
  for non-localhost `FRONTEND_URL`), `POST /api/orders/transfer`, `POST /api/process-payment`,
  `GET /api/orders/:orderNumber`. Nothing here is reachable from a browser today — `apps/ventas` checkout
  doesn't call the API (see below) — but the hardening is already in place and must not be undone when it
  reconnects:
  - The three POSTs run `validateBody(...)` then `assertCatalogPrices(...)`, and `/api/process-payment`
    additionally runs `assertMatchesCatalogTotal(...)` and rejects a body with no `cartItems` rather than
    charging a client-supplied `transaction_amount` blind.
  - `GET /api/orders/:orderNumber` **requires `?email=<buyer_email>`** and matches it against
    `buyer_email` (`ilike`). This client is `service_role`, so it bypasses the `orders_select` policy of
    `0006` — the email check re-implements that policy by hand. Without it, guessing an order number
    returned the buyer's name, email, phone and address. Any new order-reading route needs the same
    second factor, or real auth.
  - Rate limits are per-router, not global: payments 20 / 15 min, order lookup 30 / 15 min (brute-force
    barrier on the order number), scans 30 / min in `redirect.js`.
  - Handlers re-throw with `err.status === 400` for validation failures and return a generic 500 message
    otherwise; the full error only goes to the server log (CWE-209). Keep that split.
- `routes/webhooks.js` — `POST /api/webhook/mercadopago`. Validates `x-signature` (HMAC-SHA256, fail-closed
  if `MP_WEBHOOK_SECRET` is unset) **before** anything else, acks `200` immediately (MP requires <22s),
  then processes async. Idempotency via `record_webhook_event()`'s unique `(provider, topic, external_id)`
  — MP retries, and this must not double-process a payment. Three topics: `payment` (hardware orders),
  `subscription_preapproval` (the subscription was authorized/paused/cancelled — this is what opens the
  dashboard) and `subscription_authorized_payment` (each monthly charge). The last two resolve the tenant
  through `external_reference`, and hand off to `apply_preapproval_event()` / `record_subscription_payment()`
  so all the period and grace arithmetic happens in one statement — the 200 already went out, so nothing
  retries a half-written row.
- `routes/subscriptions.js` — `POST /api/subscriptions/checkout` and `POST /api/subscriptions/cancel`,
  both behind `requireAuth` and both owner/admin only (checked by hand against `memberships`, because the
  `service_role` client bypasses RLS — same reasoning as the mandatory `?email=` on the order lookup).
  The body carries **only a plan code**: price and trial length are read from `plans`, never from the
  request. Neither route writes the subscription state — that is the webhook's job, so a failure in MP
  can't leave a customer cut off while they are actually paying.
- `routes/auth.js` — `POST /api/auth/login-event`, behind `requireAuth`. The only writer of
  `profiles.last_login_at`.
- `routes/health.js` — `GET /api/health`.

### `apps/dashboard`

Still pre-launch: most of the dashboard is **UI built ahead of its backend**. Read the "real vs. mock"
split below before wiring anything — the shell is finished, the data mostly isn't.

- Routing is `react-router-dom` (v7, `BrowserRouter` in `main.jsx`). `src/lib/routes.js` is the single
  source of truth: `PUBLIC_ROUTES` (`/`, `/iniciar-sesion`, `/registro`), `SECTION_PATHS` (section id →
  `/panel/...` path), and the `sectionFromPath` / `pathForSection` / `settingsTabPath` helpers. URLs are
  Spanish and ASCII-only (`/panel/resenas`, not `/panel/reseñas`). `/`, `/iniciar-sesion` and `/registro`
  render bare (no `AppShell`); everything under `/panel` renders inside it.
- Sections wired in `App.jsx` (and in `components/Sidebar/Sidebar.jsx`, which groups them):
  `company`, `devices`, `reviews`, the `gb-*` group (`gb-metrics`, `gb-profile`, `gb-posts`, `gb-seo`),
  the `reports-*` group (`reports-nps`, `reports-sentiment`, `reports-keywords`), `monthly-reports`,
  `automations`, `settings`, `profile`. Pages and `Sidebar` still speak in those **section ids**; the
  id → path translation happens in `App.jsx` and `AppShell.jsx`, so no page imports the router. Adding a
  section means touching three files: `SECTION_PATHS` in `lib/routes.js`, the `<Route>` in `App.jsx`, and
  the item in `Sidebar.jsx`.
- `AppShell` is the parent route of everything under `/panel`: it renders the sidebar + topbar once and
  the section into its `<Outlet />`. It derives the active section from `useLocation()` (never from its
  own state, or a deep link would leave the wrong sidebar item marked) and resets scroll to the top on
  every pathname change.
- `RequireAuth` in `App.jsx` gates the whole `/panel` subtree: with no authenticated user it redirects to
  `/iniciar-sesion` carrying `state.from`, and `LoginRoute` sends the user back there after signing in.
  `/panel/empresa` is the post-login landing page.
- Inside it, `RequireActivePlan` gates the same subtree on the onboarding: no organization → `/alta/empresa`,
  no plan chosen or no active access → `/alta/plan`. The `/alta/*` routes live **outside** it (they have
  their own `OnboardingStep` guard, which only checks the org exists) — a guard that also covered them would
  redirect to itself. `pages/Onboarding/` holds the five screens: `CreateOrg`, `PlanPicker`, `PlanCheckout`,
  `PlanResult` and `ClaimDevice`, all sharing `OnboardingLayout` (stepper + sign-out escape hatch). The
  stepper's last step differs by path — "Pago" for Business, "Expositor" for free — which is why it takes a
  `steps` prop instead of a module constant. `ClaimDevice` always offers a way out to the paid plans: a free
  user whose device hasn't arrived yet would otherwise be trapped with nothing but sign-out.
- `PlanResult` is a **waiting room, not a confirmation**. Coming back from Mercado Pago proves the user
  finished operating there, nothing else; it polls `my_org_context()` until the webhook lands, and never
  reads the query params MP appends (the customer can type those by hand).
- `context/OrgContext.jsx` owns the active organization and subscription state, all from `my_org_context()`.
  `useOrg()` exposes `hasOrg` / `hasChosenPlan` / `hasAccess` / `canManageBilling`, which is what the guards,
  the billing tab and `SubscriptionBanner` read.
- Settings tabs live in the URL (`/panel/configuracion/:tab` — `local`, `equipo`, `facturacion`, `legal`),
  which is what makes Devices' "Ver más" able to deep-link into "Gestión local". `SETTINGS_TAB_ALIASES`
  keeps the old ids (`general`, `employees`, `locations`, `team`, `billing`) working.
- **No screen fabricates data any more.** The screens that read the database: `company` (via
  `lib/dashboardApi.js`), `devices`, `employees` / `locations` (embedded in `settings`), the whole `/alta`
  onboarding, and the "Facturación" tab of `settings` (plan and status from `OrgContext`, history from
  `subscription_payments`). `profile` reads the logged-in user from `AuthContext`.
  **Every remaining section renders `components/SectionPlaceholder`** instead of the hardcoded arrays it
  used to show — `gb-*`, `reviews`, `reports-*`, `monthly-reports`, `automations`. The rule that replaced
  them: a page with no data source says so; it never prints a number that can't be distinguished from a
  measured one. The placeholder has two variants and picking the wrong one misleads:
  `google` for what the *customer* can unblock by connecting their Business Profile (it carries the connect
  button), `soon` for what *we* haven't built — NPS, monthly reports, automations — which gets no button,
  because a button that resolves nothing is worse than none. Each converted file keeps a header comment
  saying what it used to fake and which roadmap phase feeds it; the original mock markup and its CSS are
  still in git (and the CSS files are deliberately left in place — they are the design target for when the
  data arrives).
- `context/AuthContext.jsx` wraps `App` and owns all Supabase Auth state. Its `onAuthStateChange` listener
  is the single place that calls `POST /api/auth/login-event` on `SIGNED_IN` — don't duplicate that inside
  `Login`/`Register`.
- `lib/supabaseClient.js` — the anon-key client, the only Supabase client on the frontend. Once logged in
  it attaches the session JWT, so PostgREST evaluates queries as `authenticated`.
- `lib/config.js` — `REDIRECT_DOMAIN` from `VITE_REDIRECT_DOMAIN`, plus `API_URL` and `SALES_CONTACT_URL`
  (the latter is used by both the landing and the plan picker, so it stopped being a `Landing.jsx`
  constant). `lib/format.js` — `formatArs`, the one money formatter. `lib/qr.js` — `downloadQrPng`, builds
  the `https://<REDIRECT_DOMAIN>/d/<public_id>` QR client-side with the `qrcode` package (that's what the
  dependency is for). `lib/authErrors.js` — maps Supabase Auth error strings to Spanish UI copy.
- `lib/dashboardApi.js` — reads **only** the `0008` views (`v_device_performance`,
  `v_employee_leaderboard`, `v_location_performance`, `v_scans_daily`), never `scan_events`/
  `scan_daily_rollups` (invariant 2). Exports `ESTIMATED_LABEL` — any number derived from `review_deltas`
  must be labeled "estimado" (invariant 6). `v_dashboard_kpis` and `v_recent_activity` are consumed by
  `company` through `fetchDashboardKpis()` / `fetchRecentActivity()`.
- **Per-entity daily series** come from the `0016` views (`v_device_scans_daily`,
  `v_location_scans_daily`, `v_employee_scans_daily`) via `fetchDeviceScansSeries` /
  `fetchLocationScansSeries` / `fetchEmployeeScansSeries`, which return a `Map<id, number[]>` already
  densified to the requested window. Neither the views nor `v_scans_daily` bound the day range or fill
  gaps — a view takes no parameters, so the window and the zero-fill are the client's job.
  `lastNDayLabels()` builds the matching labels and must stay the labelling path: the sparklines used to
  be rotulated `['L','M','X','J','V','S','D']`, which assumes the series starts on a Monday when it is
  really the last N days ending today. `v_employee_scans_daily` has no consumer yet.
  Bars use a `max(2px, …)` height floor — an all-zero series (any new org) otherwise renders as an empty
  strip that reads as a broken chart rather than as "no activity".
- **"Escaneos" means human taps, everywhere** (`0018`). `scan_daily_rollups.scans` is a raw `count(*)`
  with bots in it — and the bot that matters here isn't an attacker: `resolve_scan`'s regex flags
  `whatsapp` and `facebookexternalhit`, so every time someone shares the expositor's link the preview hits
  the endpoint and books a "scan". The five aggregating views now expose `scans` (raw), `human_scans`,
  `bot_scans` and `unique_scans` side by side, and `lib/dashboardApi.js` always asks for the human column.
  Two things were already correct and were left alone: `v_recent_activity` filters `not is_bot`, and
  `devices.total_scans` is only incremented inside `resolve_scan`'s `if not v_bot`. If you add a view or a
  screen that shows a scan count, it reads `human_scans` — a second number that counts bots is the bug
  this migration existed to remove. `unique_scans` is *not* a substitute: it counts distinct people, which
  is what `v_location_performance` was showing under an "Escaneos" label until `0018` added
  `human_scans_30d` next to it.
- `pages/Devices/`, `pages/Employees/`, `pages/Locations/` read real data with the same pattern: fall back
  to `data/*.js` mock **only if the query throws**; an empty result (new org) renders as-is. Fields with no
  backing in the views render `'—'` instead of being fabricated. Devices and Locations distinguish **two**
  empty states, and the distinction is `hasAny` (computed over the unfiltered list, not the filtered one):
  "you haven't linked an expositor / loaded a branch yet" carries an instruction and a CTA, while "the
  filter matched nothing" offers to clear the filter. Telling a day-one account that nothing matched a
  search it never ran is what this replaced.
- `pages/Employees/` and `pages/Locations/` are reachable through `pages/Settings/Settings.jsx`, rendered
  inside the "Equipo" and "Gestión local" tabs with an `embedded` prop that hides their own page header and
  footer (Settings already has a `PageHeader`, and they'd otherwise show two titles and two footers). They
  used to be orphaned — written, wired to real data, and unreachable. If you move them again, keep them
  reachable from somewhere.
- `pages/Company/Company.jsx` is the post-login landing and is now **real, built on scans**: KPIs from
  `v_dashboard_kpis`, the 30-day series from `v_scans_daily`, and the feed from `v_recent_activity`. It is
  the only screen that **does not** fall back to a mock when its query fails — it exists precisely to stop
  showing invented numbers, so a failure is reported.
  The review KPIs render `'—'`, never `0`, and the page says why. That distinction is the whole point: a
  `0` is indistinguishable from "we measured and there were none", and the truth is nothing measures them
  yet — `location_review_snapshots` has no writer until `sync-reviews` exists. The gate is
  `hasReviewData`, derived from whether any location has a non-null `total_reviews`, so the numbers appear
  on their own once the first snapshot lands and nobody has to remember to edit this file.
- Out of scope so far: an org switcher. `my_org_context()` now *reads* `profiles.last_organization_id` to
  pick which organization to show (falling back to the oldest membership), but nothing writes it, so a user
  in several orgs always lands on the same one and has no way to change it from the UI.

### `apps/ventas`

- Routing is `react-router-dom` (v7, `BrowserRouter` in `main.jsx`), with the paths in `src/lib/routes.js`:
  `/`, `/tienda`, `/linkstarapp`, `/contacto`, `/finalizar-compra`, `/nosotros`, `/garantia`, `/legal`,
  `/privacidad`, `/terminos`. Unknown paths redirect to `/`.
- `SiteLayout` (navbar + `<Outlet />` + footer) wraps every page **except** `/finalizar-compra`: checkout
  is a purchase funnel and deliberately renders without navbar or footer, as it did before.
- `Navbar` and `Footer` use `<Link>`/`<NavLink>` — real `<a href>`s, crawlable and openable in a new tab.
  In-page CTAs (Hero, Features, FAQ…) keep their `onShop`/`onContact` callbacks, now wired to `navigate`:
  they are styled buttons, not navigation, so they were left alone.
- Cart state is global via `CartContext`; the `Cart` drawer is mounted outside `<Routes>` (it is a drawer,
  not a page) and navigates to checkout by itself.
- The Worker already serves the site with `not_found_handling: "single-page-application"`, so new paths
  work as deep links without touching `wrangler.jsonc`.
- `pages/LinkstarApp/LinkstarApp.jsx` is a **marketing page with a hardcoded mock dashboard**, not the real
  product — every chart/table on it is a static mock array, and "Acceder a LinkstarApp" is a no-op
  (`e.preventDefault()` only) because the real dashboard is `apps/dashboard`, not deployed yet.
- `pages/Shop/Shop.jsx` holds the device prices and the four tiers (1 unidad / 2 unidades / combo Google +
  Instagram / pedido grande) as module constants, and pushes items into `CartContext` with the price
  already resolved. See "Pricing".
- `pages/Checkout/Checkout.jsx` generates its own order number client-side and only sends a notification
  email via Web3Forms straight from the browser; it does **not** call `services/api`, so nothing is
  persisted in `orders` and nothing is charged. Real checkout/payment is being rebuilt separately with a
  collaborator. The two holes that made the old version unsafe are already fixed on the API side
  (server-side price validation via `lib/catalog.js`, and `?email=` required on the order-lookup route) —
  reconnecting means pointing this page at those routes, not re-doing that work, and not routing around
  it. Don't touch checkout/payment without confirming which direction is wanted.

## Pricing

Two separate things are priced, and they don't live in the same place. All amounts are Argentine pesos.

**The subscription** (dashboard, monthly): the source of truth is the **`plans` table**, not the code.
`price_ars`, `trial_days`, `checkout_mode` and `features.highlights` are seeded in `0013` and read at
runtime by the plan picker (`pages/Onboarding/PlanPicker.jsx`), the checkout summary, the landing's
pricing section and `POST /api/subscriptions/checkout`. A price change is an `update` on that table plus a
new preapproval amount in Mercado Pago — no deploy. `Landing.jsx` keeps a `PRICING_FALLBACK` array that
mirrors the seed and is used **only if the query fails**, so the landing never renders an empty pricing
section; it is not a second source of truth, and it is not what anyone gets charged.

`apps/ventas` describes the model — device paid once, platform monthly — but still shows **no subscription
amount** on purpose. Putting a monthly price on the sales site creates a copy that will drift.

**The hardware** (the expositores themselves): `apps/ventas/src/pages/Shop/Shop.jsx` — `UNIT_PRICE`,
`DOUBLE_TOTAL_PRICE`, `COMBO_TOTAL_PRICE` and the tiers derived from them. These *are* shown on the sales
site, and they are **deliberately duplicated** in `services/api/lib/catalog.js`, because the price charged
has to be decided by the server and never read off the request body. That copy is not a mistake to clean
up — but it does mean:

> Changing a price or a tier in `Shop.jsx` **requires the same change in `services/api/lib/catalog.js`, in
> the same commit.** Out of sync, the shop shows one number and every payment route rejects the cart with
> a 400 "Precio inválido".

When the rebuilt checkout gets a real catalog table, `lib/catalog.js` is replaced by a query against it and
this whole duplication goes away — that's the intended endgame, not the current state.

`SALES_CONTACT_URL` (now in `apps/dashboard/src/lib/config.js`, used by the landing *and* by the Enterprise
card of the plan picker) still points at the Instagram profile from the ventas footer, because that's the
only real contact channel in the repo. Replace it when there's a sales email or WhatsApp.

## Deployment

- `linkstarapp.com` is owned as a Cloudflare zone, not just used as a route target.
- `apps/ventas` deploys to Cloudflare Workers via `wrangler` (`apps/ventas/wrangler.jsonc`), routed at
  `linkstarapp.com/*`, serving `./dist` as a single-page app. Wrangler resolves paths relative to the
  config file, so the move into the monorepo needed no path change — but the binary is now hoisted to the
  root `node_modules` and there is no `wrangler.jsonc` at the root, so deploy with `npm run deploy:ventas`
  from the root or `npx wrangler deploy` from inside `apps/ventas`.
- `services/api` deploys to Railway or Render (plain Node host, not a Worker), root directory
  `services/api`, planned at `api.linkstarapp.com`. When that goes live, update `apps/ventas/.env.production`'s
  `VITE_API_URL` and the API's `FRONTEND_URL` together.
- `apps/dashboard` has no deploy target configured yet. Whatever host it lands on must serve `index.html`
  for unknown paths (SPA fallback), or every `/panel/...` deep link and every browser refresh returns 404 —
  the same `not_found_handling` the ventas Worker already sets.
- Of the three services `packages/database/supabase/README.md` originally assumed would be Edge Functions,
  two now live in `services/api` (`routes/redirect.js`, `routes/webhooks.js`) and are not planned as
  separate functions. Only `sync-reviews` (the daily Google Business Profile job that fills
  `location_review_snapshots`) still doesn't exist anywhere — and until it does, every "reseñas" number in
  the product is either mock or unfed.

## Language note

Code comments, commit messages, UI copy, `README.md` and `packages/database/supabase/README.md` are in
Spanish (Argentina) — that's the working language of the project and of the two people on it. This file
(`CLAUDE.md`) is the exception and stays in English. Match whatever the file you're editing already uses.
