# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Linkstar: NFC/QR devices ("expositores") that businesses place at tables/counters to drive Google review scans. Multi-tenant SaaS with an admin dashboard (devices, employees, locations, scan analytics) plus a storefront that sells the physical devices via Mercado Pago or bank transfer.

The repo has three independent parts that are developed and run separately:

- `frontend/` — React 19 + Vite SPA (dashboard UI and landing/storefront pages)
- `backend/` — Express server (payments, order persistence, NFC/QR redirect resolution)
- `supabase/` — PostgreSQL schema, RLS policies, and SQL tests (source of truth for data model)

**Current state:** auth (registration/login/logout + route guard) is wired end-to-end through Supabase Auth. The dashboard's *data* (devices, employees, locations, scan analytics) still renders entirely from static mock data in `frontend/src/data/*.js` — that part is not yet connected to Supabase/RLS.

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
Migrations in `supabase/migrations/` are numbered and must be applied in order (0000 → 0010). `supabase/tests/rls_isolation.sql` verifies tenant isolation and should be run before any RLS change ships.

## Architecture

### Data model and the six decisions that matter (`supabase/README.md`)

The tenant is `organizations`, not `locations` — a business with 5 branches is one org with 5 `locations` rows, so cross-branch comparisons stay possible. Key invariants baked into the schema:

1. **Attribution is a snapshot, not a JOIN.** `scan_events` copies `location_id`/`employee_id`/`kind` at scan time. Never rewrite this via JOIN to "current" assignment — reassigning a device retroactively would zero out historical stats for the previous employee.
2. **The dashboard never reads `scan_events` directly.** It reads `scan_daily_rollups`, rebuilt nightly via idempotent `DELETE + INSERT` per day (any day can be safely recomputed).
3. **`resolve_scan()` is never granted to `anon`.** Only a trusted server (backend `service_role` client) may call it — `anon` calling it directly would let anyone inflate/pollute another tenant's metrics using a known `public_id`.
4. **Devices are never created client-side.** They're provisioned with `status = 'unassigned'` and a printed `claim_code`; customers link them via `claim_device()`. No client INSERT policy exists on `devices` — that would bypass plan device limits.
5. **Every view has `security_invoker = on`.** Without it a view runs with the creator's privileges and silently ignores the underlying tables' RLS — this is the most common way multi-tenant leaks happen even when table-level RLS is correct.
6. **"Estimated reviews" is a real product constraint, not a UI nitpick.** Google gives no callback/webhook for new reviews. Only the daily total review count per location (via Google Business Profile/Places API) is ground truth, stored in `location_review_snapshots`; day-over-day deltas (`review_deltas`) are the only real signal. Per-employee/per-device attribution is necessarily a prorated estimate across unique scans — must stay labeled "estimated" in any UI that surfaces it.

Migration file responsibilities: `0001` extensions/enums/ID & IP-hash helpers · `0002` tenancy (`organizations`, `profiles`, `memberships`, `invitations` — includes the `on_auth_user_created` trigger that auto-creates a `profiles` row on signup) · `0003` catalog (`locations`, `employees`, `devices`) · `0004` events/rollups/review snapshots/audit · `0005` billing/`orders` · `0006` **all RLS policies** · `0007` `resolve_scan`, `claim_device`, plan limits, nightly jobs · `0008` dashboard views (`security_invoker`) · `0009` webhook RPCs (`record_webhook_event`, `mark_webhook_processed`) · `0010` adds `profiles.last_login_at`, written by the backend on every login (see below).

### Backend (`backend/server.js`)

Single-file Express app. Uses the Supabase **service_role** key deliberately (not anon) because RLS denies `orders` writes and `resolve_scan`/webhook RPCs to `anon`/`authenticated` by design — only this trusted backend may perform them.

