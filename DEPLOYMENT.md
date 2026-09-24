# Deployment

Taking Iron Core Gym from a clone to a live gym. Allow about an hour, most of
which is waiting for Razorpay's KYC if you are setting that up for the first
time.

The order below matters: the database has to exist before Vercel can build
against it, and Razorpay's webhook needs the live domain.

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Pick the region
   closest to the gym — **Mumbai (ap-south-1)** for anywhere in India. This is
   the single biggest lever on how fast the app feels.
2. Note the database password; you will not be shown it again.
3. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

   The service role key bypasses every security rule in the database. It goes in
   server-side environment variables only, and never in a variable whose name
   starts with `NEXT_PUBLIC_`.

4. Build the paste-ready files:

   ```bash
   npm run deploy:kit
   ```

   That writes a gitignored `deploy/` directory containing the whole schema as
   one file, the seed as another, and your environment variables in Vercel's
   import format. It reads `.env.local`, so fill that in first.

5. Apply the schema. **The SQL editor is the path that needs no password** —
   open your project, go to **SQL Editor → New query**, paste all of
   `deploy/01-schema.sql`, and press Run. Then do the same with
   `deploy/02-seed.sql`.

   Both are safe to re-run. Run 01 before 02.

   If you would rather use the CLI, it needs either the database password or a
   personal access token from
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   On new projects `db.<ref>.supabase.co:5432` resolves over IPv6 only. If your
   network has no IPv6, use the Session Pooler connection string from
   **Project Settings → Database** instead.

6. The seed creates the gym profile, both membership categories, eight plans and
   four example offers — plus eight fictional demo members. For a real gym, run
   only the part of `deploy/02-seed.sql` above the "Demo members" heading, then
   set your own details in `/admin/settings` and your own prices in
   `/admin/plans`.

7. **Auth → Providers**: leave Email enabled. Phone can stay off — member OTPs
   are issued by this application, not by Supabase, so the gym can use an Indian
   SMS gateway.

8. **Auth → URL Configuration**: set the Site URL to your production domain.

---

## 2. Vercel

1. Push the repository to GitHub, then **Add New → Project** in Vercel and
   pick the repository from the **Import Git Repository** list. The framework
   is detected automatically.

   Use that list, not "Import Third-Party Git Repository" with a pasted URL.
   A pasted URL is cloned once and never connected, so later pushes do not
   deploy — the site silently stays on its first build. To check an existing
   project: **Settings → Git** should name the repository. If it offers to
   connect one instead, connect it.
2. Under **Settings → Environment Variables**, use the import box and paste
   `deploy/vercel-env.txt` — `npm run deploy:kit` generates it from your
   `.env.local` in exactly that format. Check `NEXT_PUBLIC_SITE_URL` before
   saving: the generator refuses to carry a `localhost` value across, so it
   arrives as an obvious placeholder for you to replace.

   Set by hand instead if you prefer. At minimum:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` |
   | `NEXT_PUBLIC_DEMO_MODE` | `false` |
   | `DEMO_MODE` | `false` |

3. Deploy. `vercel.json` already pins the function region to `bom1` (Mumbai) and
   registers the daily cron job.

   Then open `https://your-domain.com/api/health`. It reports which settings the
   deployment can see (never their values) and whether the database answers:

   ```json
   { "ok": true, "database": "ok", "config": { "supabaseUrl": true, ... } }
   ```

   `"database": "schema missing"` means the schema step in section 1 has not been run.
   `builtWithSupabaseUrl: false` next to `supabaseUrl: true` means the variables
   were added after the build — the server copes, but redeploy once so the
   browser bundle (photo uploads) has them too.
4. Add the custom domain under **Settings → Domains**, then come back and update
   `NEXT_PUBLIC_SITE_URL` to match — that value is what appears in the links
   inside SMS and WhatsApp messages. Until you do, links use the project's
   `.vercel.app` address; the app never sends a `localhost` link from Vercel,
   even if that is what the variable says.

### The cron job

`vercel.json` schedules `GET /api/cron/expiry` at `30 2 * * *` UTC, which is
08:00 IST. Vercel sends `CRON_SECRET` automatically as a Bearer token once the
variable exists on the project, and the endpoint refuses any request without it.

