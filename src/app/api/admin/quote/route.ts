import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertStaff, authErrorResponse } from '@/lib/auth/guards';
import { PricingError, quoteFromDatabase } from '@/lib/payments';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  memberId: z.string().uuid(),
  planId: z.string().uuid(),
  couponCode: z.string().trim().max(24).optional().nullable(),
});

/**
 * Prices a plan for a given member, on behalf of staff at the desk.
 *
 * Separate from /api/payments/quote because the member here is chosen by the
 * staff rather than taken from the session — so it needs the staff guard, and
 * the member id has to come from the body.
 */
export async function POST(request: NextRequest) {
  try {
    await assertStaff();

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose a member and a plan.' }, { status: 400 });
    }

    const { quote, plan } = await quoteFromDatabase(parsed.data.planId, {
      couponCode: parsed.data.couponCode,
      memberId: parsed.data.memberId,
    });

    // Tell the desk when the new term will actually begin, so they can answer
    // "does renewing now lose me the rest of this month?" with a number.
    // The internal variant skips the self-only check — the staff guard above
    // is what authorises looking at another member's dates.
    const { data: startDate } = await createAdminClient().rpc('fn_next_start_date_internal', {
      p_member_id: parsed.data.memberId,
    });

    return NextResponse.json({ quote, plan, startDate });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[api] admin quote failed', error);
    return NextResponse.json({ error: 'Could not price that plan.' }, { status: 500 });
  }
}
