# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Linkstar sells NFC expositor cards (Google Reviews / Instagram). Buyers also get a free multi-tenant
analytics dashboard ("LinkstarApp") for tracking scans and estimated review growth per location/employee —
**that SaaS dashboard is a separate repo**, not part of this one. This repo is the sales site: marketing
pages, shop/checkout, the NFC scan-redirect backend, and the shared Supabase schema the dashboard repo also
reads from. Three independent subprojects — each with its own `package.json`/config and `.gitignore`,
there is no root-level orchestration:

- `frontend/` — the marketing site + shop. React 19 + Vite, deployed to Cloudflare Workers. Includes a
  `linkstarapp` landing page that markets the SaaS dashboard with a mocked-up preview, but not the
  dashboard itself.
- `backend/` — a small Express API. Currently only load-bearing for the NFC scan redirect; the order
  persistence routes are disabled for now (see Architecture below).
- `supabase/` — the Postgres schema (multi-tenant SaaS: organizations, locations, employees, devices,
  scan events, billing) as ordered migrations, plus its own detailed `supabase/README.md`. This schema is
  shared with the LinkstarApp dashboard repo — changes here have cross-repo impact.

## Commands

Frontend (`cd frontend`):
```bash
npm run dev       # vite dev server on port 5174 (strictPort)
npm run build     # vite build
npm run preview   # preview the production build
npm run deploy    # vite build && wrangler deploy
```
No test runner or lint config is set up in `frontend/`.

Backend (`cd backend`):
```bash
npm run dev       # node --watch server.js
npm start         # node server.js
```
Needs a `backend/.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`, `FRONTEND_URL`
(comma-separated allowed origins). Without `SUPABASE_SERVICE_ROLE_KEY` it still boots but every write
to `orders`/`resolve_scan` will fail under RLS.

Supabase (`cd supabase`):
```bash
supabase db reset   # apply all migrations locally, in order
supabase db push    # apply against the remote project
```
Migrations in `supabase/migrations/` are numbered and must be applied in order — see the table in
`supabase/README.md` for what each one does. `supabase/tests/rls_isolation.sql` checks tenant isolation
and should be run before any production push.

## Architecture

### Frontend is a single-page app without a router
`App.jsx` holds a `page` string in `useState` and conditionally renders whole page components
(`home`/`shop`/`contact`/`checkout`/`linkstarapp`/`legal`/`privacy`/`terms`/`warranty`/`about`) — there's
no `react-router`. Navigation is done by passing `onX` callbacks down through `Navbar`/`Footer`/etc. that
call `setPage` and scroll to top. Cart state is global via `CartContext` (`frontend/src/context/CartContext.jsx`),
independent of the current page, and the `Cart` drawer is always mounted.

`frontend/src/main.ts` and `frontend/src/counter.ts` are unused leftovers from the original `vite --template
ts` scaffold — the real entry point is `frontend/src/main.jsx` (wired in `index.html`). Don't extend
`main.ts`; it isn't loaded by anything.

`LinkstarApp.jsx` (the `linkstarapp` page) is a **marketing page with a hardcoded mock dashboard**, not the
real product. All charts/tables/rankings on it use static mock arrays (`chartDataMock`, `topDevicesMock`,
etc.) and the "Acceder a LinkstarApp" button is a no-op (`e.preventDefault()` only) — it's not wired up
because the actual authenticated dashboard lives in a different repo entirely, not in this one.

### The backend is only half-wired to the frontend
- `GET /d/:publicId` is the live, load-bearing route: it's what a physical NFC tap/QR resolves to. It
  calls the `resolve_scan` Postgres RPC (SECURITY DEFINER, service_role only — see
  `supabase/migrations/0007_functions_and_jobs.sql`) and always redirects somewhere, falling back to
  `https://linkstar.com.ar` on any error so a bad tap never dead-ends the visitor.
- `POST /api/orders` / `GET /api/orders/:orderNumber` are **disabled on purpose** (removed from
  `server.js`, not just unused) — the frontend checkout doesn't call them, and real checkout/payment
  (Mercado Pago) is being rebuilt separately with a collaborator, not by Claude. `Checkout.jsx` currently
  generates its own order number client-side and only sends a notification email via Web3Forms directly
  from the browser — see the comment at the top of `frontend/src/pages/Checkout/Checkout.jsx`. Before
  reactivating the order routes: validate item price/qty server-side against the real catalog (the old
  implementation trusted `req.body.price` as-is) and require auth on the order-lookup route (it used to
  return buyer name/email/phone/address to anyone who guessed an order number). If asked to "fix" or
  extend checkout, check first whether the intent is to reconnect it to the backend/payment gateway or to
  keep the current email-only flow — don't touch checkout/payment without confirming, since that work is
  explicitly being done elsewhere.
- The backend uses the Supabase **service_role** key on purpose (not anon), because
  `supabase/migrations/0006_rls.sql` intentionally denies `anon`/`authenticated` from writing `orders` or
  executing `resolve_scan` — only a trusted server may do either.

### Supabase schema — read `supabase/README.md` before touching migrations
It documents the full ER diagram and, importantly, "the six decisions that matter" — non-obvious
constraints baked into the schema that are easy to accidentally undo:
1. The tenant is the **organization**, not the individual location.
2. `scan_events` stores attribution as a snapshot (copies `location_id`/`employee_id`/`kind` at scan time)
   — never derive attribution via JOIN, or reassigning a device rewrites history.
3. The dashboard must read from `scan_daily_rollups`, never directly from `scan_events`.
4. `resolve_scan` must never be granted to `anon` (it's public-key-reachable from the SPA bundle).
5. Devices are provisioned with `status = 'unassigned'` and claimed via `claim_device()` — never give
   `devices` a client-facing INSERT policy.
6. Every view must have `security_invoker = on`, or it silently bypasses RLS on its underlying tables.

Review counts are estimates by design (Google gives no webhook for new reviews) — real signal is a daily
`location_review_snapshots` count per location via the Google Business Profile/Places API, diffed into
`review_deltas`. Anything below location granularity (per-employee, per-device) is a prorated estimate;
keep it labeled as such in any UI copy.

Three pieces referenced by the schema/README are not yet implemented as actual services (they'd need to be
Supabase Edge Functions or Cloudflare Workers with secrets, since the frontend is a static SPA): the
`redirect` function, an `mp-webhook` (Mercado Pago) handler, and a `sync-reviews` daily job. The current
`backend/server.js` `/d/:publicId` route covers the redirect piece for now; the other two don't exist yet.

## Deployment

- The `linkstarapp.com` domain/zone is owned in Cloudflare (not just used as a Workers route target).
- Frontend deploys to Cloudflare Workers via `wrangler` (`frontend/wrangler.jsonc`), routed at
  `linkstarapp.com/*`, serving `./dist` as a single-page app.
- Backend deploys to Railway or Render (plain Node/Express host, not a Cloudflare Worker), planned at
  `api.linkstarapp.com`. `frontend/.env.production`'s `VITE_API_URL` is still a placeholder
  (`BACKEND_URL_PENDIENTE`) until that's live — update it and `backend/.env`'s `FRONTEND_URL` together
  when deploying. Because the backend isn't behind Cloudflare, request-level protections (rate limiting,
  security headers) are handled in `server.js` itself (`express-rate-limit`, `helmet`), not at the edge.
