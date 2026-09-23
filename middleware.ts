import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { publicEnv } from '@/lib/env';

/** Prefixes that require a signed-in member. */
const MEMBER_PREFIXES = ['/dashboard', '/profile', '/checkout', '/payments', '/receipts', '/welcome'];

/** Prefixes that require a signed-in staff account. */
const ADMIN_PREFIXES = ['/admin'];

/** Admin paths that must stay reachable while signed out. */
const ADMIN_PUBLIC = ['/admin/login'];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Without Supabase configured there is no session to refresh; let every
  // request through so the setup instructions in the README are reachable.
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  const needsMember = MEMBER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const needsAdmin =
    ADMIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
    !ADMIN_PUBLIC.includes(pathname);

  if (!user && (needsMember || needsAdmin)) {
    const url = request.nextUrl.clone();
    url.pathname = needsAdmin ? '/admin/login' : '/login';
    url.search = '';
    // Preserve where they were heading so the login can send them back.
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Someone already signed in has no reason to see a login screen.
  if (user && (pathname === '/login' || pathname === '/verify-otp')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next's static output, image optimiser, and files with
     * an extension — those never need a session refresh.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)',
  ],
};
