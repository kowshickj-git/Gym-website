import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Request-scoped Supabase client that carries the signed-in user's session.
 * Every query it makes is subject to Row Level Security — this is the client
 * that page and layout code should use.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // middleware.ts refreshes the session, so this is safe to ignore.
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

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
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
