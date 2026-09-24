import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabasePublicConfig } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Fails with a message that says what to do. Left to itself, supabase-js throws
 * "Your project's URL and Key are required", which in a Vercel log reads like a
 * code bug rather than a missing setting.
 */
function requireSupabaseConfig(): [string, string] {
  const { url, anonKey } = supabasePublicConfig();
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured on this server: set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY (Vercel: Settings -> Environment Variables).',
    );
  }
  return [url, anonKey];
}

/**
 * Request-scoped Supabase client that carries the signed-in user's session.
 * Every query it makes is subject to Row Level Security — this is the client
 * that page and layout code should use.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(...requireSupabaseConfig(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Read-only variant for Server Components. Identical behaviour, but it never
 * attempts a cookie write, which keeps the intent obvious at the call site.
 */
export async function createReadOnlyServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(...requireSupabaseConfig(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        /* no-op */
      },
    },
  });
}
