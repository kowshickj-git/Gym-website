# Iron Core Gym — membership & payment management

A mobile-first web application that replaces a gym's paper register. Members
sign in with their mobile number, see their plan and expiry date, and renew
online. Staff register walk-ins, take cash at the desk, and work a daily call
list of memberships about to lapse.

Built for a single offline gym in Tamil Nadu, but nothing in it is specific to
one gym: prices, plan lengths, categories, festival offers and gym details are
all edited from the admin dashboard.

---

## What it does

**For members** — sign in with a mobile number and a six-digit code, view the
current membership and days remaining, browse plans with any running discount
already applied, pay by UPI / card / netbanking, and keep every receipt.

**For the gym** — a dashboard of the numbers that matter, a searchable member
list, one-tap call and WhatsApp buttons on the expiring and expired lists, cash
payment recording that activates a membership on the spot, full control of
pricing and festival campaigns without touching the database, and an owner-only
page to remove members in bulk (with a one-tap "select sample members").

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS 4 + shadcn/ui components |
| Database | PostgreSQL via Supabase, with Row Level Security |
| Auth | Supabase Auth — phone + OTP for members, email + password for staff |
| Payments | Razorpay (orders, checkout, webhook) |
| Charts | Recharts |
| Hosting | Vercel (Mumbai region), with a daily cron job |

---

## Getting started

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Create the database

Either point at a hosted Supabase project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # runs supabase/migrations in order
```

…or, if you have the dashboard but not the database password, generate a
single pasteable file and run it in the Supabase SQL editor:

```bash
npm run deploy:kit            # writes deploy/01-schema.sql and deploy/02-seed.sql
```

…or run it locally (needs Docker):

```bash
npx supabase start
npx supabase db reset         # migrations + supabase/seed.sql
```

`supabase/seed.sql` is safe to run repeatedly. It creates the gym profile, the
two membership categories, eight plans, four example offers and eight fictional
members covering every membership state.

### 3. Fill in `.env.local`

At minimum you need the three Supabase keys, `AUTH_SECRET` and `CRON_SECRET`:

```bash
openssl rand -base64 48    # AUTH_SECRET
openssl rand -hex 32       # CRON_SECRET
```

Then check what is and is not configured:

```bash
npm run check:config
```

### 4. Create the owner account

There is no public signup into the admin area, so the first account is made
from the command line:

```bash
npm run bootstrap:admin -- --email owner@yourgym.com --password "a-long-password" --name "Owner"
```

Re-running it resets that account's password — it is also the lock-out recovery
path.

### 5. Run it

```bash
npm run dev
```

| URL | What it is |
|---|---|
| `/` | Public landing page |
| `/login` | Member login (mobile number + OTP) |
| `/dashboard` | Member home |
| `/admin/login` | Staff login (email + password) |
| `/admin` | Admin dashboard |

---

## Demo mode

Setting `NEXT_PUBLIC_DEMO_MODE=true` and `DEMO_MODE=true` shows the login code
on screen for the fictional sample members only (+91 90000 00001 to 00009), so
anyone can try the member side without an SMS gateway. It changes nothing else —
the code is still generated, hashed, rate-limited and expired as in production.

Real numbers never get an on-screen code, so demo mode is safe to leave on after
real members join. Until an SMS gateway is configured, a real member who tries
to sign in is told that online login is not switched on yet and given the gym's
number, rather than waiting for a text that will never arrive.

With the seed data loaded, sign in as any demo member:

| Member | Number | State |
|---|---|---|
| Arun Kumar | 9000000001 | Active annual member |
| Karthik Raj | 9000000002 | Expires in 7 days |
| Priya S | 9000000003 | Expires in 3 days |
| Vignesh M | 9000000004 | Expired three weeks ago |
| Divya R | 9000000005 | Active, mid-term |
| Nandhini V | 9000000007 | Expires tomorrow, fee unpaid |
| Sathish Kannan | 9000000008 | Registered, never subscribed |

All of these people, numbers and payments are fictional.

---

## How the important parts work

### Money

There are three ways a member can pay, and all three converge on the same
settlement function, so a membership and its receipt look identical whichever
was used.

| Route | Fee | Confirmation |
|---|---|---|
| **UPI Direct** | **₹0** | Staff match the reference against the bank SMS |
| Razorpay | 0% on UPI/RuPay, ~2% on cards | Automatic, within seconds |
| Cash / card at the desk | ₹0 | Staff record it; activates immediately |

**UPI Direct** is the zero-fee route and needs no gateway at all. The owner puts
the gym's UPI id in `/admin/settings`; checkout then builds a `upi://pay` deep
link and a QR for that id, and the money moves member-bank → gym-bank with
nobody in between.

