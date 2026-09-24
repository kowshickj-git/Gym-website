import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session on every request and returns the response
 * carrying any rotated cookies.
 *
 * Deliberately does *not* decide authorisation. Middleware only knows whether a
 * session exists; whether that session may see a page is re-checked on the
 * server by the guards in lib/auth/guards.ts, where the role actually lives.
 */
export async function updateSession(request: NextRequest, config: { url: string; anonKey: string }) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalidates the token with Supabase; getSession() would trust the
  // cookie as-is, which is not safe to gate on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
