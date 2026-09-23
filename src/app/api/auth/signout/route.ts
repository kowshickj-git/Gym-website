import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await signOut();

  const target = new URL('/', request.nextUrl.origin);
  // 303 so the browser follows with a GET rather than replaying the POST.
  return NextResponse.redirect(target, { status: 303 });
}
