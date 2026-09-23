import { NextResponse, type NextRequest } from 'next/server';
import { assertMember, authErrorResponse } from '@/lib/auth/guards';
import { quoteFromDatabase, PricingError } from '@/lib/payments';
import { quoteRequestSchema } from '@/lib/validation';
import { clientIp, hit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Prices a plan for the signed-in member, applying any coupon they typed.
 *
 * Used by the checkout page to refresh the total as the coupon field changes.
 * The same function runs again when the order is actually created, so this
 * endpoint is a preview — it never fixes a price.
 */
export async function POST(request: NextRequest) {
  try {
    const { member } = await assertMember();

    const limit = hit(`quote:${clientIp(request)}`, 40, 60);
    if (!limit.allowed) return rateLimitResponse(limit);

    const parsed = quoteRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }

    const { quote, plan } = await quoteFromDatabase(parsed.data.planId, {
      couponCode: parsed.data.couponCode,
      memberId: member.id,
    });

    return NextResponse.json({ quote, plan });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[api] quote failed', error);
    return NextResponse.json({ error: 'Could not price that plan.' }, { status: 500 });
  }
}
