import { NextResponse, type NextRequest } from 'next/server';
import { verifyOtp } from '@/lib/auth/otp';
import { createMemberSession } from '@/lib/auth/session';
import { otpVerifySchema } from '@/lib/validation';
import { clientIp, hit, rateLimitResponse } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Checks a login code and, on success, starts the Supabase session.
 *
 * The session cookies are written by `createMemberSession`, so the browser is
 * authenticated the moment this responds — no second round trip.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const burst = hit(`otp:verify:ip:${ip}`, 20, 600);
  if (!burst.allowed) return rateLimitResponse(burst);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid code.' }, { status: 400 });
  }

  const { phone, code } = parsed.data;

  const perNumber = hit(`otp:verify:phone:${phone}`, 10, 900);
  if (!perNumber.allowed) return rateLimitResponse(perNumber, 'Too many attempts. Request a new code.');

  const verification = await verifyOtp(phone, code);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error, attemptsLeft: verification.attemptsLeft }, { status: 400 });
  }

  try {
    const session = await createMemberSession(phone);

    await recordAudit({
      actorUserId: session.userId,
      actorLabel: phone,
      action: 'AUTH_LOGIN',
      entity: 'users',
      entityId: session.userId,
      after: { method: 'otp' },
    });

    return NextResponse.json({
      ok: true,
      /** False when the number is not yet on the gym's member list. */
      hasMemberRecord: Boolean(session.memberId),
      redirectTo: session.memberId ? '/dashboard' : '/welcome',
    });
  } catch (error) {
    console.error('[api] could not create session', error);
    return NextResponse.json({ error: 'Could not sign you in. Please try again.' }, { status: 500 });
  }
}