What UPI does not give a merchant is a callback. So the payment sits `PENDING`
carrying the 12-digit reference the member reported, and a staff member confirms
it against the bank SMS from `/admin/payments/upi` — one tap, and the membership
activates through the same `fn_settle_payment` as everything else. That human
step is the price of paying no fee, and it is how most small Indian businesses
already work.

A word on "free": there is no payment *gateway* in India with zero fees, because
the gateway has costs of its own. What is free is the *rail* — UPI. Indian
regulation prohibits a merchant discount rate on UPI and RuPay debit, which is
why UPI costs nothing whether you take it directly or through Razorpay.

Every rupee follows one path, and the browser is never trusted with a price.

```
member picks a plan
  → POST /api/payments/order
      server re-prices the plan from the database
      writes a payments row (status CREATED)
      opens a Razorpay order for that exact amount
  → Razorpay checkout in the browser
  → POST /api/payments/verify        ← convenience: shows the receipt at once
  → POST /api/webhooks/razorpay      ← authority: guarantees activation
      both call fn_settle_payment(payment_id)
```

`fn_settle_payment` is a single Postgres function that locks the payment row,
creates the membership, issues the receipt and increments the offer counter —
atomically and idempotently. The verify call and the webhook routinely race;
whichever arrives second gets `already_settled: true` and changes nothing.

Before activating, `/api/payments/verify` checks three independent things: the
HMAC signature against our key secret, that the payment row belongs to the
member making the request, and that Razorpay itself reports the payment captured
for the amount we expected.

Cash at the desk goes through `fn_record_offline_payment`, which inserts the
payment and settles it in one transaction. Staff may override the total —
negotiating at the counter is real — and the override is recorded and audited.

### Discounts

`src/lib/pricing.ts` is a pure, unit-tested module (`npm test`). It supports
fixed and percentage discounts, percentage caps, minimum purchase amounts,
global and per-member usage limits, coupon codes, and scoping by category
and/or plan length.

An offer with no scope rules applies to every plan. Fields *within* one rule are
ANDed, and separate rules are ORed — so `{category: Cardio, duration: 12}` means
"the annual cardio plan", while two rules for 6 and 12 months mean "either".

When a member types a coupon while an automatic campaign is also running, the
larger of the two wins. Entering a coupon should never leave someone paying more
than they would have without it.

Festival dates are never hard-coded. The admin picks the window for Pongal,
Puthandu, Diwali or anything else; the presets in the offer form fill in the
wording only.

### Expiry and reminders

A membership's stored status is re-derived every night by
`fn_refresh_membership_statuses`, and computed live in the `member_directory`
view so the lists are never stale between runs.

`GET /api/cron/expiry` runs daily at 08:00 IST (`vercel.json`, in UTC). It
refreshes statuses, then sends reminders 7, 3 and 1 days before expiry and again
on the day. Each notification row carries a dedupe key of
`expiry:<membership>:<offset>` against a unique index, so re-running the job —
by hand, or by Vercel retrying — cannot message anyone twice.

### Notifications

`src/lib/notifications/` is an interface plus a provider registry. Shipping
today: MSG91 and Twilio for SMS, WhatsApp Cloud API and Twilio for WhatsApp,
Resend for email, and a console provider.

The console provider is the default and the fallback. A gateway that is missing
credentials degrades to a logged message rather than a crashed reminder job —
and `/admin/settings` shows plainly which channels are live and which are only
logging.

### Authentication

Members authenticate by OTP. Supabase still needs a credential behind the
session for `auth.uid()` to exist, so each member gets an internal Supabase
identity derived from their phone number and `AUTH_SECRET`. They never see or
type it; their real email, if they have one, lives on `members.email`.

OTPs are stored as an HMAC, never in the clear. Rate limiting is layered: a
per-IP burst limit in memory, and a durable per-number limit that counts rows in
`otp_challenges` and therefore survives serverless cold starts.

The OTP request endpoint returns the same response whether or not the number
belongs to a member, so it cannot be used to enumerate the membership.

### Security

- Row Level Security on every table; the permissive defaults are revoked and
  privileges granted back explicitly.
- A member can read only their own member row, memberships, payments, receipts
  and notifications. Staff see the gym; only an owner can change pricing,
  offers, settings and staff.
- Members never write to a table directly. Profile edits go through
  `fn_update_my_profile`, whose parameter list *is* the set of editable fields —
  the phone number is deliberately not among them.
