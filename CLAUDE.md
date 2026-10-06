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

**Status: pre-launch.** Nothing is sold yet. Deployed: the schema, the sales site, and — since 6 Oct
2026 — the dashboard at `app.linkstarapp.com` (published ahead of the API for Google's OAuth verification,
see "Deployment"). There are no real
tenants, so the schema and the API can still change shape without a migration story for production data —
but the invariants under "Data model" are the part that gets expensive to undo *after* launch, so they
hold now too. Concretely: `services/api` has no deploy target, so the deployed panel shows "el servicio no
está disponible" for every API-backed action and offers Business as "Contactar con ventas"; checkout is
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
| `apps/dashboard`    | `@linkstar/dashboard` | The SaaS dashboard + its own landing page. React 19 + Vite, deployed to Cloudflare Workers at `app.linkstarapp.com` (API not deployed yet). |
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
npm run db:reset         # -> supabase db reset (applies 0000 → 0027 in order, locally)
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
(`provision-devices.js`, `rebuild-today-rollup.js`, `send-alerts.js` and `sync-reviews.js` also have npm
aliases — `npm run provision-devices`, `npm run rebuild-today-rollup`, `npm run send-alerts`,
`npm run sync-reviews`; `seed-test-device.js` doesn't; `npm run daily` runs `sync-reviews` then `send-alerts` and is what the deployed cron calls). They use the same `service_role` client as
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
  `PORT`, `FRONTEND_URL`, `DASHBOARD_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `WEBHOOK_URL` (base URL
  only, no path), `WEB3FORMS_KEY`, `REDIRECT_DOMAIN` (optional, defaults to `l.linkstarapp.com`),
  `RESEND_API_KEY` / `RESEND_FROM` (optional; without the key every mail is simulated on the console),
  `SALES_NOTIFY_EMAIL` (our inbox for new-order and contact notices; with it and the Resend key those go
  through Resend, otherwise through Web3Forms — see `lib/email.js`), and the four Google
  ones — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENC_KEY` — which
  are optional as a group: without all four the Google routes answer 503 and everything else works.
  `GOOGLE_REDIRECT_URI` must match the console entry byte for byte, port included; locally that is
  `PORT` (3001), and `lib/googleOAuth.js` warns at boot if they differ. Losing `GOOGLE_TOKEN_ENC_KEY`
  makes every stored refresh token unreadable — every customer has to reconnect.
  `DASHBOARD_URL` is optional too (defaults to the *second* entry of `FRONTEND_URL`) and is where the
  subscription returns from Mercado Pago — it cannot be `FRONTEND_URL`, which points at the sales site.
  `FRONTEND_URL` is **comma-separated**: this one service serves both frontends, so CORS needs both
  origins. The first entry is the one used for Mercado Pago `back_urls`, so it must be the ventas site
  (that's where checkout lives). Missing `SUPABASE_SERVICE_ROLE_KEY` prints a warning
  and then **crashes at boot** — current `@supabase/supabase-js` throws `supabaseKey is required` from
  `createClient` (seen on the first Railway deploy, 6 Oct 2026); older versions only warned and failed
  later through RLS.
- `apps/dashboard/.env` — see `apps/dashboard/.env.example`. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL`, `VITE_REDIRECT_DOMAIN` (optional, same default as the API's `REDIRECT_DOMAIN` — the two
  apps deploy separately, so each defines it on its own; they must agree or the QR the dashboard generates
  points somewhere the API doesn't serve), and `VITE_BUSINESS_CHECKOUT` (optional; `off` turns the Business
  plan's checkout button into "Contactar con ventas" — `effectiveCheckoutMode()` in `lib/config.js`; price
  and highlight still show).
- `apps/dashboard/.env.production` — what `npm run build:dashboard` bakes into the deployed panel. Tracked
  in git like ventas' (public values only: Supabase URL + anon/publishable key, `VITE_API_URL`,
  `VITE_REDIRECT_DOMAIN`, `VITE_BUSINESS_CHECKOUT=off` until the API is deployed). It overrides **every**
  key of the developer's `.env`; a variable added to `.env` but not here leaks its dev value into the
  production bundle.
- `apps/ventas/.env.production` — `VITE_API_URL=https://api.linkstarapp.com` since 6 Oct 2026 (it was the
  `BACKEND_URL_PENDIENTE` placeholder until the API went live on Railway). Tracked in git on purpose (`.gitignore` whitelists `.env.production`); it holds no
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
`org_is_activated()` stops requiring a linked device on the free plan (see "Subscription gate") ·
`0023` notification preferences + send log, and `pending_notifications()` — the half of phase 7 that
doesn't need Google (see "Alerts" below) · `0024` Google Business Profile: OAuth connection, encrypted
refresh token, `google_locations` / `google_reviews`, and the RPCs `sync-reviews` writes through (see
"Google Business Profile" below) · `0025` reviews only for fichas linked to a live sucursal, plus the
prune that enforces it (same section) · `0026` replying to reviews: `google_review_reply_target()` (who may
reply to what) and `google_record_reply()` · `0027` org switcher: `list_my_organizations()`,
`set_active_organization()`, and `accept_invitation()` now also makes the accepted org the active one
(see "Org switcher" under `apps/dashboard`).

**`0027` is written but NOT applied in production** (6 Oct 2026). It went through the push simulation
described below and `rls_isolation.sql` locally (96 green, sections 11 and 12 new). Until
`npm run db:push`, the deployed panel simply shows no org selector — `OrgContext` treats a failing
`list_my_organizations()` as an empty list — and everything else works.

**Everything up to `0026` is applied in production** (`0000`–`0019` pushed 15 Aug 2026, `0020` on
16 Aug, `0021`–`0025` on 5 Oct 2026, `0026` by 6 Oct 2026 — local and remote matched on `npm run db:status`
that day). `0026` went through the push simulation described below and `rls_isolation.sql` (84 green)
before shipping. The 5 Oct push went in two
attempts: the first stopped at `0023` on the `citext` problem described below, after `0021` and `0022`
had already applied. All of `0021`–`0024` went through `db:reset` + `rls_isolation.sql` green locally
first — that run is also what found section 6 of the test still asserting the `0015` rule that `0022`
reverted, now fixed.

**A green `db:reset` does not prove `db:push` will pass — schema-qualify extension types.** The
current Supabase CLI pushes through a temporary login role ("Initialising login role…") whose
`search_path` does not include `extensions`, while the local reset runs as `postgres`, whose does. So a
bare `citext` (or anything else from `0001`'s extensions) applies locally and fails remotely with
`type "citext" does not exist` — exactly what stopped `0023`, which was fixed in place (`extensions.citext`)
because it had never applied anywhere. Migrations up to `0020` use bare `citext` and are fine only because
they were pushed in August with an older CLI. To reproduce the remote condition locally, reset to the
previous version (`supabase db reset --version <n>`) and feed the new file through psql with
`set search_path = "$user", public;` prepended. Note the session `search_path` also decides whether a
`citext = 'literal'` comparison is case-insensitive — PostgREST includes `extensions`, so the API is fine. Applying it needs the Supabase project, which not every developer here
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

**`notification_url` is NOT honored per preapproval.** `POST /preapproval` accepts the field and answers
200, but doesn't store it (the response doesn't echo it back) — verified against the live API, see the
comment in `lib/subscriptions.js`. So subscription webhooks go **only** to the URL configured in the MP
panel (`https://api.linkstarapp.com/api/webhook/mercadopago` in production); in development, every new
tunnel URL means updating the panel. `WEBHOOK_URL` is still used, but only for hardware-order
preferences (`routes/orders.js`), and it is the **base** URL — the route appends
`/api/webhook/mercadopago` itself.

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

**The copyable link is still the primary path; email is an extra on top.** `invite_member()` issues the
token, the screen shows the link, and `POST /api/team/send-invitation` can additionally mail *that same
link* — `AcceptInvitation` and the RPCs did not change. Keep that order: if the mail fails, or the server
has no `RESEND_API_KEY` and `lib/mailer.js` returns `simulated: true`, the inviter is not blocked, and the
screen says so rather than claiming it sent. The endpoint takes the **token**, not a URL, and builds the
link from `DASHBOARD_URL` itself — accepting a URL would turn it into an open relay that mails arbitrary
links under our branding. `PUBLIC_ROUTES.invitation` lives outside both `RequireAuth` and
`RequireActivePlan`: the invitee arrives with no session and no organization, and either guard would
divert them before they could redeem the token. `RegisterRoute` honors `state.from` for the same reason.

**Alerts — the half of phase 7 that doesn't need Google** (`0023`). Two alerts run purely off scans:
`device_idle` (an active expositor with no taps for N hours, default 48, configurable per org because a
bar and an events venue don't have the same normal) and `weekly_summary`. All the "what to send" logic
lives in `private.pending_notifications()`, and `scripts/send-alerts.js` only renders and sends it — same
split as `rebuild-today-rollup.js`, so phase 8 can schedule the function under `pg_cron` without rewriting
anything. Run it with `npm run send-alerts` (`--dry-run` prints what it would send).
Three things that are load-bearing and easy to undo:
- **`notification_log` is what makes it idempotent.** A device that has been quiet for a week satisfies
  the condition on every run; the log is what answers "did I already say this?". It is written *after*
  the provider accepts, so a failed send retries next run instead of vanishing.
- **A simulated send is not a send.** With no `RESEND_API_KEY` the mailer prints to console and returns
  `simulated: true`; the script deliberately does **not** log those, or the real alert would never go out.
- **Missing preferences mean defaults, not silence.** The function `left join`s `notification_preferences`;
  an inner join would mean a new account never receives anything until someone opens Settings.

The settings screen is **Automatizaciones** (`pages/Automations/`, real since 6 Oct 2026, over
`lib/notificationsApi.js`): the two switches, the idle-hours threshold and the recipient upsert
`notification_preferences` straight through PostgREST, and "Últimos avisos enviados" reads
`notification_log`. Both alerts are for **every plan** — a product decision, not an oversight; what the
Business plan adds there are the AI/review automations, which render as "En desarrollo" cards with **no
switch**, because a switch nothing executes is the exact thing that screen used to be. Owner/admin only:
for a manager or viewer the RLS returns no row, which is indistinguishable from "never saved", so the
screen shows a notice instead of the defaults — don't "simplify" that into rendering the form.
`DEFAULT_PREFERENCES` in `notificationsApi.js` mirrors the `coalesce` defaults of
`pending_notifications()`; change one, change both.
`lib/mailer.js` (Resend, customer-facing) is not `lib/email.js` (notifies *us* of an order or a contact
message) — Web3Forms forwards a form to one fixed mailbox and can't do variable recipients, which is why
phase 3 shipped the copyable link in the first place. `send()` is the only function that knows about
Resend. **`lib/email.js` sends through `send()` when `SALES_NOTIFY_EMAIL` and `RESEND_API_KEY` are both
set, and falls back to Web3Forms otherwise** (Oct 2026): Web3Forms' free plan rejects server-to-server
submissions — the same reason ventas' browser fallback mails from the browser — so on a deployed API the
Web3Forms path would fail on every notice. `sendEmailNotification` never throws (the order is already
saved); it returns whether the notice went out, which is what `/api/orders/manual` reports as
`email_sent`.

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
- `lib/email.js` — `sendEmailNotification` / `sendContactMessage`, notices to our inbox: Resend when
  `SALES_NOTIFY_EMAIL` is set, Web3Forms otherwise (see "Alerts" above).
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
  for non-localhost `FRONTEND_URL`), `POST /api/orders/manual` (the no-online-payment order the ventas
  checkout actually uses), `POST /api/orders/transfer`, `POST /api/process-payment`,
  `GET /api/orders/:orderNumber`. Only `/api/orders/manual` is reachable from a browser today — the rest
  are dormant because `apps/ventas` checkout has no online payment (see below) — but the hardening is
  already in place and must not be undone when it reconnects:
  - The four POSTs run `validateBody(...)` then `assertCatalogPrices(...)`, and `/api/process-payment`
    additionally runs `assertMatchesCatalogTotal(...)` and rejects a body with no `cartItems` rather than
    charging a client-supplied `transaction_amount` blind.
  - **`assertCatalogPrices` validates packs, not discounted units.** The "2 unidades" tier used to push
    two loose items at the discounted unit price, so a single unit at that price was indistinguishable
    from half a promo and the `−` button in the cart bought one expositor for $32.800 instead of $41.000.
    Per-item validation could not catch it (two units of different colours are two lines of `qty: 1`), so
    the tier became a bundle like the combo: loose items are only ever valid at `UNIT_PRICE`, and the three
    bundle ids carry a fixed price and `qty: 1`. Reintroducing a per-unit discount reopens the hole.
  - **In `/api/orders/manual` the email is sent inside its own `try`, after the order is persisted.** If a
    mail failure returned 500 the browser would fall back to mailing the order itself, with a *different*
    order number and a "SIN REGISTRAR" subject — leaving a saved order under one number and an alert under
    another saying it was never saved.
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
- `routes/subscriptions.js` — `POST /api/subscriptions/checkout`, `POST /api/subscriptions/cancel` and
  `POST /api/subscriptions/sync` (asks MP how the preapproval ended and applies it; it is what the
  "Volver a consultar" button of `PlanResult` calls, so a webhook that never arrived doesn't leave a
  paying customer stuck in the waiting room forever),
  all behind `requireAuth` and all owner/admin only (checked by hand against `memberships`, because the
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
- `routes/google.js` — `POST /api/google/oauth/start`, `GET /auth/google/callback` (note: no `/api`
  prefix — it is the URI registered in the Google console), `POST /api/google/disconnect`,
  `POST /api/google/sync` ("Actualizar ahora": 202 + background sync, one at a time per org in this
  process, 5 / 15 min) and `POST /api/google/reviews/:id/reply` (30 / 15 min). See below.

### Google Business Profile — OAuth connection and `sync-reviews` (`0024`)

Reading reviews needs OAuth on behalf of someone who manages the ficha; there is no API key path. One
connection per organization, owner/admin only, resolved with the same active-org rule as the panel
(`0024` extracts `private.active_org_id_for(user)` and makes `active_org_id()` call it — the API runs as
`service_role` and has no `auth.uid()`, and connecting Google to a different org than the one on screen is
the failure this prevents).

- **The flow.** The panel `fetch`es `POST /api/google/oauth/start` with its Bearer JWT and
  `credentials: 'include'`, gets `{ url }`, and navigates there itself — a browser navigation can't carry
  the JWT. Google returns to `/auth/google/callback`, which exchanges the code and redirects to
  `DASHBOARD_URL/panel/resenas?google=<conectado|cancelado|sin_permiso|sin_rol|error_estado|error>`. The
  callback never renders an error itself. On the panel side, `lib/googleApi.js` (calls +
  `useGoogleConnection`) and `components/GoogleConnect/` (button, status, return message, disconnect)
  are used by `GoogleGate` (the modal over the seven Google sections), `SectionPlaceholder`'s
  `google` variant and the two connect banners (Devices, Company), which hide once the ficha is connected.
  The return lands on `/panel/resenas` because that page always renders a `GoogleGate` — move `RETURN_PATH` in `routes/google.js` and the `?google=` message has
  nowhere to show.
- **The state is double-bound, and the cookie is the part that matters.** A row in
  `private.google_oauth_states` (sha256, single-use via an atomic `update … where used_at is null`,
  10 min) is not enough on its own: the attacker's state exists too, and the OAuth login-CSRF is exactly
  "victim completes the attacker's flow", which would connect the victim's ficha to the attacker's org —
  with `business.manage`, that includes replying to their reviews. The callback also requires the state to
  equal an HttpOnly `SameSite=Lax` cookie set by `/start`. That cookie is set from a cross-origin fetch,
  which only works because panel and API are the same *site* and CORS has `credentials: true`
  (`server.js`). Put the API on a different registrable domain from the panel and the flow breaks.
  PKCE (S256) sits on top; the verifier lives in the state row and never leaves the server.
- **The refresh token is encrypted in the app, not in the DB** (`lib/tokenCrypto.js`, AES-256-GCM,
  `GOOGLE_TOKEN_ENC_KEY`), with the organization id as AAD so a ciphertext copied to another org's row
  doesn't decrypt. It lives in `private.google_oauth_tokens` — unreachable through PostgREST, RLS forced
  with no policies — and only `service_role` RPCs touch it. `public.google_connections` holds the status
  the panel can show, no secrets.
- **`invalid_grant` → `needs_reauth`, and in Testing mode that happens every 7 days.** Google expires
  refresh tokens of apps whose consent screen is in "Testing" after a week. `sync-reviews` marks the
  connection and stops retrying it until someone reconnects; it is expected, not a bug, until the app is
  published (which for `business.manage` means Google's verification).
- **`sync-reviews`** (`lib/reviewSync.js`, run by `scripts/sync-reviews.js` and once in the background
  after each successful connect): Account Management → Business Information (`readMask` is mandatory) →
  `google_locations`; auto-link ficha → sucursal **only by `place_id`**; My Business v4 reviews, newest
  `updateTime` first, paging until it crosses the newest stored one; then
  `record_google_review_snapshot()` and `compute_review_deltas(today)`.
  `link_google_location()` is the manual mapping, callable by owner/admin, from the "Fichas de Google"
  card in Configuración → Gestión local (`pages/Settings/GoogleFichas.jsx`), which also hosts
  connect/disconnect and "Actualizar ahora". Every link change asks the API for a sync so the newly linked
  ficha's reviews show up without waiting for the daily job; if the API doesn't answer, the link is saved
  anyway and read on the next run.
- **Replying publishes on the customer's public Google profile, so authorization lives in SQL** (`0026`):
  `google_review_reply_target(user, review)` allows owner/admin for the whole org, a manager only for
  branches in their `membership_locations`, never a viewer, and never a review of an unlinked ficha. The
  route PUTs to Google first and records with `google_record_reply()` only after Google accepts, storing
  Google's `updateTime` — the panel shows what is published, not the draft. If the record step fails the
  reply is still live and the next sync brings it back. `lib/googleBusiness.js`' `googleRequest()` serves
  both the GETs and this PUT; inside it the error-response body is `errorBody` on purpose — naming it
  `body` shadows the request-body parameter in the same block and made every request throw
  "Cannot access 'body' before initialization" (caught in testing on 6 Oct 2026, never shipped).
- **Reviews are read only for fichas linked to a live sucursal** (`0025`). The Google user who connects can
  manage fichas that aren't this organization's — the first real test hit exactly that, a client's ficha
  in the same Google account — and storing third parties' reviews (author name, text) because they
  happened to be visible is not acceptable. An unlinked ficha keeps title, address and `place_id`, enough
  to offer it when linking, and nothing else; `google_prune_unlinked_reviews()` deletes the reviews of a
  ficha the moment it stops being linked (called by the sync before reading and by `link_google_location()`
  after every change). "Live" matters: sucursal deletes are logical, so `0024`'s `on delete set null`
  never fires — the prune also unlinks fichas whose sucursal has `deleted_at`, and
  `record_google_review_snapshot()` refuses them. `--dry-run` predicts the links from existing rows and
  `locations.google_place_id`, so it tells you which fichas *would* be read before anything is written.
- Disconnecting revokes at Google (best-effort) and deletes the connection; fichas and reviews cascade,
  `location_review_snapshots` stays — it is our aggregate and the delta series depends on it.

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
  `automations`, `settings`, `contact`, `profile`. Pages and `Sidebar` still speak in those **section ids**; the
  id → path translation happens in `App.jsx` and `AppShell.jsx`, so no page imports the router. Adding a
  section means touching three files: `SECTION_PATHS` in `lib/routes.js`, the `<Route>` in `App.jsx`, and
  the item in `Sidebar.jsx`.
- **Contact** (Oct 2026): `components/ContactForm` is the ventas contact form (same fields, validation
  and copy) posting to `POST /api/contact` through `lib/contactApi.js`. It renders in two places: the
  public landing (`#contact`, linked from the navbar and the footer, for people without an account) and
  `/panel/contacto` (`pages/Contact`), reached from the sidebar and from the topbar's "¿Necesitás ayuda?
  Escribinos", which used to be a `mailto`. Inside the panel the form is prefilled from the session and
  appends a `— Enviado desde el panel · Organización: … (id) · Plan: …` line to the message, so a support
  request arrives knowing which account it's about; the screen says so. Unlike ventas there is **no**
  browser-side Web3Forms fallback — the panel never shipped that key and must not start; if the API
  doesn't answer, the form shows the support address instead.
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
  `subscription_payments`), and `automations` (`notification_preferences` / `notification_log`, see
  "Alerts"). `profile` reads the logged-in user from `AuthContext`.
  The sections with no data source do **not** print numbers: the two that depend on us (`reports-nps`,
  `monthly-reports`) render `components/SectionPlaceholder`, and the seven that depend on
  the customer's Google profile render their old mock behind `components/GoogleGate` (see below). The rule
  that replaced the hardcoded arrays: a page with no data source says so; it never prints a number that
  can't be distinguished from a measured one. The placeholder has two variants and picking the wrong one
  misleads:
  `google` for what the *customer* can unblock by connecting their Business Profile (it carries the connect
  button), `soon` for what *we* haven't built — NPS, monthly reports — which gets no button,
  because a button that resolves nothing is worse than none. Each converted file keeps a header comment
  saying what it used to fake and which roadmap phase feeds it. Since `GoogleGate` landed, `variant="google"`
  has exactly one caller left — the one on `company` — so changing that variant barely moves anything; the
  copy that used to live in the other seven (`description`, `preview`, `note`) moved into the gate's modal.
  Two mocks outlived that sweep because they were embedded in `Settings.jsx` and in `AppShell` rather than
  being screens of their own, and were removed on 18 Aug 2026: the "Cuentas de Google conectadas" card
  (a fabricated connected account carrying a real person's name and an address on the unregistered
  domain, plus a "0 de 1 locales activos" counter backed by nothing) and the topbar's invented support
  phone number. Same rule as the rest — no button, since connecting the Business Profile lands in phase 4.
  Since 5 Oct 2026 the connect button is real in all four places — the `google` variant of
  `SectionPlaceholder`, `GoogleGate`, `GoogleConnectBanner` and the Company banner — all rendering
  `components/GoogleConnect` over `useGoogleConnection()` (`lib/googleApi.js`).
- **`components/GoogleGate` is the only place a mock is allowed to render, and that is what makes it
  legal.** The seven sections that depend on the customer's Google profile — `reviews`, the four `gb-*`,
  `reports-sentiment`, `reports-keywords` — show their pre-phase-2 mock *as the background* of a modal that
  invites you to connect: blurred, `inert` (no clicks, no tab stops, no text selection, no screen reader),
  and with no way to close the modal and no `Escape`. The page file is a thin wrapper that passes copy to
  the gate; the recovered JSX lives next to it in a `*Mockup.jsx`, with `data/reviews.js` back for the
  three that read it. The blur is **deliberately light** (`filter: blur(3px)`) — the mock is there so the
  customer sees what the section is for, so parts of it are legible. What keeps the invented numbers on the
  right side of "never print a number that can't be distinguished from a measured one" is therefore the
  whole set of conditions, not illegibility: a `*Mockup.jsx` rendered outside the gate, or a gate that can
  be dismissed, breaks the rule. Three mechanics that are not decorative:
  **(a)** the section scrolls normally (the mock runs past behind) but the modal does not — it is
  `position: fixed` over the content area, offset by the sidebar width (264px, 88px under 1024, 0 under
  640, where the topbar also grows 44px → 52px), because the sidebar must stay visible and clickable as the
  only way out; **(b)** the modal never scrolls inside and is never cut: it has no `max-height`, its layer
  is `overflow: hidden` (with `auto`, one pixel of overflow turned the layer into a scroller and the wheel
  moved the modal instead of the page behind it), and a ladder of `max-height` media queries drops the
  modal's optional parts — small print, then the description, then the review skeleton — so it fits short
  windows instead of overflowing; **(c)** the blur is `filter` on the mock, **not**
  `backdrop-filter` on a veil over it: the section scrolls, and a backdrop-filter would re-blur the mock's
  ~20 glass cards every frame (rule 2 below). `SubscriptionBanner` is hidden on these sections
  (`GOOGLE_GATED_SECTIONS` in `lib/routes.js`, read by `AppShell`) — behind the modal it is unreachable and
  only steals height. That list stays fixed even though `google_connections` now records the connection:
  **a connected account still gets the gate on the six sections whose real screen doesn't exist yet**,
  because their mock is still invented. Connected, the modal swaps its description for "ya leemos tu
  ficha, la pantalla es lo pendiente" and shows status + "Desconectar" instead of the button; it is never
  dismissed. This was asked for as the MyTapStar pattern, so match that screen if it's ever redesigned.
  **`reviews` is the first section out of the gate (6 Oct 2026):** `pages/Reviews/Reviews.jsx` renders
  `ReviewsScreen` (real, over `google_reviews` / `google_locations`) when the connection is `active` or
  `needs_reauth`, and the gate + `ReviewsMockup` otherwise — the mock stays as the invitation for accounts
  that haven't connected. Its filters are by **stars** (4–5 / 3 / 1–2 / unanswered), not sentiment, which
  is phase 5; the header counts mix two sources on purpose (Google's per-ficha total and average vs. the
  answered/unanswered split of the rows actually read). `reviews` stays in `GOOGLE_GATED_SECTIONS`, so
  the subscription banner is also hidden there when connected — accepted to keep `AppShell` from querying
  Google on every section. Each of the other six follows the same recipe when its data exists.
- **The mock JSX is a deliverable, not discarded history.** The tag `maquetas-pre-fase-2` points at the last
  commit where those ten screens were still drawing their grids, tables and charts; seven of them now live
  in the tree as `*Mockup.jsx`, the two "próximamente" ones (`reports-nps`, `monthly-reports`) are still
  only in the tag, and `automations` was rewritten against `0023` (its old mock stays in the tag too), each
  with the `git show` line in its header. Connecting
  Google flips no switch either way: the mock is a *drawing*, not a screen wired to data, so a connected
  account does not get a working section — somebody has to rewrite each one against the real data and
  delete the `*Mockup.jsx`. Budget that front-end work into phase 4 alongside the API work. What looks like
  dead code and is not: the now-unused CSS in `Automations.css` and `MonthlyReports.css` (the design target
  for when the data arrives), and `components/DateField/`, a working date picker with no caller yet — the
  date-range filters of the reports screens are what it was built for. Neither gets swept in a dead-code
  pass. (`components/PieChart/`, `lib/shares.js` and `lib/chartColors.js` used to be on this list; the
  recovered mocks import them again.)
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
- **Every read takes the active `organizationId` and filters by it** — the fetchers of `dashboardApi.js`,
  `catalogApi.js` and `googleApi.js`, through `requireOrg()`, which throws without one. RLS is the
  *security* boundary and lets a user read **all** their orgs; before `0027` a member of two saw the union
  of both on every screen, duplicated days in `v_scans_daily`, and `fetchDashboardKpis()`' unordered
  `.limit(1)` picked either org's KPIs. A new fetcher that skips the filter reintroduces exactly that.
  Pages pass `org.organization_id` and bail out of their load effect while it is undefined — several of
  them fall back to a mock when a query throws, so calling without it would *render the mock*.
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
  backing in the views render `'—'` instead of being fabricated. All three distinguish **two**
  empty states, and the distinction is `hasAny` (computed over the unfiltered list, not the filtered one):
  "you haven't linked an expositor / loaded a branch yet" carries an instruction and a CTA, while "the
  filter matched nothing" offers to clear the filter. Telling a day-one account that nothing matched a
  search it never ran is what this replaced.
- **`lib/catalogApi.js` is the only module that writes the catalog** — `locations`, `employees` and
  `devices`. It is the counterpart of `lib/dashboardApi.js`, which reads only views, and it goes straight
  through PostgREST rather than RPC because `0014` rewrote those three tables' policies precisely so the
  logged-in client can write them (`teamApi.js` needs RPC only because the email lives in `auth.users`).
  Three things in it that look like details and are not: `createLocation` / `createEmployee` deliberately
  skip `.select()`, because the RETURNING would be evaluated against `locations_select`, whose
  `visible_location_ids()` is `stable` and cannot see the row being inserted — the insert succeeds and the
  client reads "no rows", which looks like a failure and invites a retry that duplicates the branch; the
  UPDATEs do use `.select()`, where the row already exists in the snapshot. Deletes are logical
  (`deleted_at`), never physical, or `devices.location_id`'s `on delete set null` would orphan the
  expositores silently. And `catalogErrorMessage()` branches on `hint`/`code`, never on the message text.
- **Devices writes, and the status enum is wider than the UI.** Editing a device
  and activating/pausing it used to mutate `useState` and nothing else, so every change vanished on
  reload. The panel shows two states, Activo/Inactivo, while `device_status` has five
  (`unassigned | active | paused | lost | retired`): pausing writes `'paused'`, because `'inactive'` does
  not exist in the enum — writing it fails with `22P02`, and it is an easy mistake because the UI's own
  label *is* "Inactivo". The enum is not shrunk to match the UI — `unassigned` is what provisioning
  writes before anyone claims a device, and `org_is_activated()` / `has_devices` filter on
  `status <> 'retired'`. The edit modal also assigns the **employee**, and both Edit and Activar/Desactivar
  are hidden for anyone outside owner/admin/manager (`devices_update`): offering a button the database will
  reject is worse than not showing it.
- **The per-device destination is real.** `devices.destination_url` is step 1 of the `resolve_scan()`
  cascade and now has a field in the edit modal. Empty must be stored as `null`, never `''`: the cascade
  is a `coalesce` and an empty string would count as a valid destination and send the scan nowhere.
- **Employees is marked "Próximamente", and the screen was deliberately NOT replaced by a placeholder.**
  Attributing a scan to a person needs personal cards; an expositor sits on a table and belongs to nobody.
  Cards aren't sold yet, so `v_employee_leaderboard` will stay empty — but the screen reads it for real,
  so it keeps its markup and only carries a notice above it (in `Settings.jsx`'s "Equipo" tab, plus the
  badge on the Devices teaser). When cards exist, delete the notice and it works.
- **OPEN: the card-vs-expositor rule is written down but not enforced, and the UI now contradicts it.**
  The rule is that an employee is attributable through a **personal card** — an expositor sits on a table
  and belongs to nobody. The schema already supports it: `device_form` (`0001`) is
  `nfc_stand | nfc_sticker | nfc_card | qr_stand | qr_sticker`, `devices.form_factor` defaults to
  `'nfc_stand'`, and `v_device_performance` has exposed the column since `0008` (kept by `0018`).
  **Nothing in `apps/dashboard` or `services/api` reads it — not one line.** So the device edit modal
  offers the "Empleado" dropdown for every device, a table stand included, and since `scan_events`
  snapshots `employee_id` at scan time (invariant 1), assigning a waiter to a stand credits them in
  `v_employee_leaderboard` with reviews the table earned. Two pieces of copy still state the old rule
  while the screens do the opposite: `Settings.jsx` ("la atribución por empleado llega con las tarjetas
  personales") and the day-one empty state of `Employees.jsx` ("todavía no se pueden crear"), which sits
  two lines from the "Nuevo empleado" button. Deciding this needs both of the people on the project:
  either gate the dropdown on `form_factor = 'nfc_card'` and fix the copy, or drop the rule and say so
  here. Do not let it sit as is — it is the kind of contradiction that gets resolved by accident.
- **Locations are loaded by hand, and that is no longer provisional.** `LocationForm.jsx` creates *and*
  edits a branch through `locations_insert`/`locations_update` of `0014` and `enforce_plan_limit()` of
  `0007`. It used to be a dev-only modal behind `VITE_ENABLE_MANUAL_LOCATION`, because branches were
  supposed to arrive by connecting the customer's Google profile — that needs the `business.manage` scope,
  approved by hand at the Cloud-project level and still pending. The form stays either way: with no
  `locations` row a scan has nowhere to go, so this is the only path that makes the product work today.
  The part that earns its keep is the **live destination preview**: it mirrors `resolve_scan()`'s coalesce
  cascade in JS and shows where a scan would land with what is typed so far. That mirror is a copy of the
  SQL, not the source of truth — if the cascade's order changes in a migration, `googleDestinationOf()` /
  `instagramDestinationOf()` change with it. Saving a branch with no destination at all is allowed and
  warned about, on purpose; the list screen also counts them above the table, because the failure is
  invisible until somebody taps an expositor and nothing happens. Create/edit/delete are hidden from a
  `manager`, who has no insert policy on `locations`.
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
  yet — `location_review_snapshots` is written only by `sync-reviews` (`0024`), which nothing schedules
  yet and which needs a connected Google account plus a ficha linked to a sucursal. The gate is
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
- **Org switcher** (`0027`). `my_org_context()`, `private.active_org_id()` and `active_org_id_for()`
  pick the org from `profiles.last_organization_id` (else the oldest membership); `set_active_organization()`
  is now what writes it, after checking membership, and `accept_invitation()` sets it to the org just
  joined. `OrgContext` loads `list_my_organizations()` next to `my_org_context()` and exposes
  `organizations` / `switchOrganization(id)`; the selector lives in the Sidebar user menu and only renders
  with more than one org. Switching calls `refresh()`, whose `loading = true` makes `RequireActivePlan`
  unmount and remount `/panel` — that remount *is* how every screen refetches for the new org, and how
  the guard re-evaluates it (an org without access goes to `/alta/plan`). There is still no way to
  *create* a second org from the UI: `OnboardingStep redirectIfOrg` sends anyone with an org away from
  `/alta/empresa`.

### `apps/ventas`

- Routing is `react-router-dom` (v7, `BrowserRouter` in `main.jsx`), with the paths in `src/lib/routes.js`:
  `/`, `/tienda`, `/linkstarapp`, `/contacto`, `/finalizar-compra`, `/nosotros`, `/garantia`, `/legal`,
  `/privacidad`, `/terminos`, `/arrepentimiento`. Unknown paths redirect to `/`.
- **The legal pages are written for Argentina and carry placeholders.** `[RAZÓN SOCIAL]`, `[CUIT]`,
  `[DOMICILIO]` and `[EMAIL]` are waiting on the monotributo paperwork — grep for `[RAZÓN SOCIAL]` to
  fill them all in one pass. Two numbers that are not interchangeable and must not be merged again:
  the **legal warranty is 6 months** (Ley 24.240 art. 11, a floor that cannot be lowered) and the
  **right of withdrawal is 10 calendar days** (art. 34). `/arrepentimiento` exists as its own page
  linked from the footer because Res. 424/2020 requires a direct, visible access from the site, and the
  footer also carries the Defensa del Consumidor link that Res. 1033/2021 asks for.
- `SiteLayout` (navbar + `<Outlet />` + footer) wraps every page **except** `/finalizar-compra`: checkout
  is a purchase funnel and deliberately renders without navbar or footer, as it did before.
- `Navbar` and `Footer` use `<Link>`/`<NavLink>` — real `<a href>`s, crawlable and openable in a new tab.
  In-page CTAs (Hero, Features, FAQ…) keep their `onShop`/`onContact` callbacks, now wired to `navigate`:
  they are styled buttons, not navigation, so they were left alone.
- Cart state is global via `CartContext`; the `Cart` drawer is mounted outside `<Routes>` (it is a drawer,
  not a page) and navigates to checkout by itself. It **persists to `localStorage`** under a version
  number: bump `STORAGE_VERSION` in the same commit as any price or item-shape change, or a cart saved
  weeks ago reaches the checkout with prices the server catalog no longer accepts and the buyer gets a
  400 they can't act on. `/finalizar-compra` with an empty cart redirects to the shop — but the guard
  must keep its `step !== 'success'` condition, because confirming empties the cart and without it the
  buyer would be thrown off the screen showing their order number.
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
  It keeps a **fallback path** that was there for one reason: `services/api` had no deploy target
  until 6 Oct 2026. If the API doesn't answer the page mails the order straight from the browser as it used to, with the subject
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
- `services/api` deploys to **Railway** as a container — `services/api/Dockerfile` (Node 22, which
  `@supabase/supabase-js` 2.112+ requires), configured in the Railway dashboard with
  `RAILWAY_DOCKERFILE_PATH=services/api/Dockerfile` — **not** a `railway.json`: Railway deprecated
  Config as Code (existing files stop working 1 Dec 2026, new services can't opt in since 28 Aug) — at `api.linkstarapp.com`,
  and the same service answers `l.linkstarapp.com` (the redirect domain; nothing in the code looks at the
  host). Step-by-step in **`services/api/DEPLOY.md`**. Things that look optional and aren't: the Railway
  root directory is the **repo root**, not `services/api` (the only lockfile is at the root, and the
  Docker build context needs it); the Cloudflare CNAMEs are **DNS-only**, because `trust proxy = 1`
  counts exactly one proxy and Cloudflare's would make the rate limit see Cloudflare's IP; and a second
  Railway service runs `npm run daily` (`scripts/daily.js` → `sync-reviews` then `send-alerts`, both
  always, non-zero exit if either fails) on a cron. Not deployed yet as of 6 Oct 2026. When it goes
  live, update `apps/ventas/.env.production`'s `VITE_API_URL` and the API's `FRONTEND_URL` together.
- `apps/dashboard` deploys to `app.linkstarapp.com` with `wrangler.jsonc` (`custom_domain: true`, so the
  deploy itself creates the DNS record and certificate; SPA fallback) and `.env.production`.
  `apps/dashboard/DEPLOY.md` has the steps and the two decisions, both settled on 6 Oct 2026: publish
  **before** the API, with Business behind "Contactar con ventas" (`VITE_BUSINESS_CHECKOUT=off`) and every
  API-backed action showing "el servicio no está disponible" instead of crashing (`apiFetch` in
  `lib/googleApi.js`). It goes ahead of phase 8 because publishing the Google OAuth app needs it: a home
  page and a privacy policy reachable **without signing in**, on a verified own domain — the console steps
  are in `apps/dashboard/GOOGLE_VERIFICATION.md`. The landing's footer links the policy because Google
  checks the home page for it.
  That is why `PUBLIC_ROUTES.privacy` (`/privacidad`, `pages/Legal/Privacy.jsx`) sits outside every guard;
  if it ever ends up behind `RequireAuth`, the Google review fails. It is a separate document from the
  sales site's policy on purpose — different processing (scans and Business Profile data vs. orders and
  shipping) — and it carries the Limited Use disclosure Google requires for restricted scopes. The contact
  address in both is `linkstar.app1@gmail.com`; **never** `soporte@linkstar.com.ar`, a domain that was
  never registered (see `0021`) — a bouncing contact address fails the review on its own.
- Whatever host `apps/dashboard` lands on must serve `index.html`
  for unknown paths (SPA fallback), or every `/panel/...` deep link and every browser refresh returns 404 —
  the same `not_found_handling` the ventas Worker already sets.
- Of the three services `packages/database/supabase/README.md` originally assumed would be Edge Functions,
  two now live in `services/api` (`routes/redirect.js`, `routes/webhooks.js`) and are not planned as
  separate functions. The third, `sync-reviews`, is `services/api/scripts/sync-reviews.js` — not an Edge
  Function and not `pg_cron` either, because it talks to Google and needs `GOOGLE_TOKEN_ENC_KEY`, which
  lives only in this service. It runs as the `daily` Railway cron service (`npm run daily`, see `services/api/DEPLOY.md`); until the API is deployed, it runs by hand.

## Language note

Code comments, commit messages, UI copy, `README.md` and `packages/database/supabase/README.md` are in
Spanish (Argentina) — that's the working language of the project and of the two people on it. This file
(`CLAUDE.md`) is the exception and stays in English. Match whatever the file you're editing already uses.