Cron jobs run on production deployments only. Trigger a run by hand with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/expiry
```

---

## 3. The owner account

There is no public signup into the admin area. Create the first account from a
machine that has the production environment variables:

```bash
ADMIN_EMAIL=owner@yourgym.com \
ADMIN_PASSWORD='a-long-password' \
ADMIN_NAME='Owner' \
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
node scripts/bootstrap-admin.mjs
```

Further staff are added from **/admin/settings** once you are signed in.

---

## 4a. UPI Direct — the free option, no keys needed

Do this before Razorpay. It costs nothing, takes two minutes, and needs no
account anywhere: members pay the gym's UPI id straight from their own app.

1. Sign in at `/admin/settings`.
2. Under **Accept UPI directly**, enter the gym's UPI id — the one the owner
   would give anyone to pay them, e.g. `ironcore@okaxis`.
3. Check it. **Send ₹1 to it from your own phone before switching this on** — a
   typo here sends members' money to a stranger, and nothing in this system can
   get it back.
4. Turn on **Offer UPI payment at checkout**.

Members now see a "Pay by UPI — no fees" button. After paying they type the
12-digit reference their app showed, and it appears in **/admin/payments/upi**
for staff to confirm against the bank SMS. Confirming activates the membership
and issues the receipt.

Make sure the gym's WhatsApp or contact number is set in Settings too — the app
messages that number whenever a member reports a payment, so nobody is left
waiting for someone to happen to check the dashboard.

## 4b. Razorpay — cards, netbanking, instant confirmation

Optional, and worth adding on top of UPI Direct rather than instead of it: it
confirms automatically, so members who want the membership live the moment they
pay get that.

On fees: Indian regulation bars a merchant discount rate on UPI and RuPay debit,
so those stay free even through Razorpay. The ~2% applies to credit cards,
netbanking and wallets.

1. Create an account at [razorpay.com](https://razorpay.com) and complete KYC.
2. **Settings → API Keys → Generate Key**. Set:
   - `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` (the same value; the key
     id is not a secret and the checkout widget needs it)
   - `RAZORPAY_KEY_SECRET`
3. **Settings → Webhooks → Add New Webhook**:
   - URL: `https://your-domain.com/api/webhooks/razorpay`
   - Secret: generate one, and set it as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `order.paid`
4. Redeploy so the new variables take effect.

Test with Razorpay's test keys first (`rzp_test_…`) and UPI id `success@razorpay`.
Then switch to live keys and make one real ₹1 payment end to end.

The webhook is the authority, not the browser. If a member's connection drops
after paying, the webhook still activates their membership within seconds.

---

## 5. SMS

Until this is configured, login codes are written to the server log instead of
being sent — which means nobody but you can sign in.

**MSG91** is the usual choice for Indian transactional SMS:

1. Register at [msg91.com](https://msg91.com) and complete DLT registration
   (mandatory in India — allow a few days).
2. Create a sender id and an OTP template. The template needs one variable for
   the code.
3. Set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`,
   `MSG91_TEMPLATE_ID` and `MSG91_OTP_TEMPLATE_ID`.

**Twilio** works without DLT but costs considerably more per message in India:
set `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
`TWILIO_FROM`.

WhatsApp is optional and much cheaper than SMS for reminders. When configured,
reminders try WhatsApp first and fall back to SMS.

---

## 6. Before you hand it over

Run the configuration report, then prove the security boundary holds on the
live project. `verify:rls` uses only the publishable key — the same thing any
visitor's browser has — and fails if it can read a private table or execute a
function that moves money:

```bash
npm run check:config
npm run verify:rls
curl https://your-domain.com/api/health
```

Then walk the list:

- [ ] `/admin/settings` has the gym's real name, address, phone and receipt
      footer. These appear on every receipt and in every message.
- [ ] `/admin/plans` has the gym's real prices. Delete or deactivate any plan
      the gym does not actually sell.
- [ ] Demo members are deleted: **Members → Remove members → Select sample
      members → Delete**. That also removes their test payments.
- [ ] Example offers are deleted or edited.
- [ ] `DEMO_MODE` and `NEXT_PUBLIC_DEMO_MODE` are both `false`.
- [ ] A real member can receive an OTP and sign in.
- [ ] The UPI id in Settings is correct — **you have sent ₹1 to it yourself**.
- [ ] A member-side UPI payment appears in /admin/payments/upi and confirms.
- [ ] A ₹1 live card payment completes and produces a receipt (if Razorpay is on).
- [ ] `curl` the cron endpoint and confirm it returns a summary.
- [ ] Staff have their own accounts — nobody is sharing the owner login.
- [ ] Only staff who handle money have **Can take payments** switched on
      (Settings → Staff). The others can still see members and call them.
- [ ] `/admin/activity` shows messages as **Sent**, not **Not sent** — that is
      how you know the SMS or WhatsApp gateway is really delivering.
- [ ] Open `/admin` on the owner's actual phone and check that finding a member
      and calling them takes a few taps.

---

## Backups and recovery

Supabase takes daily backups on paid plans; on the free plan, schedule your own:

```bash
npx supabase db dump --linked -f backup-$(date +%F).sql
```

A gym's membership data is its business. Take a dump before any schema change,
and keep a copy somewhere other than Supabase.

**Locked out of the admin account**: re-run `scripts/bootstrap-admin.mjs` with
the same email and a new password.

**The site shows "Something went wrong"**: open `/api/health` first. It names
the missing setting, or says the database schema is missing, without anyone
needing access to the Vercel logs.

**A payment was taken but no membership appeared**: find the payment in
`/admin/payments` (it will be `Awaiting payment` or `Failed`), check the Razorpay
dashboard for the order id shown there, and re-send the webhook from Razorpay.
The settlement function is idempotent, so replaying it is always safe.

---

## Costs at this scale

For a single gym of a few hundred members, the free tiers are enough to start:

| Service | Free tier | When you outgrow it |
|---|---|---|
| Vercel | Hobby | Commercial use requires Pro |
| Supabase | 500 MB database, 50k monthly active users | Well beyond one gym |
| Razorpay | No monthly fee | ~2% per transaction |
| MSG91 | Pay as you go | Roughly ₹0.15–0.25 per SMS |

The realistic running cost is SMS and the Razorpay percentage.