Routes:
- `GET /d/:publicId` — NFC/QR redirect entrypoint. Calls `resolve_scan()` RPC, redirects 302. Always redirects somewhere (falls back to `https://linkstar.com.ar`) even on error — a broken redirect at the physical device is the failure mode to avoid.
- `POST /api/create-preference` — creates a pending `orders` row, then a Mercado Pago preference; `auto_return` is only sent for non-localhost `FRONTEND_URL`.
- `POST /api/webhook/mercadopago` — Mercado Pago IPN. Validates `x-signature` (HMAC-SHA256 manifest, fail-closed if `MP_WEBHOOK_SECRET` unset) **before** anything else, responds `200` immediately (MP requires <22s ack), then processes async. Idempotency is enforced via `record_webhook_event()`'s unique `(provider, topic, external_id)` key — MP retries the same notification and this must not double-process a payment.
- `POST /api/orders/transfer` — creates a pending order for bank-transfer payment (no MP involved).
- `POST /api/process-payment` — direct card payment via MP Payment Brick token; uses an idempotency key (`orderNumber-timestamp`) on the MP create call.
- `GET /api/orders/:orderNumber` — order lookup with `order_items` for the success page.
- `POST /api/auth/login-event` — protected by `middleware/auth.js`'s `requireAuth` (validates the Supabase session JWT from `Authorization: Bearer <token>` via `supabase.auth.getUser(token)`). Called by the frontend right after a `SIGNED_IN` auth event; writes `profiles.last_login_at` with the `service_role` client. This is the only place that column is written — same "client never writes sensitive stuff, trusted backend does" pattern as everything else in this file.

`sendEmailNotification` posts order details to Web3Forms as the order-notification channel (no transactional email service).

### Frontend (`frontend/src`)

- `App.jsx` owns a single `activeSection` state (`landing` | `login` | `register` | `dashboard` | `devices` | `employees` | `locations`) — this is the entire routing mechanism, no router library. `PROTECTED_SECTIONS` (`dashboard`/`devices`/`employees`/`locations`) is gated: if there's no authenticated user, App renders `Login` instead — this is the client-side "middleware" that keeps the dashboard unreachable without an account.
- `context/AuthContext.jsx` wraps `App` (in `main.jsx`) and owns all Supabase Auth state: `user`, `session`, `loading` (true while restoring a persisted session — avoids a login-page flash on refresh), `signIn`, `signUp`, `signOut`. Its `onAuthStateChange` listener is the single place that calls `POST /api/auth/login-event` on `SIGNED_IN` — don't duplicate that call inside `Login`/`Register`.
- `pages/Login/` and `pages/Register/` are the auth screens (Spanish UI, errors translated via `lib/authErrors.js`). Registration itself talks directly to Supabase Auth (`supabase.auth.signUp`) — there is no backend signup route; if the Supabase project has email confirmation enabled, `signUp` won't return a session and the UI shows a "check your email" message instead of navigating in.
- `lib/supabaseClient.js` creates the anon-key client from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; this is the only Supabase client on the frontend (same anon-key-is-public-by-design model documented in `supabase/README.md`).
- `pages/` are section-level screens; `components/` are dashboard widgets composed inside `DashboardView` (in `App.jsx`) — `KpiCards`, `BarChart`, `RecentActivity`, `EmployeeRanking`, `DeviceGrid`, plus `TopBar` for nav (now reads the real user from `useAuth()` for the avatar/name and exposes logout).
- `data/*.js` holds all mock data currently driving the dashboard (`devices.js`, `employees.js`, `locations.js`). When wiring to real data, these are the modules to replace with Supabase queries — there is no existing API/data-fetching layer to extend. Out of scope so far: organization creation/onboarding — a logged-in user without an `organizations`/`memberships` row can reach the dashboard shell, just not any org-scoped data once that part is wired to RLS.
- Not yet built (per `supabase/README.md`, "Lo que falta construir"): the three pieces needing secrets that must live in Supabase Edge Functions or Cloudflare Workers, not the SPA — `redirect` (production version of the `/d/:public_id` flow currently in the Express backend), `mp-webhook`, and `sync-reviews` (daily Google review-count sync job).

## Language note

Code comments, commit messages, and `supabase/README.md` are in Spanish (Argentina) — match that when editing existing files in `backend/` and `supabase/`.
