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
npm run db:reset         # -> supabase db reset (applies 0000 → 0021 in order, locally)
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
  `WEB3FORMS_KEY`, `REDIRECT_DOMAIN` (optional, defaults to `l.linkstarapp.com`).
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
linked device, **reverted by `0022`** · `0016` per-entity daily series views (`v_device_scans_daily`, `v_location_scans_daily`,
`v_employee_scans_daily`) — pure projections of `scan_daily_rollups`, no new capture ·
`0017` corrective: re-applies the two `0013` RPC fixes that never reached Postgres (see below) ·
`0018` `human_scans` / `bot_scans` on the five aggregating `0008` views, so every screen counts the same
thing (see "Scans are human taps" below) · `0019` corrective: `insert into employees` had failed **since
`0003`** (see below) · `0020` team & access (`invite_member()`, `list_org_members()`, `set_member_role()`,
`private.active_org_id()`, and the `max_members` enforcement that never existed — see "Team" below) ·
`0021` corrective: `resolve_scan()`'s dead-end fallback pointed at `linkstar.com.ar`, a domain that was
never registered (the only owned zone is `linkstarapp.com`), so the one URL that exists to guarantee a
scan never dead-ends was sending people to somebody else's domain · `0022` product decision:
`org_is_activated()` stops requiring a linked device on the free plan (see "Subscription gate").

**Everything up to `0020` is applied in production** (`0000`–`0019` pushed 15 Aug 2026, `0020` on
16 Aug after running it locally with `db:reset` and `rls_isolation.sql` green; both verified with
`supabase migration list`). **`0021` and `0022` are written but NOT applied anywhere** — until someone
runs `npm run db:push`, the database still redirects to the unregistered domain and still locks free-plan
accounts out of the panel until they link a device, while the repo and the frontend say otherwise. Applying it needs the Supabase project, which not every developer here
has. Correcting an already-applied migration by editing
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

**The free plan does NOT require a linked device** (`0022`, reverting `0015`). `0015` had made
`org_is_activated()` mean "subscription current *and*, on `free`, at least one device linked", on the
argument that the free plan ships bundled with the hardware. In practice the expositor arrives days after
signup, so the rule locked out precisely the person who had already paid and was waiting for the package —
and telling a buyer apart from a tourist would need a link between the account and the order, which
doesn't exist. `0022` reduces `org_is_activated()` to `org_has_access()`.

The function is **kept, not dropped**: `0014`'s policies and `private.orgs_with_access()` call it by name,
so it stays as the single place to re-add an activation condition. `my_org_context()` still returns
`has_devices` (useful: "is there anything to measure yet?") and `is_activated`, which now equals
`has_access` — the column stays in the contract so the frontend doesn't break. `RequireActivePlan` no
longer has the third redirect to `/alta/expositor`; linking a device is now optional at onboarding and
available later from Devices.

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

### Team — two different things are called "equipo", and mixing them is the trap

`memberships` + `invitations` (`0002`) are **people who log into the dashboard** — owner / admin /
manager / viewer. `employees` (`0003`) are the waiter and the cashier: they never log in, they have no
user, and they exist so a scan can be attributed to someone (`v_employee_leaderboard`). The "Equipo" tab
of Settings renders **both**, members first, and each block says which is which — the word alone is
ambiguous in this product, and the phase 3 work was nearly built against the wrong table because of it.

`0020` is what made members usable. Four things worth not undoing:

- **`max_members` was never enforced.** `enforce_plan_limit()` (`0007`) only has triggers for `locations`
  and `employees`, and its inner `case` doesn't even have a `'members'` branch — hanging a trigger on it
  would pass NULL to `format('%I')` and error. Members get `private.enforce_member_limit()` instead, also
  because `memberships` has no `deleted_at` and the `0007` one filters on that column.
- **The first owner must never be blocked.** `bootstrap_organization()` inserts the owner membership
  *before* the subscription row, so `plan_limit()` finds nothing and returns NULL. The limit function
  treats NULL as unlimited, which covers both enterprise and that ordering. Reorder the bootstrap and
  creating an organization starts failing.
- **Two different counts, on purpose.** The `memberships` trigger counts only memberships, because
  `accept_invitation()` inserts the membership while the invitation is still `pending` — counting pending
  invitations there would make the invitation count itself and the last seat unusable. `invite_member()`
  *does* add pending invitations, so you can't issue ten invites on a two-seat plan. It also expires any
  previous pending invitation for that email **before** the limit check, or re-inviting someone would be
  blocked by their own outstanding invitation.
- **The token is emitted server-side and returned exactly once.** `invite_member()` generates it with
  `gen_random_bytes` and stores only its sha256, which is what `accept_invitation()` compares against.
  There is no way to read it again — losing the link means revoke and re-invite. Don't add a "resend"
  that reads the token back; there is nothing to read.

`private.active_org_id()` extracts the org-selection rule that `my_org_context()` had inline
(`profiles.last_organization_id`, else oldest membership). Three functions now need to answer "which org
is this user operating on" and they must agree — if `invite_member()` picked a different org than the
panel displays, someone would invite people into an account they aren't looking at.