- The `otp_challenges` table has RLS on and zero policies: service role only.
- Money-moving functions are executable only by `service_role`, so they cannot
  be called through PostgREST with a browser key. Note *how*: on Supabase,
  `revoke ... from public` does nothing, because a default ACL grants EXECUTE to
  `anon` and `authenticated` directly. Migration 000500 revokes from those roles
  and changes the default so new functions start closed.
- Signed-in users cannot write `payments` or `memberships` at all; every such
  write goes through the server. The one exception is the owner marking a
  membership cancelled, limited by column grants to the three columns that
  cancelling touches.
- Staff take money only if the owner has switched **Can take payments** on for
  them. That is checked by the actions, not just by hiding buttons.
- Login codes never reach the message log in the clear: a trigger masks them
  on write, so staff reading `/admin/activity` cannot sign in as a member.
- Secrets live only in environment variables. The service role key is never
  imported into anything that can reach the browser.
- Every privileged mutation writes an `audit_logs` row, readable by the owner
  at `/admin/activity` alongside every message the system has sent.
- `npm run verify:rls` asserts all of the above against a live project using
  only the publishable key. Run it after any migration.

---

## Project layout

```
src/
  app/
    (public)/          landing, plans, offers, about, contact
    (auth)/            member login + OTP verification
    (admin-auth)/      staff login (outside the admin guard)
    (member)/          dashboard, profile, checkout, payments, receipts
    (admin)/admin/     dashboard, members, plans, offers, payments, reports, activity, settings
    api/               auth, payments, webhooks, cron, admin export
  components/
    ui/                shadcn/ui primitives
    admin/             admin-only composites
    member/            member shell and navigation
  lib/
    pricing.ts         the discount engine (pure, tested)
    payments.ts        quoting, settlement, offline payments
    razorpay.ts        orders and signature verification
    auth/              OTP, sessions, route guards
    notifications/     provider interface, registry, templates
    supabase/          browser / server / service-role clients
supabase/
  migrations/          schema, functions, RLS, storage, privilege lockdown
  seed.sql             gym profile, catalogue and demo data
scripts/
  bootstrap-admin.mjs  creates or repairs the owner account
  check-config.mjs     pre-flight configuration report
  verify-rls.mjs       live security-boundary check (publishable key only)
  deploy-kit.mjs       paste-ready SQL and Vercel env files in deploy/
proxy.ts               session refresh and signed-out redirects (Next 16)
```

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests: discount engine, UPI links, phone numbers, environment |
| `npm run verify:rls` | Check a live project's security boundary with the publishable key |
| `npm run typecheck` | TypeScript, no emit |
| `npm run check:config` | Report which integrations are live |
| `npm run bootstrap:admin` | Create or repair the owner account |
| `npm run deploy:kit` | Build paste-ready SQL and Vercel env files in `deploy/` |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:reset` | Recreate a local database from migrations + seed |
| `npm run db:types` | Regenerate `src/types/database.ts` from the live schema |

---

## Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full walkthrough: Supabase project,
Vercel, Razorpay keys and webhook, the cron job, and the post-deploy checks.

---

## Things worth knowing before you change something

- **Prices are never in code.** If you find yourself typing an amount into a
  `.tsx` file, it belongs in `membership_plans` instead.
- **`EXPIRING_SOON_DAYS` is defined twice** — in `src/lib/constants.ts` and in
  `public.fn_expiring_soon_days()`. Change both.
- **`src/types/database.ts` is hand-maintained** to match the migrations. After
  a schema change, either update it or run `npm run db:types`.
- **Row types must be `type` aliases, not `interface`s.** Supabase's generics
  require an implicit index signature, which interfaces do not get.
- **Receipts render from the stored snapshot**, not from live tables. A receipt
  must keep saying what it said on the day it was issued.
- **`NEXT_PUBLIC_*` values are frozen at build time.** Server code must read the
  Supabase URL and key through `supabasePublicConfig()` and the public origin
  through `siteUrl()`, which read at request time. The first production deploy
  500ed on every data page because it was built before the variables existed.
- **On Supabase, `revoke ... from public` is not a revoke.** Revoke from `anon`
  and `authenticated` by name, then run `npm run verify:rls`.
- **`proxy.ts` is Next 16's middleware.** It refreshes the session and redirects
  signed-out users; it never makes authorisation decisions. The guards in
  `src/lib/auth/guards.ts` do.
- **Health check**: `GET /api/health` reports what a deployment can see.
  Start there when a deployed page errors.
