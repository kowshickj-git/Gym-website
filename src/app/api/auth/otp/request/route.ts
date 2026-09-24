import { NextResponse, type NextRequest } from 'next/server';
import { requestOtp } from '@/lib/auth/otp';
import { otpRequestSchema } from '@/lib/validation';
import { clientIp, hit, rateLimitResponse } from '@/lib/rate-limit';
import { isSupabaseAdminConfigured } from '@/lib/env';
import { maskPhone } from '@/lib/phone';
import { OTP_TTL_SECONDS } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sends a login code.
 *
 * Two layers of rate limiting: a per-IP burst limit here, and a durable
 * per-number limit inside `requestOtp` that counts rows in the database and so
 * survives serverless cold starts.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: 'Login is not configured yet. Please contact the gym.' },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  const burst = hit(`otp:request:ip:${ip}`, 10, 600);
  if (!burst.allowed) return rateLimitResponse(burst);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = otpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Enter a valid mobile number.' },
      { status: 400 },
    );
  }

  const { phone } = parsed.data;

  const perNumber = hit(`otp:request:phone:${phone}`, 5, 3600);
  if (!perNumber.allowed) return rateLimitResponse(perNumber, 'Too many codes requested for this number.');

  try {
    const result = await requestOtp(phone, {
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
    });

    if (!result.ok) {
      if (result.unavailable) return NextResponse.json({ error: result.error }, { status: 503 });
      return NextResponse.json(
        { error: result.error },
        { status: 429, headers: result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : undefined },
      );
    }

    return NextResponse.json({
      ok: true,
      maskedPhone: maskPhone(phone),
      expiresAt: result.expiresAt,
      expiresInSeconds: OTP_TTL_SECONDS,
      /** Only populated in demo mode, and only for the fictional demo numbers. */
      devCode: result.devCode,
      simulated: result.simulated,
    });
  } catch (error) {
    console.error('[api] otp request failed', error);
    return NextResponse.json({ error: 'Could not send the code. Please try again.' }, { status: 500 });
  }
}
