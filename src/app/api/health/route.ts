import { NextResponse } from 'next/server';
import { publicEnv, serverEnv, siteUrl, supabasePublicConfig } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Deployment self-check: GET /api/health.
 *
 * Answers "is this deployment wired up?" without needing access to the hosting
 * dashboard or its logs. It reports only whether each setting is present, never
 * a value, so it is safe to leave public.
 *
 * The built* fields are the values Next.js baked into the browser bundle when
 * this deployment was built. If supabaseUrl is true but builtWithSupabaseUrl is
 * false, the variable was added after the build: the server copes, but the
 * browser bundle (photo upload) will not until the next deploy.
 */
export async function GET() {
  const supabase = supabasePublicConfig();

  const config = {
    supabaseUrl: Boolean(supabase.url),
    supabaseAnonKey: Boolean(supabase.anonKey),
    supabaseServiceRoleKey: Boolean(serverEnv.supabaseServiceRoleKey),
    authSecret: Boolean(serverEnv.authSecret),
    cronSecret: Boolean(serverEnv.cronSecret),
    builtWithSupabaseUrl: Boolean(publicEnv.supabaseUrl),
    builtWithSupabaseAnonKey: Boolean(publicEnv.supabaseAnonKey),
  };

  let database: 'ok' | 'schema missing' | 'unreachable' | 'not configured' | `error ${number}` = 'not configured';
  if (supabase.url && supabase.anonKey) {
    try {
      const response = await fetch(`${supabase.url}/rest/v1/gym_settings?select=id&limit=1`, {
        headers: { apikey: supabase.anonKey, Authorization: `Bearer ${supabase.anonKey}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      database = response.ok ? 'ok' : response.status === 404 ? 'schema missing' : `error ${response.status}`;
    } catch {
      database = 'unreachable';
    }
  }

  const ok =
    config.supabaseUrl &&
    config.supabaseAnonKey &&
    config.supabaseServiceRoleKey &&
    config.authSecret &&
    database === 'ok';

  return NextResponse.json(
    {
      ok,
      database,
      config,
      siteUrl: siteUrl(),
      demoMode: serverEnv.demoMode,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
