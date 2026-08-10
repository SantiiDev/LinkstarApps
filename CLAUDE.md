# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Linkstar sells NFC/QR "expositores" — physical cards a business puts on tables and counters so customers
tap or scan them and land on the business's Google review form. Buyers then manage those devices from
**LinkstarApp**, a multi-tenant SaaS dashboard (devices, locations, employees, scan analytics).

The dashboard is a **paid subscription**, billed monthly, no lock-in. It is not bundled free with the
hardware — earlier copy on the sales site said it was, and that is no longer true anywhere in this repo.
See "Pricing" below before touching any price or plan wording.

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
```

`supabase migration list` compares local vs remote. If a migration was applied by hand outside the CLI
(has happened, see `0010`), `supabase migration repair --status applied <version>` fixes the history
without re-running the SQL. Run `packages/database/supabase/tests/rls_isolation.sql` before any RLS change
ships.

Ops scripts live in `services/api/scripts/` and run with `node scripts/<name>.js` from `services/api`.
They use the same `service_role` client as the server, so `services/api/.env` decides whether you are
writing to local or production.

No test runner is configured in any workspace.

### Environment

`.env` files are **not** in git (`services/api/.env` used to be, with a real `service_role` key in it — it
was untracked during the monorepo migration, but it is still reachable in the pre-monorepo history of
`SantiiDev/LinkstarApp`, so that key must stay rotated).

- `services/api/.env` — see `services/api/.env.example`. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `PORT`, `FRONTEND_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `WEBHOOK_URL`, `WEB3FORMS_KEY`.
  `FRONTEND_URL` is **comma-separated**: this one service serves both frontends, so CORS needs both
  origins. The first entry is the one used for Mercado Pago `back_urls`, so it must be the ventas site
  (that's where checkout lives). Missing `SUPABASE_SERVICE_ROLE_KEY` only warns at boot — writes then fail
  later at request time via RLS rejection.
- `apps/dashboard/.env` — see `apps/dashboard/.env.example`. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL`.
- `apps/ventas/.env.production` — `VITE_API_URL`, still the `BACKEND_URL_PENDIENTE` placeholder until the
  API is deployed.

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
  `GET /api/orders/:orderNumber`.
- `routes/webhooks.js` — `POST /api/webhook/mercadopago`. Validates `x-signature` (HMAC-SHA256, fail-closed
  if `MP_WEBHOOK_SECRET` is unset) **before** anything else, acks `200` immediately (MP requires <22s),
  then processes async. Idempotency via `record_webhook_event()`'s unique `(provider, topic, external_id)`
  — MP retries, and this must not double-process a payment.
- `routes/auth.js` — `POST /api/auth/login-event`, behind `requireAuth`. The only writer of
  `profiles.last_login_at`.
- `routes/health.js` — `GET /api/health`.

### `apps/dashboard`

- `App.jsx` owns a single `activeSection` string — that is the whole routing mechanism, no router library.
  `PROTECTED_SECTIONS` is gated: with no authenticated user, App renders `Login`. `company` is the
  post-login landing page.
- `context/AuthContext.jsx` wraps `App` and owns all Supabase Auth state. Its `onAuthStateChange` listener
  is the single place that calls `POST /api/auth/login-event` on `SIGNED_IN` — don't duplicate that inside
  `Login`/`Register`.
- `lib/supabaseClient.js` — the anon-key client, the only Supabase client on the frontend. Once logged in
  it attaches the session JWT, so PostgREST evaluates queries as `authenticated`.
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
- `pages/Checkout/Checkout.jsx` generates its own order number client-side and only sends a notification
  email via Web3Forms straight from the browser; it does not call `services/api`. Real checkout/payment is
  being rebuilt separately with a collaborator. Before reconnecting it: validate item price/qty server-side
  against the real catalog (the old implementation trusted `req.body.price`) and require auth on the
  order-lookup route (it used to return buyer name/email/phone/address to anyone who guessed an order
  number). Don't touch checkout/payment without confirming which direction is wanted.

## Pricing

One source of truth: `apps/dashboard/src/pages/Landing/Landing.jsx` (`STARTER_PRICE` and the "A medida"
card). Prices are in Argentine pesos.

`apps/ventas` describes the model — device paid once, platform monthly, no lock-in — and deliberately shows
**no amounts**, so there is nothing to keep in sync. If you add a price to the sales site, you have created
a second source of truth that will drift. The old `$0 / siempre` block and the "incluido gratis / sin
suscripciones" copy were removed for exactly this reason.

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
- Three pieces referenced by `packages/database/supabase/README.md` still don't exist as services: the
  production `redirect` function (the Express route covers it for now), an `mp-webhook` handler outside the
  API, and the `sync-reviews` daily job.

## Language note

Code comments, commit messages, and `packages/database/supabase/README.md` are in Spanish (Argentina).
Match that when editing existing files in `services/api/` and `packages/database/`. UI copy is Spanish too.
This file and the per-repo docs are in English.