**Invitations travel as a copyable link, not email.** There is no transactional email provider yet (phase
7 brings one, which also needs it for automations); Web3Forms is for notifying *us* of a sale. The owner
copies the link and sends it however they want. When email lands it sends this same link — `AcceptInvitation`
and the RPCs don't change. `PUBLIC_ROUTES.invitation` lives outside both `RequireAuth` and
`RequireActivePlan`: the invitee arrives with no session and no organization, and either guard would
divert them before they could redeem the token. `RegisterRoute` honors `state.from` for the same reason.

**The activity log is real now.** `audit_log` (`0004`) existed from the start but only `claim_device()`
ever wrote to it, so the "Registro de actividad" card was a three-row hardcoded array — with a real
teammate's name and email in it — that phase 2 missed because it was embedded in `Settings.jsx` rather
than being its own screen. `0020` adds `member.invited` and `member.role_changed`. A new account sees
almost nothing there, and that is correct: it means nothing has happened, not that nothing is measured.

### How a scan resolves to a URL (`resolve_scan`, `0007`)

The destination is not a stored column — it is built at scan time from a `coalesce` cascade:

1. `devices.destination_url` — manual per-device override; skips everything below.
2. Otherwise branch on `devices.kind` (`'google_review' | 'instagram' | 'custom'`):
   - `google_review` → `locations.google_review_url`, else built from `locations.google_place_id`
     (`https://search.google.com/local/writereview?placeid=<PLACE_ID>`), else `locations.google_maps_url`.
   - `instagram` → `locations.instagram_url`, else built from `locations.instagram_handle`.
   - `custom` → relies entirely on step 1.
3. `organizations.fallback_url`.
4. Hardcoded `'https://linkstarapp.com'`, so a scan never dead-ends (`0021`; it used to be
   `linkstar.com.ar`, a domain that was never registered — see below).

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
  `https://linkstarapp.com` on any error — a dead redirect at a physical device is the failure mode to
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
- `routes/contact.js` — `POST /api/contact`, 5 per 15 min per IP. Exists for one reason: the ventas
  contact form used to POST to Web3Forms straight from the browser with the access key inlined in the
  bundle, so anyone could read it and flood the inbox. The key now lives in `WEB3FORMS_KEY` server-side.
  Same shape as the checkout: the browser tries the API first and only falls back to the direct call
  while `services/api` has no deploy target.
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
  Two mocks outlived that sweep because they were embedded in `Settings.jsx` and in `AppShell` rather than
  being screens of their own, and were removed on 18 Aug 2026: the "Cuentas de Google conectadas" card
  (a fabricated connected account carrying a real person's name and an address on the unregistered
  domain, plus a "0 de 1 locales activos" counter backed by nothing) and the topbar's invented support
  phone number. Same rule as the rest — no button, since connecting the Business Profile lands in phase 4.
  Note the `google` variant's connect button is itself inert today: no caller passes `onConnect`.
- **The mock JSX is a deliverable, not discarded history — and it does not come back on its own.** The tag
  `maquetas-pre-fase-2` points at the last commit where those ten screens were still drawing their grids,
  tables and charts, and every converted file's header repeats the `git show` line that recovers its own
  screen. Connecting Google flips no switch: the JSX is gone from the working tree, so a connected account
  still renders the placeholder until somebody rewrites the screen against the real data. Budget that
  front-end work into phase 4 alongside the API work. Two consequences that look like dead code and are
  not: `components/PieChart/` (plus `lib/shares.js`) and `lib/chartColors.js` have no importer today
  **only because** the screens that used them — `reports-nps`, `reports-sentiment`, `gb-metrics` — were the
  ones converted. Same for the now-unused CSS in `GoogleBusiness.css`, `Reviews.css`, `Reports.css`,
  `Automations.css` and `MonthlyReports.css`. None of it gets swept in a dead-code pass.
