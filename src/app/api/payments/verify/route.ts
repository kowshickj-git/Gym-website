import { NextResponse, type NextRequest } from 'next/server';
import { assertMember, authErrorResponse } from '@/lib/auth/guards';
import { settlePayment } from '@/lib/payments';
import { fetchPayment, verifyPaymentSignature } from '@/lib/razorpay';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPaymentSchema } from '@/lib/validation';
import { toPaise } from '@/lib/pricing';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Confirms a checkout completion.
 *
 * Three independent checks have to pass before a membership is created:
 *   1. the HMAC signature matches our key secret;
 *   2. the payment row belongs to the member making the request;
 *   3. Razorpay itself reports the payment captured, for the amount we expected.
 *
 * Only then do we call `fn_settle_payment`. The webhook performs the same
 * settlement independently, so a member who closes the tab still gets activated.
 */
export async function POST(request: NextRequest) {
  try {
    const { member, id: userId } = await assertMember();

    const parsed = verifyPaymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payment confirmation.' }, { status: 400 });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

    const supabase = createAdminClient();
    const { data: payment } = await supabase
      .from('payments')
      .select('id, member_id, amount, status, membership_id')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ error: 'We could not find that payment.' }, { status: 404 });
    }

    if (payment.member_id !== member.id) {
      return NextResponse.json({ error: 'That payment belongs to another account.' }, { status: 403 });
    }

    // (1) Signature
    if (!verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
      await supabase
        .from('payments')
        .update({ status: 'FAILED', failure_reason: 'Signature verification failed' })
        .eq('id', payment.id);

      await recordAudit({
        actorUserId: userId,
        action: 'PAYMENT_SIGNATURE_INVALID',
        entity: 'payments',
        entityId: payment.id,
        after: { razorpay_order_id, razorpay_payment_id },
      });

      return NextResponse.json({ error: 'We could not verify this payment. Nothing has been charged twice — please contact the gym.' }, { status: 400 });
    }

    // (3) What Razorpay itself says happened.
    const remote = await fetchPayment(razorpay_payment_id);
    const expectedPaise = toPaise(Number(payment.amount));

    if (remote.order_id !== razorpay_order_id || remote.amount !== expectedPaise) {
      await recordAudit({
        actorUserId: userId,
        action: 'PAYMENT_AMOUNT_MISMATCH',
        entity: 'payments',
        entityId: payment.id,
        after: { expected: expectedPaise, received: remote.amount, order: remote.order_id },
      });
      return NextResponse.json({ error: 'This payment does not match the order. Please contact the gym.' }, { status: 400 });
    }

    if (remote.status !== 'captured' && remote.status !== 'authorized') {
      return NextResponse.json(
        { error: 'The payment has not completed yet. If money has left your account, contact the gym.' },
        { status: 409 },
      );
    }

    const result = await settlePayment({
      paymentId: payment.id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    await recordAudit({
      actorUserId: userId,
      actorLabel: member.full_name,
      action: result.already_settled ? 'PAYMENT_VERIFY_REPLAY' : 'PAYMENT_SETTLED',
      entity: 'payments',
      entityId: payment.id,
      after: { membership_id: result.membership_id, receipt_number: result.receipt_number },
    });

    return NextResponse.json({
      ok: true,
      receiptId: result.receipt_id,
      receiptNumber: result.receipt_number,
      membershipId: result.membership_id,
      redirectTo: result.receipt_id ? `/receipts/${result.receipt_id}` : '/dashboard',
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('[api] payment verification failed', error);
    return NextResponse.json(
      { error: 'We could not confirm the payment. If money has left your account it will be reconciled automatically.' },
      { status: 500 },
    );
  }
}
