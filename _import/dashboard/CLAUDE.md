# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Linkstar: NFC/QR devices ("expositores") that businesses place at tables/counters to drive Google review scans. Multi-tenant SaaS with an admin dashboard (devices, employees, locations, scan analytics) plus a storefront that sells the physical devices via Mercado Pago or bank transfer.

The repo has three independent parts that are developed and run separately:

- `frontend/` — React 19 + Vite SPA (dashboard UI and landing/storefront pages)
- `backend/` — Express server (payments, order persistence, NFC/QR redirect resolution)
- `supabase/` — PostgreSQL schema, RLS policies, and SQL tests (source of truth for data model)

**Current state:** auth (registration/login/logout + route guard) is wired end-to-end through Supabase Auth. `pages/Devices/Devices.jsx` reads real scan/device/location analytics from Supabase (via `frontend/src/lib/dashboardApi.js` and the `0008` views), falling back to `frontend/src/data/*.js` mock only if a query throws. `pages/Employees/Employees.jsx` and `pages/Locations/Locations.jsx` are wired the same way but are currently unreachable from the app (see Frontend section below — `Settings.jsx` replaced them with placeholder tabs). `pages/Company/Company.jsx`, the actual post-login landing page, is still 100% mock (`data/reviews.js`) and has no schema to connect to yet (no Google Business Profile review content anywhere in Supabase).

## Commands

### Frontend (`frontend/`)
```bash
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # production build
npm run lint      # oxlint (rules: frontend/.oxlintrc.json — react/rules-of-hooks, react/only-export-components)
npm run preview   # preview production build
```
No test runner is configured.

### Backend (`backend/`)
```bash
npm start          # node server.js
npm run dev        # node --watch server.js, http://localhost:3001
```
Requires a `.env` (no `.env.example` present) with at minimum: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `FRONTEND_URL`, `WEBHOOK_URL`, `WEB3FORMS_KEY`. Missing `SUPABASE_SERVICE_ROLE_KEY` only logs a warning — writes will then fail at request time via RLS rejection, not at startup.