- **Scroll performance: the glass look is expensive, so the cheap frames are load-bearing.** The design is
  glassmorphism — around sixty surfaces carry `backdrop-filter: var(--glass-blur)`, and each one re-blurs
  whatever is behind it. That only stays affordable because the backdrop itself is cheap, which took three
  fixes and each is easy to undo by accident:
  1. The brand background lives on a fixed `body::before` layer, **not** on `background-attachment: fixed`
     over `body`. With `fixed`, the five radial gradients repaint at full viewport size on every scroll
     frame and every blur re-samples that repaint; it was the main reason the panel scrolled in steps.
  2. Nothing animates `backdrop-filter`. `.stat-card` used `transition: all` while its `:hover` raised the
     blur 18px → 24px, so the browser recomputed the blur for the whole transition, per hovered card.
     `--glass-blur-hover` is kept in `index.css` but deliberately unused; the hover reads as glass through
     the `--glass-bg` opacity step, which is a free color transition.
  3. `AuthContext`'s inactivity listeners are `{ passive: true }` and the whole handler is throttled, not
     just its `localStorage` write — `mousemove` and `scroll` fire tens of times a second and the limit
     they guard is 30 minutes.
  Adding a screen is fine; adding one that animates a blur, or moving the background back onto `body`, puts
  the jank back. Note `transition: all` is still all over the rest of the CSS — harmless where nothing
  expensive changes on hover, but it is why rule 2 has to be checked per component.
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
- **Linking an expositor from inside the panel is real since 18 Aug 2026.** `ClaimDeviceModal` in
  `pages/Devices/Devices.jsx` used to set its own success screen without calling anything; it now calls
  `claim_device()` and reloads the list. It matters more than it looks: with `0022` the onboarding step is
  optional, so this modal is the path for everyone whose expositor arrives after signup.
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
- `pages/Settings/TeamMembers.jsx` + `lib/teamApi.js` are the members UI (invite by link, change role,
  remove, revoke a pending invitation); `pages/Settings/ActivityLog.jsx` reads `audit_log`. Both live under
  the "Equipo" tab, above the employees screen. See "Team" under Architecture before changing either — the
  two meanings of "equipo" and the seat-counting rules are the parts that bite.
  `pages/Invitation/AcceptInvitation.jsx` is the redeem screen and is deliberately outside the `/panel`
  guards. It guards its own RPC call with a `useRef` latch: `accept_invitation()` is not usefully
  idempotent (the second call sees the token already `accepted` and reports "inválida o vencida"), and
  StrictMode runs effects twice in development, so without the latch the happy path shows an error.
- Out of scope so far: an org switcher. `my_org_context()` and `private.active_org_id()` (`0020`) *read*
  `profiles.last_organization_id` to pick which organization to show (falling back to the oldest
  membership), but nothing writes it, so a user in several orgs always lands on the same one and has no way
  to change it from the UI. `0020` made this sharper rather than worse: invites and the member list now go
  through the same helper as the panel, so whatever org the switcher eventually sets, all three follow it.

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
- `src/lib/config.js` — `API_URL` and `WEB3FORMS_KEY`. The key is in **one** place on purpose: it is
  public (it ships in the bundle), both forms now send through `services/api` instead, and the constant
  plus the two fallback paths that use it get deleted the day the API is deployed. Until then the only
  extra mitigations are settings in the Web3Forms panel (allowed domains, required captcha), not code.
- The Worker already serves the site with `not_found_handling: "single-page-application"`, so new paths
  work as deep links without touching `wrangler.jsonc`.
- `pages/LinkstarApp/LinkstarApp.jsx` is a **marketing page with a hardcoded mock dashboard**, not the real
  product — every chart/table on it is a static mock array, and "Acceder a LinkstarApp" is a no-op
  (`e.preventDefault()` only) because the real dashboard is `apps/dashboard`, not deployed yet.
- `pages/Shop/Shop.jsx` holds the device prices and the four tiers (1 unidad / 2 unidades / combo Google +
  Instagram / pedido grande) as module constants, and pushes items into `CartContext` with the price
  already resolved. See "Pricing".
- `pages/Checkout/Checkout.jsx` takes orders **without online payment, on purpose**: the buyer confirms,
  we get the notification and we charge them by hand (transfer/link), coordinating payment and shipping
  off-platform. That is the intended sales model for the first months, not a gap — the page says so on
  screen ("Este pedido no incluye pago online"), so don't "fix" it by wiring Mercado Pago back in.
  Since 18 Aug 2026 it **does** persist: it POSTs to `/api/orders/manual`, which writes `orders` +
  `order_items` and sends the notification server-side. Before that the order existed only as an email,
  so a lost email was a lost order.
  It keeps a **fallback path** for exactly one reason: `services/api` has no deploy target yet
  (`apps/ventas/.env.production` still carries the `BACKEND_URL_PENDIENTE` placeholder), so if the API
  doesn't answer the page mails the order straight from the browser as it used to, with the subject
  flagged "SIN REGISTRAR". A `400` is not part of that path — it means the cart didn't match the server
  catalog, and it's shown to the user instead of being mailed around. **When the API is deployed, delete
  the fallback and with it `WEB3FORMS_KEY` from the bundle.**
  The Mercado Pago routes (`create-preference`, `process-payment`) stay dormant, not dead — their
  hardening (server-side price validation via `lib/catalog.js`, `?email=` on the order lookup) is what a
  future online checkout plugs into. Don't touch checkout/payment without confirming which direction is
  wanted.

## Pricing

Two separate things are priced, and they don't live in the same place. All amounts are Argentine pesos.

**Never trim what a plan promises just because it isn't built yet — this question is settled, stop
re-opening it.** The `business` highlights seeded in `0013` cover NPS, sentiment, keywords, automations,
monthly reports and Google Business Profile metrics: whole phases that don't exist. That is deliberate.
Nothing is on sale, nobody has been charged, and there is no customer being misled — the product is being
built step by step and the plan describes where it's going. So when a screen or a bullet names something
that isn't built, the answer is to build it, or to have the screen say plainly that it's pending (see
`components/SectionPlaceholder`) — **not** to delete the line from `plans`, from the landing or from the
plan picker. The only moment to revisit this is right before charging the first real customer.

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
