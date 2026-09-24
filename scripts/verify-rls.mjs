#!/usr/bin/env node
/**
 * Asserts the security boundary that a browser key is supposed to hit.
 *
 * This exists because of a real defect. Migrations 000100 and 000400 protected
 * the money-moving functions with `revoke execute ... from public`, which reads
 * correctly and does nothing: Supabase grants EXECUTE to anon and authenticated
 * through a default ACL, so PUBLIC was never where the privilege came from.
 * Anyone with the publishable key could call fn_settle_payment and activate a
 * membership for a payment nobody made. Migration 000500 fixed the grants; this
 * script is what stops that regressing quietly a second time.
 *
 * It uses only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, so it
 * is safe to point at production, and it needs no database password.
 *
 *   npm run verify:rls
 */
import { readFileSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const k = t.slice(0, t.indexOf('=')).trim();
      if (process.env[k] === undefined) {
        process.env[k] = t.slice(t.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* file need not exist */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.');
  process.exit(1);
}
if (/service_role|sb_secret_/.test(key)) {
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY looks like a secret key. Refusing to run.');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

/**
 * Tables a visitor who has not signed in is meant to read: the shop window.
 * offer_plan_rules is here on purpose — the public plans page needs an offer's
 * scope to show the discounted price. Its policy only exposes rules belonging
 * to offers that are active and inside their date window.
 */
const PUBLIC_TABLES = ['gym_settings', 'membership_categories', 'membership_plans', 'offers', 'offer_plan_rules'];

/** Everything else. An empty result counts as denied — RLS filters rather than errors. */
const PRIVATE_TABLES = [
  'members', 'memberships', 'payments', 'receipts', 'notifications',
  'otp_challenges', 'admin_users', 'audit_logs', 'users', 'member_directory',
];

/**
 * Functions no browser key may execute, with arguments that would really work
 * if the call were allowed through — a signature mismatch would pass this test
 * for the wrong reason.
 */
const PRIVILEGED_FUNCTIONS = [
  ['fn_settle_payment', { p_payment_id: '00000000-0000-0000-0000-000000000000' }],
  ['fn_record_offline_payment', {
    p_member_id: '00000000-0000-0000-0000-000000000000',
    p_plan_id: '00000000-0000-0000-0000-000000000000',
    p_base_amount: 1, p_discount_amount: 0, p_amount: 1, p_method: 'CASH',
    p_collected_by: null, p_collected_by_name: null, p_offer_id: null,
    p_coupon_code: null, p_notes: null, p_paid_at: null,
  }],
  ['fn_start_upi_payment', {
    p_member_id: '00000000-0000-0000-0000-000000000000',
    p_plan_id: '00000000-0000-0000-0000-000000000000',
    p_base_amount: 1, p_discount_amount: 0, p_amount: 1,
    p_plan_snapshot: {}, p_offer_id: null, p_coupon_code: null,
  }],
  ['fn_confirm_upi_payment', {
    p_payment_id: '00000000-0000-0000-0000-000000000000',
    p_confirmed_by: null, p_confirmed_name: null,
  }],
  ['fn_reject_upi_payment', {
    p_payment_id: '00000000-0000-0000-0000-000000000000', p_reason: 'x', p_rejected_by: null,
  }],
  ['fn_next_receipt_number', {}],
  ['fn_next_start_date_internal', { p_member_id: '00000000-0000-0000-0000-000000000000' }],
  ['fn_refresh_membership_statuses', {}],
  ['fn_purge_expired_otps', {}],
  // Readable by staff only. These are granted to `authenticated`, so the guard
  // that has to hold for an anonymous caller is the is_staff() check inside.
  ['fn_admin_dashboard_stats', {}],
  ['fn_revenue_series', { p_months: 3 }],
  ['fn_category_distribution', {}],
];

let pass = 0;
const failures = [];

const record = (ok, line, detail) => {
  if (ok) {
    pass++;
    console.log(`  \u001b[32mPASS\u001b[0m  ${line}`);
  } else {
    failures.push(`${line} — ${detail}`);
    console.log(`  \u001b[31mFAIL\u001b[0m  ${line} — ${detail}`);
  }
};

console.log('\n  Iron Core Gym — public boundary check');
console.log(`  ${url}\n`);

console.log('  Catalogue a visitor should see');
for (const table of PUBLIC_TABLES) {
  const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  const body = await r.json().catch(() => null);
  const rows = Array.isArray(body) ? body.length : null;
  record(r.ok && rows > 0, `${table} is readable`, r.ok ? 'returned no rows' : `HTTP ${r.status}`);
}

console.log('\n  Tables a browser key must not reach');
for (const table of PRIVATE_TABLES) {
  const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  const body = await r.json().catch(() => null);
  const rows = Array.isArray(body) ? body.length : null;
  record(!r.ok || rows === 0, `${table} is not readable`, `HTTP ${r.status} returned ${rows} row(s)`);
}

console.log('\n  Functions a browser key must not execute');
for (const [fn, args] of PRIVILEGED_FUNCTIONS) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const text = await r.text();
  // 404 means PostgREST cannot even see a matching signature, which is also a
  // refusal — but flag it, because it usually means this test drifted.
  const missing = r.status === 404;
  record(!r.ok, `${fn} is refused`, `HTTP ${r.status} ${text.slice(0, 90)}`);
  if (missing) console.log(`        note: 404 means no matching signature — check this test, not the database`);
}

console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.log('  Something that should be private is reachable with the publishable key:');
  for (const f of failures) console.log(`    - ${f}`);
  console.log('');
  process.exit(1);
}
console.log('  Nothing private is reachable with the publishable key.\n');
