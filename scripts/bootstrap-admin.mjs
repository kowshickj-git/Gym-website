#!/usr/bin/env node
/**
 * Creates (or repairs) the gym owner's admin account.
 *
 * There is deliberately no self-service signup into the admin area, so this is
 * how the very first account comes into being. Run it once after the migrations:
 *
 *   node scripts/bootstrap-admin.mjs --email owner@yourgym.com --password "..." --name "Owner"
 *
 * or with environment variables ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
 *
 * Safe to re-run: an existing account is promoted to ADMIN and its password
 * reset, which is also the recovery path if the owner is locked out.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function arg(flag) {
  const index = process.argv.indexOf(`--${flag}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const email = arg('email') ?? process.env.ADMIN_EMAIL;
const password = arg('password') ?? process.env.ADMIN_PASSWORD;
const name = arg('name') ?? process.env.ADMIN_NAME ?? 'Gym Owner';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
}

if (!supabaseUrl || !serviceRoleKey) {
  fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).');
}
if (!email || !password) {
  fail('Pass --email and --password, or set ADMIN_EMAIL and ADMIN_PASSWORD.');
}
if (password.length < 10) {
  fail('Use a password of at least 10 characters — this account can see every member.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === target.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`\n  Bootstrapping admin account for ${email}…`);

  let user = await findUserByEmail(email);

  if (user) {
    console.log('  → Account already exists; resetting its password and role.');
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (error) fail(`Could not update the account: ${error.message}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (error) fail(`Could not create the account: ${error.message}`);
    user = data.user;
    console.log('  → Auth account created.');
  }

  const { error: profileError } = await supabase.from('users').upsert(
    { id: user.id, role: 'ADMIN', full_name: name, email, is_active: true },
    { onConflict: 'id' },
  );
  if (profileError) fail(`Could not write the user profile: ${profileError.message}`);

  const { error: adminError } = await supabase.from('admin_users').upsert(
    {
      user_id: user.id,
      display_name: name,
      designation: 'Owner',
      can_collect_cash: true,
      is_active: true,
    },
    { onConflict: 'user_id' },
  );
  if (adminError) fail(`Could not write the staff record: ${adminError.message}`);

  console.log('\n  ✔ Done. Sign in at /admin/login with:');
  console.log(`      email    ${email}`);
  console.log('      password the one you just set\n');
}

main().catch((error) => {
  console.error('\n  ✖ Bootstrap failed:', error.message ?? error, '\n');
  process.exit(1);
});
