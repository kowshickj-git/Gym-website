import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let cached: SupabaseClient<Database> | null = null;

/**
 * Service-role client. Bypasses Row Level Security, so it must never be
 * constructed in code that can reach the browser, and every caller is
 * responsible for its own authorisation check first.
 *
 * Used for: OTP issuance, payment settlement, webhooks and the cron job —
 * paths where the acting principal is the server itself, not a signed-in user.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = requireEnv('SUPABASE_URL', serverEnv.supabaseUrl);
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY', serverEnv.supabaseServiceRoleKey);

  cached = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'iron-core-gym/server' } },
  });

  return cached;
}
