import { NextResponse, type NextRequest } from 'next/server';
import { assertMember, authErrorResponse } from '@/lib/auth/guards';
import { planSnapshotFrom, PricingError, quoteFromDatabase } from '@/lib/payments';
import { createOrder, isRazorpayConfigured, RazorpayError } from '@/lib/razorpay';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOrderSchema } from '@/lib/validation';
import { toPaise } from '@/lib/pricing';
import { hit, rateLimitResponse } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Opens a Razorpay order for the signed-in member.
 *
 * The amount is computed here from the database — the request body only says
 * *which plan* and *which coupon*, never how much. A payment row is written
 * first so that the webhook has something to settle even if the browser dies
 * mid-checkout.
 */
export async function POST(request: NextRequest) {
  let paymentId: string | null = null;

  try {
    const { member, id: userId } = await assertMember();

    const limit = hit(`order:${member.id}`, 10, 300);
    if (!limit.allowed) return rateLimitResponse(limit, 'Too many payment attempts. Please wait a moment.');

    if (!isRazorpayConfigured()) {
      return NextResponse.json(
        {
          error: 'Online payment is not switched on yet. Please pay at the gym and the desk will record it for you.',
          code: 'RAZORPAY_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }

    const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }

    const quoted = await quoteFromDatabase(parsed.data.planId, {
      couponCode: parsed.data.couponCode,
      memberId: member.id,
    });

    const amount = quoted.quote.final_amount;
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'This plan works out to zero. Please ask the front desk to activate it for you.' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        member_id: member.id,
        plan_id: quoted.plan.id,
        plan_snapshot: planSnapshotFrom(quoted) as never,
        base_amount: quoted.quote.base_amount,
        discount_amount: quoted.quote.discount_amount,
        amount,
        currency: 'INR',
        method: 'ONLINE',
        status: 'CREATED',
        offer_id: quoted.quote.offer?.id ?? null,
        coupon_code: quoted.quote.offer?.via_coupon ? (quoted.quote.offer.coupon_code ?? null) : null,
        metadata: { initiated_by: userId } as never,
      })
      .select('id')
      .single();

    if (insertError || !payment) {
      console.error('[api] could not create payment row', insertError);
      return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 });
    }

    paymentId = payment.id;

    const order = await createOrder({
      amountPaise: toPaise(amount),
      receipt: payment.id,
      notes: {
        member_id: member.id,
        member_name: member.full_name,
        plan: `${quoted.plan.category_name} — ${quoted.plan.name}`,
        payment_id: payment.id,
      },
    });

    await supabase
      .from('payments')
      .update({ razorpay_order_id: order.id, status: 'PENDING' })
      .eq('id', payment.id);

    await recordAudit({
      actorUserId: userId,
      actorLabel: member.full_name,
      action: 'PAYMENT_ORDER_CREATED',
      entity: 'payments',
      entityId: payment.id,
      after: { amount, order_id: order.id, plan_id: quoted.plan.id },
    });

    return NextResponse.json({
      paymentId: payment.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: serverEnv.razorpayKeyId,
      quote: quoted.quote,
      plan: quoted.plan,
      prefill: {
        name: member.full_name,
        contact: member.phone,
        email: member.email ?? undefined,
      },
    });
  } catch (error) {
    // Leave a trail rather than a silently stuck row.
    if (paymentId) {
      await createAdminClient()
        .from('payments')
        .update({ status: 'FAILED', failure_reason: (error as Error).message.slice(0, 300) })
        .eq('id', paymentId)
        .then(undefined, () => undefined);
    }

    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RazorpayError) {
      console.error('[api] razorpay order failed', error);
      return NextResponse.json({ error: 'The payment gateway rejected this request. Please try again.' }, { status: 502 });
    }

    console.error('[api] order creation failed', error);
    return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 });
  }
}
