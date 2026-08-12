# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Linkstar sells NFC/QR "expositores" — physical cards a business puts on tables and counters so customers
tap or scan them and land on the business's Google review form. Buyers then manage those devices from
**LinkstarApp**, a multi-tenant SaaS dashboard (devices, locations, employees (soon), scan analytics).

The dashboard is a **paid subscription**, billed monthly, no lock-in. It is not bundled free with the
hardware — earlier copy on the sales site said it was, and that is no longer true anywhere in this repo.
See "Pricing" below before touching any price or plan wording.

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

Supabase (needs the `supabase` CLI installed globally):

```bash
npm run db:push          # -> supabase db push, from packages/database
npm run db:reset         # -> supabase db reset (applies 0000 → 0012 in order, locally)
npm run db:status        # -> supabase migration list (local vs remote), from packages/database
```

`supabase migration list` compares local vs remote. If a migration was applied by hand outside the CLI
(has happened, see `0010`), `supabase migration repair --status applied <version>` fixes the history
without re-running the SQL. Run `packages/database/supabase/tests/rls_isolation.sql` before any RLS change
ships.

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
  `PORT`, `FRONTEND_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `WEBHOOK_URL`, `WEB3FORMS_KEY`,
  `REDIRECT_DOMAIN` (optional, defaults to `l.linkstar.com.ar`).
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
2. **The dashboard never reads `scan_events` directly.** It reads `scan_daily_rollups`, rebuilt nightly
   with an idempotent `DELETE + INSERT` per day, so any day can be safely recomputed.
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

Migration responsibilities: `0001` extensions/enums/ID & IP-hash helpers · `0002` tenancy
(`organizations`, `profiles`, `memberships`, `invitations`, plus the `on_auth_user_created` trigger that
creates a `profiles` row on signup) · `0003` catalog (`locations`, `employees`, `devices`) ·
`0004` events/rollups/review snapshots/audit · `0005` billing + `orders` · `0006` **all RLS policies** ·
`0007` `resolve_scan`, `claim_device`, plan limits, nightly jobs · `0008` dashboard views
(`security_invoker`) · `0009` webhook RPCs · `0010` `profiles.last_login_at` · `0011` `scan_events.medium`
(`qr`/`nfc`) and the `resolve_scan` overload that takes `p_medium` · `0012` `public.rebuild_today_rollup()`.

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
  — MP retries, and this must not double-process a payment.
- `routes/auth.js` — `POST /api/auth/login-event`, behind `requireAuth`. The only writer of
  `profiles.last_login_at`.
- `routes/health.js` — `GET /api/health`.

### `apps/dashboard`

Still pre-launch: most of the dashboard is **UI built ahead of its backend**. Read the "real vs. mock"
split below before wiring anything — the shell is finished, the data mostly isn't.

- `App.jsx` owns a single `activeSection` string — that is the whole routing mechanism, no router library.
  It starts at `landing`; `landing`, `login` and `register` render bare (no `AppShell`), everything else
  renders inside it. `PROTECTED_SECTIONS` is gated: with no authenticated user, App renders `Login`.
  `company` is the post-login landing page.
- Sections wired in `App.jsx` (and in `components/Sidebar/Sidebar.jsx`, which groups them):
  `company`, `devices`, `reviews`, the `gb-*` group (`gb-metrics`, `gb-profile`, `gb-posts`, `gb-seo`),
  the `reports-*` group (`reports-nps`, `reports-sentiment`, `reports-keywords`), `monthly-reports`,
  `automations`, `settings`, `profile`. Adding a section means touching both files.
- **Real vs. mock.** Only three screens read the database: `devices` (via `lib/dashboardApi.js`) and
  `employees` / `locations` (embedded in `settings`). `profile` reads the logged-in user from
  `AuthContext`. **Everything else is a static mock** — `company` and `reviews` off `data/reviews.js`,
  and `gb-*`, `reports-*`, `monthly-reports`, `automations` off arrays hardcoded in their own files
  (review counts, NPS, Google Business metrics, monthly PDFs, automation toggles). None of that has a
  backing table, and most of it can't have one until the Google Business Profile integration exists.
  Treat those pages as design targets, not as features: don't "fix" their numbers, and don't cite them as
  evidence that a data source exists.
- `context/AuthContext.jsx` wraps `App` and owns all Supabase Auth state. Its `onAuthStateChange` listener
  is the single place that calls `POST /api/auth/login-event` on `SIGNED_IN` — don't duplicate that inside
  `Login`/`Register`.
- `lib/supabaseClient.js` — the anon-key client, the only Supabase client on the frontend. Once logged in
  it attaches the session JWT, so PostgREST evaluates queries as `authenticated`.
- `lib/config.js` — `REDIRECT_DOMAIN` from `VITE_REDIRECT_DOMAIN`. `lib/qr.js` — `downloadQrPng`, builds
  the `https://<REDIRECT_DOMAIN>/d/<public_id>` QR client-side with the `qrcode` package (that's what the
  dependency is for). `lib/authErrors.js` — maps Supabase Auth error strings to Spanish UI copy.