Frontend requires `frontend/.env` (see `frontend/.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (defaults to `http://localhost:3001`).

### Supabase (`supabase/`)
```bash
supabase db reset   # apply all migrations locally, in filename order
supabase db push    # apply to the remote project
```
Migrations in `supabase/migrations/` are numbered and must be applied in order (0000 → 0012). `supabase/tests/rls_isolation.sql` verifies tenant isolation and should be run before any RLS change ships. Local (`supabase db reset`) and remote (`supabase db push`, requires `supabase link` + a `SUPABASE_ACCESS_TOKEN`) can drift — `supabase migration list` compares them; if a migration was applied by hand outside the CLI (has happened before, see 0010), `supabase migration repair --status applied <version>` fixes the history without re-running the SQL.

## Architecture

### Data model and the six decisions that matter (`supabase/README.md`)

The tenant is `organizations`, not `locations` — a business with 5 branches is one org with 5 `locations` rows, so cross-branch comparisons stay possible. Key invariants baked into the schema:

1. **Attribution is a snapshot, not a JOIN.** `scan_events` copies `location_id`/`employee_id`/`kind` at scan time. Never rewrite this via JOIN to "current" assignment — reassigning a device retroactively would zero out historical stats for the previous employee.
2. **The dashboard never reads `scan_events` directly.** It reads `scan_daily_rollups`, rebuilt nightly via idempotent `DELETE + INSERT` per day (any day can be safely recomputed).
3. **`resolve_scan()` is never granted to `anon`.** Only a trusted server (backend `service_role` client) may call it — `anon` calling it directly would let anyone inflate/pollute another tenant's metrics using a known `public_id`.
4. **Devices are never created client-side.** They're provisioned with `status = 'unassigned'` and a printed `claim_code`; customers link them via `claim_device()`. No client INSERT policy exists on `devices` — that would bypass plan device limits.
5. **Every view has `security_invoker = on`.** Without it a view runs with the creator's privileges and silently ignores the underlying tables' RLS — this is the most common way multi-tenant leaks happen even when table-level RLS is correct.
6. **"Estimated reviews" is a real product constraint, not a UI nitpick.** Google gives no callback/webhook for new reviews. Only the daily total review count per location (via Google Business Profile/Places API) is ground truth, stored in `location_review_snapshots`; day-over-day deltas (`review_deltas`) are the only real signal. Per-employee/per-device attribution is necessarily a prorated estimate across unique scans — must stay labeled "estimated" in any UI that surfaces it.

Migration file responsibilities: `0001` extensions/enums/ID & IP-hash helpers · `0002` tenancy (`organizations`, `profiles`, `memberships`, `invitations` — includes the `on_auth_user_created` trigger that auto-creates a `profiles` row on signup) · `0003` catalog (`locations`, `employees`, `devices`) · `0004` events/rollups/review snapshots/audit · `0005` billing/`orders` · `0006` **all RLS policies** · `0007` `resolve_scan`, `claim_device`, plan limits, nightly jobs · `0008` dashboard views (`security_invoker`) · `0009` webhook RPCs (`record_webhook_event`, `mark_webhook_processed`) · `0010` adds `profiles.last_login_at`, written by the backend on every login (see below) · `0011` adds `scan_events.medium` (`qr`/`nfc`) and the matching `resolve_scan` overload, read from `routes/redirect.js`'s `?s=` query param · `0012` adds `public.rebuild_today_rollup(p_day date default current_date)`, a thin `public`-schema wrapper around `private.rebuild_daily_rollups()` so it's callable via RPC (service_role only) instead of waiting for the nightly cron — see `backend/scripts/rebuild-today-rollup.js`.

### Backend (`backend/`)

`server.js` is just the composition root — it creates the Express app and mounts routers; it holds no route logic itself. Uses the Supabase **service_role** key deliberately (not anon) because RLS denies `orders` writes and `resolve_scan`/webhook RPCs to `anon`/`authenticated` by design — only this trusted backend may perform them.

- `lib/config.js` — env/config constants (`PORT`, `FRONTEND_URL`, ...).
- `lib/supabase.js` — the single service_role Supabase client, imported by every route file.
- `lib/mercadopago.js` — MP SDK client, `isValidMpSignature` (webhook HMAC check), `withTimeout`.
- `lib/orders.js` — `generateOrderNumber`, `createOrder` (shared by all three payment routes).
- `lib/email.js` — `sendEmailNotification`, posts order details to Web3Forms as the order-notification channel (no transactional email service).
- `middleware/auth.js` — `requireAuth(supabase)`, validates the Supabase session JWT from `Authorization: Bearer <token>` via `supabase.auth.getUser(token)`.

Routes (one router per file, all mounted at the app root in `server.js`):
- `routes/redirect.js` — `GET /d/:publicId`. NFC/QR redirect entrypoint. Calls `resolve_scan()` RPC with `p_public_id`/`p_ip`/`p_user_agent`/`p_referrer`/`p_medium` and redirects 302 to `data.destination`. Always redirects somewhere (falls back to `https://linkstar.com.ar`) even on error — a broken redirect at the physical device is the failure mode to avoid. Does **not** currently pass `p_country`/`p_region`/`p_city`/`p_latency_ms` even though `resolve_scan` accepts them — those params are geo/latency enrichment the backend doesn't compute yet, so they stay `null` and `scan_events.country/region/city/latency_ms` are unpopulated in practice. `p_medium` is derived from the `?s=` query param (`q`→`'qr'`, `n`→`'nfc'`, anything else → `null`) — the physical URL printed on the QR vs. baked into the NFC chip differ only by this suffix.
- `routes/orders.js` — `POST /api/create-preference` (pending `orders` row + Mercado Pago preference; `auto_return` only sent for non-localhost `FRONTEND_URL`), `POST /api/orders/transfer` (pending order for bank-transfer, no MP), `POST /api/process-payment` (direct card payment via MP Payment Brick token, idempotency key `orderNumber-timestamp`), `GET /api/orders/:orderNumber` (order + `order_items` lookup for the success page).
- `routes/webhooks.js` — `POST /api/webhook/mercadopago`. Validates `x-signature` (HMAC-SHA256 manifest, fail-closed if `MP_WEBHOOK_SECRET` unset) **before** anything else, responds `200` immediately (MP requires <22s ack), then processes async. Idempotency is enforced via `record_webhook_event()`'s unique `(provider, topic, external_id)` key — MP retries the same notification and this must not double-process a payment.
- `routes/auth.js` — `POST /api/auth/login-event`, protected by `requireAuth`. Called by the frontend right after a `SIGNED_IN` auth event; writes `profiles.last_login_at` with the `service_role` client. This is the only place that column is written — same "client never writes sensitive stuff, trusted backend does" pattern as everything else here.
- `routes/health.js` — health check endpoint.

Ops scripts (`backend/scripts/`, run manually with `node scripts/<name>.js`, use the same `service_role` client as everything else here — point `backend/.env` at whichever project you mean to write to, local or production):
- `provision-devices.js <kind> <count> [batch_code]` — bulk-inserts `unassigned` devices (decision 4: never client-created) with DB-generated `public_id`/`claim_code`, prints the `https://<REDIRECT_DOMAIN>/d/<public_id>` URL to record on each physical unit. `kind` restricted to `google_review`/`instagram`; max 500 per run.
- `seed-test-device.js --owner-email=... --place-id=... --instagram=... [--org-name=] [--location-id=]` — creates a test `organization`+`location` (or reuses one via `--location-id` if a prior run already created it but ran out of unassigned devices) and assigns one provisioned device to it, replicating `claim_device()`'s writes directly rather than calling the RPC — `claim_device()`'s `auth.uid()` permission check has nothing to check against when called from a script with no real user session.
- `rebuild-today-rollup.js [YYYY-MM-DD]` — calls `public.rebuild_today_rollup()` (0012) to see dashboard changes immediately instead of waiting for the nightly cron.

### How a scan resolves to a URL (`resolve_scan`, `0007_functions_and_jobs.sql`)

The destination URL is **not** a single stored column — `resolve_scan()` builds it at scan time from a `coalesce` cascade, in this priority order:

1. `devices.destination_url` — manual per-device override, if set. Escape hatch for one-off links; skips everything below.
2. Otherwise, branch on `devices.kind` (`public.device_kind` enum: `'google_review' | 'instagram' | 'custom'`, default `'google_review'`):
   - `'google_review'` → `locations.google_review_url`, else built from `locations.google_place_id` (`https://search.google.com/local/writereview?placeid=<PLACE_ID>`), else `locations.google_maps_url`.
   - `'instagram'` → `locations.instagram_url`, else built from `locations.instagram_handle` (`https://instagram.com/<handle>`).
   - `'custom'` → no branch logic; relies entirely on `devices.destination_url` (step 1) or falls through.
3. `organizations.fallback_url`.
4. Hardcoded `'https://linkstar.com.ar'` — the last-resort default so a scan never dead-ends.

So `kind` lives on `devices.kind` and is what tells `resolve_scan` *which* location columns to read — it's copied verbatim (never re-derived) into `scan_events.kind` and `scan_daily_rollups.kind` as the attribution snapshot described in decision 1 above.

**Scan medium (QR vs NFC).** `scan_events.medium` (`public.scan_medium` enum: `'qr' | 'nfc'`, nullable) records which physical surface was touched — added in `0011_scan_medium.sql` alongside a `resolve_scan` overload that takes a trailing `p_medium text default null` (normalized to `'qr'`/`'nfc'`/`null` inside the function; never trust the caller). `routes/redirect.js` derives it from the `?s=` query param (`q`→`'qr'`, `n`→`'nfc'`) — the QR-printed URL and the NFC-chip URL for the same `public_id` differ only by that suffix, baked in at print/provisioning time. `rebuild_daily_rollups`/`scan_daily_rollups` don't group by medium — the column is additive, available for ad-hoc queries but not (yet) part of the rollup grain.

### Frontend (`frontend/src`)

**This section was rewritten after finding the previous version badly stale** — it described a `DashboardView`/`KpiCards`/`BarChart`/`RecentActivity`/`EmployeeRanking`/`DeviceGrid` component set that no longer exists anywhere in the repo. The frontend was redesigned (see recent commits "Dashboard modification"/"Dashboard interface fix") into a Google-Business-Profile-styled product. If this section ever looks wrong again, `grep` for the component name before trusting it — don't assume this doc is current.

- `App.jsx` owns a single `activeSection` state (`landing` | `login` | `register` | `company` | `devices` | `reviews` | `gb-metrics` | `gb-profile` | `gb-posts` | `gb-seo` | `reports-nps` | `reports-sentiment` | `reports-keywords` | `monthly-reports` | `automations` | `settings` | `profile`) — this is the entire routing mechanism, no router library. `PROTECTED_SECTIONS` is gated: if there's no authenticated user, App renders `Login` instead. There is no `dashboard`/`employees`/`locations` section anymore — `company` is the post-login landing page.
- `context/AuthContext.jsx` wraps `App` (in `main.jsx`) and owns all Supabase Auth state: `user`, `session`, `loading` (true while restoring a persisted session — avoids a login-page flash on refresh), `signIn`, `signUp`, `signOut`. Its `onAuthStateChange` listener is the single place that calls `POST /api/auth/login-event` on `SIGNED_IN` — don't duplicate that call inside `Login`/`Register`.
- `pages/Login/` and `pages/Register/` are the auth screens (Spanish UI, errors translated via `lib/authErrors.js`). Registration itself talks directly to Supabase Auth (`supabase.auth.signUp`) — there is no backend signup route; if the Supabase project has email confirmation enabled, `signUp` won't return a session and the UI shows a "check your email" message instead of navigating in.
- `lib/supabaseClient.js` creates the anon-key client from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; this is the only Supabase client on the frontend (same anon-key-is-public-by-design model documented in `supabase/README.md`). Once a user is logged in, this same client attaches their session JWT to every request, so PostgREST evaluates queries as `authenticated`, not `anon`.
- `lib/dashboardApi.js` — the fetching layer for dashboard analytics, added when `Devices.jsx` was wired to real data. Reads **only** `v_device_performance`, `v_employee_leaderboard`, `v_location_performance`, `v_scans_daily` (`supabase/migrations/0008_dashboard_views.sql`) — never `scan_events`/`scan_daily_rollups` directly (decision 2). `v_dashboard_kpis` and `v_recent_activity` exist in the schema but aren't consumed anywhere yet — no current page has a slot for a general KPI panel or an activity feed. Exports fetchers, `formatRelativeTime`, `colorForIndex`, `initialsFor`, and the `ESTIMATED_LABEL` constant (decision 6: any number derived from `review_deltas` — directly or via the views that aggregate it — must be labeled "estimado" in the UI).
- **`pages/Company/Company.jsx`** is the post-login landing page (`activeSection === 'company'`) — a Google Business Profile-style overview: individual reviews with author/text/rating/sentiment, response rate, star distribution. It renders entirely from `data/reviews.js` mock data and **has no real backing in the schema at all** — there's no `reviews` table, only aggregate daily snapshots (`location_review_snapshots`/`review_deltas`, no text/author/sentiment). Wiring this up for real requires the Google Business Profile integration that `supabase/README.md` lists as not built yet (`sync-reviews`). Left on mock intentionally.
- **`pages/Devices/Devices.jsx`** (`activeSection === 'devices'`) is wired to real Supabase data via `lib/dashboardApi.js`: device grid/table from `v_device_performance`, the "Actividad de Dispositivos" chart from `v_scans_daily` (refetched on period change, 7/30 days), and the "Ranking de ubicaciones" mini-table from `v_location_performance`. Falls back to `data/devices.js`/`data/locations.js` mock **only if the query throws** — an empty result (new org, no devices yet) is rendered as-is, not treated as a failure. Fields with no per-device backing in the view (`reviews`, `conversion`, `activeSince`, per-day `weeklyScans`) render `'—'` instead of being fabricated.
- **`pages/Employees/Employees.jsx`** and **`pages/Locations/Locations.jsx`** are also wired to real data (`v_employee_leaderboard` and `v_location_performance`, cross-joined client-side with `v_device_performance` to build real "devices assigned"/"last activity" fields) with the same null-safe/mock-fallback pattern as Devices. **But neither is reachable from the app.** `Settings.jsx` replaced the old standalone Employees/Locations screens with `team`/`local` tabs that are static placeholders ("Próximamente", disabled invite button) — it does not import or render `EmployeesPage`/`LocationsPage`. `grep -rn "EmployeesPage\|LocationsPage" frontend/src` turns up only their own `export default function` lines. This is orphaned-but-correct code, left as-is on purpose (2026-08-06 decision) — if these are ever re-exposed, wire them into `App.jsx` or into the corresponding `Settings.jsx` tab instead of the placeholder content.
- `data/*.js` still holds all mock data (`devices.js`, `employees.js`, `locations.js`, `reviews.js`). `reviews.js` still drives `Company.jsx` for real; `devices.js`/`employees.js`/`locations.js` are now fallback-only for their respective pages.
- Out of scope so far: organization creation/onboarding — a logged-in user without an `organizations`/`memberships` row reaches the dashboard shell fine, just sees empty real-data states everywhere. Also out of scope: an org switcher — a user belonging to more than one organization gets rows from all of them mixed together in `lib/dashboardApi.js` fetches (RLS filters by membership, not by a single "current org"); `profiles.last_organization_id` exists in the schema for this but nothing reads/writes it yet.
- Not yet built (per `supabase/README.md`, "Lo que falta construir"): the three pieces needing secrets that must live in Supabase Edge Functions or Cloudflare Workers, not the SPA — `redirect` (production version of the `/d/:public_id` flow currently in the Express backend), `mp-webhook`, and `sync-reviews` (daily Google review-count sync job).

## Language note

Code comments, commit messages, and `supabase/README.md` are in Spanish (Argentina) — match that when editing existing files in `backend/` and `supabase/`.
