'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser-side Supabase client. Carries only the anon key; RLS does the rest. */
export function createClient() {
  if (!cached) {
    cached = createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  }
  return cached;
}