- `lib/dashboardApi.js` — reads **only** the `0008` views (`v_device_performance`,
  `v_employee_leaderboard`, `v_location_performance`, `v_scans_daily`), never `scan_events`/
  `scan_daily_rollups` (invariant 2). Exports `ESTIMATED_LABEL` — any number derived from `review_deltas`
  must be labeled "estimado" (invariant 6). `v_dashboard_kpis` and `v_recent_activity` exist but nothing
  consumes them yet.
- `pages/Devices/`, `pages/Employees/`, `pages/Locations/` read real data with the same pattern: fall back
  to `data/*.js` mock **only if the query throws**; an empty result (new org) renders as-is. Fields with no
  backing in the views render `'—'` instead of being fabricated.
- `pages/Employees/` and `pages/Locations/` are reachable through `pages/Settings/Settings.jsx`, rendered
  inside the "Equipo" and "Gestión local" tabs with an `embedded` prop that hides their own page header and
  footer (Settings already has a `PageHeader`, and they'd otherwise show two titles and two footers). They
  used to be orphaned — written, wired to real data, and unreachable. If you move them again, keep them
  reachable from somewhere.
- `pages/Company/Company.jsx` is the post-login landing and is **100% mock** (`data/reviews.js`). There is
  no `reviews` table anywhere — only aggregate daily snapshots, with no text/author/sentiment. Making it
  real needs the Google Business Profile `sync-reviews` integration, which does not exist.
- Out of scope so far: org creation/onboarding (a user with no `organizations`/`memberships` row reaches
  the shell and sees empty states), and an org switcher (a user in several orgs gets rows from all of them
  mixed; `profiles.last_organization_id` exists but nothing reads or writes it).

### `apps/ventas`

- Single-page app with no router: `App.jsx` holds a `page` string in `useState` and conditionally renders
  whole page components. Navigation is `onX` callbacks passed down through `Navbar`/`Footer`. Cart state is
  global via `CartContext` and the `Cart` drawer is always mounted.
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

Two separate things are priced, and they don't live in the same place. All amounts are Argentine pesos, all
hardcoded in the frontend — there is no `plans`/catalog row driving any of this yet.

**The subscription** (dashboard, monthly): one source of truth,
`apps/dashboard/src/pages/Landing/Landing.jsx` (`STARTER_PRICE` and the "A medida" card). `apps/ventas`
describes the model — device paid once, platform monthly, no lock-in — but shows **no subscription amount**
on purpose. If you put a monthly price on the sales site you've created a second source of truth that will
drift. The old `$0 / siempre` block and the "incluido gratis / sin suscripciones" copy were removed for
exactly this reason.

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

`SALES_CONTACT_URL` in `Landing.jsx` still points at the Instagram profile from the ventas footer, because
that's the only real contact channel in the repo. Replace it when there's a sales email or WhatsApp.

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
- `apps/dashboard` has no deploy target configured yet.
- Of the three services `packages/database/supabase/README.md` originally assumed would be Edge Functions,
  two now live in `services/api` (`routes/redirect.js`, `routes/webhooks.js`) and are not planned as
  separate functions. Only `sync-reviews` (the daily Google Business Profile job that fills
  `location_review_snapshots`) still doesn't exist anywhere — and until it does, every "reseñas" number in
  the product is either mock or unfed.

## Language note

Code comments, commit messages, UI copy, `README.md` and `packages/database/supabase/README.md` are in
Spanish (Argentina) — that's the working language of the project and of the two people on it. This file
(`CLAUDE.md`) is the exception and stays in English. Match whatever the file you're editing already uses.
