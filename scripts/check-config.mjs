#!/usr/bin/env node
/**
 * Pre-flight check.
 *
 * Reports what is configured and what will silently fall back to a mock, so a
 * deployment never goes live with, say, OTP delivery quietly logging to the
 * console. Run it before and after deploying:
 *
 *   node scripts/check-config.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const has = (name) => Boolean(process.env[name]?.trim());

const REQUIRED = [
  ['NEXT_PUBLIC_SUPABASE_URL', 'Supabase project URL'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase anon key'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key (server only)'],
  ['AUTH_SECRET', 'Secret for hashing OTPs and deriving member credentials'],
  ['NEXT_PUBLIC_SITE_URL', 'Public site URL, used in links inside messages'],
];

const PAYMENTS = [
  ['RAZORPAY_KEY_ID', 'Razorpay key id'],
  ['RAZORPAY_KEY_SECRET', 'Razorpay key secret'],
  ['RAZORPAY_WEBHOOK_SECRET', 'Razorpay webhook secret'],
  ['NEXT_PUBLIC_RAZORPAY_KEY_ID', 'Razorpay key id exposed to the checkout widget'],
];

let problems = 0;
let warnings = 0;

console.log('\n  Iron Core Gym — configuration check\n');

console.log('  Required');
for (const [name, description] of REQUIRED) {
  const ok = has(name);
  if (!ok) problems += 1;
  console.log(`    ${ok ? '✔' : '✖'} ${name.padEnd(32)} ${description}`);
}

console.log('\n  Online payments (Razorpay)');
const razorpayReady = PAYMENTS.every(([name]) => has(name));
for (const [name, description] of PAYMENTS) {
  const ok = has(name);
  if (!ok) warnings += 1;
  console.log(`    ${ok ? '✔' : '○'} ${name.padEnd(32)} ${description}`);
}
if (!razorpayReady) {
  console.log('      → Online checkout is disabled. Cash and UPI at the desk still work.');
}

console.log('\n  Messaging');
const smsProvider = (process.env.SMS_PROVIDER ?? 'console').toLowerCase();
const smsReady =
  (smsProvider === 'msg91' && has('MSG91_AUTH_KEY') && has('MSG91_SENDER_ID')) ||
  (smsProvider === 'twilio' && has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_FROM'));

console.log(`    ${smsReady ? '✔' : '○'} SMS via ${smsProvider}`);
if (!smsReady) {
  warnings += 1;
  console.log('      → Login codes will be written to the server log, not sent.');
  console.log('        That is fine for a demo; it is not fine for real members.');
}

const whatsappProvider = (process.env.WHATSAPP_PROVIDER ?? 'console').toLowerCase();
const whatsappReady =
  (['cloud', 'meta'].includes(whatsappProvider) && has('WHATSAPP_PHONE_NUMBER_ID') && has('WHATSAPP_ACCESS_TOKEN')) ||
  (whatsappProvider === 'twilio' &&
    has('TWILIO_ACCOUNT_SID') &&
    has('TWILIO_AUTH_TOKEN') &&
    has('TWILIO_WHATSAPP_FROM'));
console.log(`    ${whatsappReady ? '✔' : '○'} WhatsApp via ${whatsappProvider} (optional)`);

const emailReady = (process.env.EMAIL_PROVIDER ?? 'console').toLowerCase() === 'resend' && has('RESEND_API_KEY');
console.log(`    ${emailReady ? '✔' : '○'} Email (optional)`);

console.log('\n  Scheduled jobs');
const cronReady = has('CRON_SECRET');
if (!cronReady) warnings += 1;
console.log(`    ${cronReady ? '✔' : '✖'} CRON_SECRET — required for the daily expiry reminder job`);

console.log('\n  Mode');
const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.DEMO_MODE === 'true';
console.log(`    ${demo ? '!' : '✔'} Demo mode is ${demo ? 'ON' : 'off'}`);
if (demo) {
  warnings += 1;
  console.log('      → OTP codes are shown in the browser. Never leave this on for a real gym.');
}

console.log('');
if (problems > 0) {
  console.log(`  ✖ ${problems} required value${problems === 1 ? '' : 's'} missing. The app will not work correctly.\n`);
  process.exit(1);
}
console.log(`  ✔ Required configuration present.${warnings ? ` ${warnings} optional item(s) not set.` : ''}\n`);
