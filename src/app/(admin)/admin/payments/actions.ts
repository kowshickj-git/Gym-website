'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertStaff } from '@/lib/auth/guards';
import { cashPaymentSchema } from '@/lib/validation';
import { quoteFromDatabase, recordOfflinePayment, settlePayment, PricingError } from '@/lib/payments';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchOrderPayments, isRazorpayConfigured } from '@/lib/razorpay';
import { toPaise } from '@/lib/pricing';
import { recordAudit } from '@/lib/audit';
import type { PaymentMethod } from '@/types/database';

export interface CashPaymentState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Records a payment taken at the desk and activates the membership.
 *
 * The price is re-quoted from the database rather than trusted from the form,
 * for the same reason online checkout re-quotes: the amount charged must come
 * from the plan and the running offers, not from whatever the browser posted.
 * Staff may still override the total — negotiating at the counter is a real
 * part of running a gym — but the override is recorded explicitly and audited.
 */
export async function recordCashPayment(_prev: CashPaymentState, formData: FormData): Promise<CashPaymentState> {
  const staff = await assertStaff().catch(() => null);
  if (!staff) return { error: 'Your session has expired. Please sign in again.' };

  const parsed = cashPaymentSchema.safeParse({
    member_id: formData.get('member_id'),
    plan_id: formData.get('plan_id'),
    method: formData.get('method'),
    coupon_code: formData.get('coupon_code'),
    amount_override: formData.get('amount_override'),
    notes: formData.get('notes'),
    paid_at: formData.get('paid_at'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'Please check the highlighted fields.', fieldErrors };
  }

  const input = parsed.data;

  let quoted;
  try {
    quoted = await quoteFromDatabase(input.plan_id, {
      couponCode: input.coupon_code,
      memberId: input.member_id,
    });
  } catch (error) {
    if (error instanceof PricingError) return { error: error.message };
    throw error;
  }

  const quotedTotal = quoted.quote.final_amount;
  const override = input.amount_override;
  const hasOverride = override !== null && override !== undefined && Math.abs(override - quotedTotal) > 0.009;
  const amount = hasOverride ? override! : quotedTotal;

  // An override becomes an extra discount against the same base price, so the
  // receipt and the revenue reports still add up.
  const discount = Math.max(0, quoted.quote.base_amount - amount);

  if (amount < 0 || amount > quoted.quote.base_amount) {
    return {
      error: 'The amount must be between zero and the plan price.',
      fieldErrors: { amount_override: `Enter an amount up to ${quoted.quote.base_amount}.` },
    };
  }

  let result;
  try {
    result = await recordOfflinePayment({
      memberId: input.member_id,
      planId: input.plan_id,
      method: input.method as PaymentMethod,
      baseAmount: quoted.quote.base_amount,
      discountAmount: discount,
      amount,
      offerId: hasOverride ? null : (quoted.quote.offer?.id ?? null),
      couponCode: quoted.quote.offer?.via_coupon ? (quoted.quote.offer.coupon_code ?? null) : null,
      notes: input.notes,
      collectedBy: staff.id,
      collectedByName: staff.profile.full_name ?? staff.profile.email ?? 'Staff',
      paidAt: input.paid_at ? new Date(input.paid_at).toISOString() : null,
    });
  } catch (error) {
    console.error('[admin] record payment failed', error);
    return { error: 'Could not record the payment. Please try again.' };
  }

  await recordAudit({
    actorUserId: staff.id,
    actorLabel: staff.profile.full_name ?? staff.profile.email,
    action: 'PAYMENT_RECORDED_OFFLINE',
    entity: 'payments',
    entityId: result.payment_id,
    after: {
      member_id: input.member_id,
      plan_id: input.plan_id,
      method: input.method,
      amount,
      quoted_total: quotedTotal,
      manual_override: hasOverride,
      receipt_number: result.receipt_number,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/members');
  revalidatePath(`/admin/members/${input.member_id}`);

  redirect(`/admin/payments/${result.payment_id}?recorded=1`);
}

export interface ReverifyResult {
  error?: string;
  message?: string;
  receiptNumber?: string | null;
}

/**
 * Re-checks an online payment against Razorpay and settles it if it did in fact
 * go through.
 *
 * The webhook normally handles this within seconds, but it can be missed if the
 * webhook was misconfigured when the payment happened, or if Razorpay exhausted
 * its retries during an outage. This is the manual path for the member standing
 * at the desk saying the money left their account.
 *
 * Settlement is idempotent, so pressing this on an already-settled payment is
 * harmless.
 */
export async function reverifyPayment(paymentId: string): Promise<ReverifyResult> {
  const staff = await assertStaff().catch(() => null);
  if (!staff) return { error: 'Your session has expired.' };

  if (!isRazorpayConfigured()) {
    return { error: 'Razorpay is not configured, so there is nothing to check against.' };
  }

  const supabase = createAdminClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, amount, razorpay_order_id, member_id')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment) return { error: 'That payment no longer exists.' };
  if (payment.status === 'PAID') return { message: 'This payment is already settled.' };
  if (!payment.razorpay_order_id) {
    return { error: 'This payment has no Razorpay order, so there is nothing to check.' };
  }

  let attempts;
  try {
    attempts = await fetchOrderPayments(payment.razorpay_order_id);
  } catch (error) {
    console.error('[admin] reverify lookup failed', error);
    return { error: 'Could not reach Razorpay. Please try again in a moment.' };
  }

  const expectedPaise = toPaise(Number(payment.amount));
  const captured = attempts.find(
    (attempt) => attempt.status === 'captured' && attempt.amount === expectedPaise,
  );

  if (!captured) {
    const states = attempts.map((attempt) => attempt.status).join(', ') || 'no attempts';
    await supabase
      .from('payments')
      .update({ failure_reason: `Reconciled ${new Date().toISOString()}: ${states}` })
      .eq('id', payment.id);

    await recordAudit({
      actorUserId: staff.id,
      actorLabel: staff.profile.full_name ?? staff.profile.email,
      action: 'PAYMENT_REVERIFY_NOT_CAPTURED',
      entity: 'payments',
      entityId: payment.id,
      after: { attempts: states },
    });

    revalidatePath(`/admin/payments/${payment.id}`);
    return {
      error: `Razorpay has no captured payment for this order (${states}). No money was taken, so nothing needs refunding.`,
    };
  }

  let result;
  try {
    result = await settlePayment({ paymentId: payment.id, razorpayPaymentId: captured.id });
  } catch (error) {
    console.error('[admin] reverify settlement failed', error);
    return { error: 'The payment is confirmed but the membership could not be activated. Please try again.' };
  }

  await recordAudit({
    actorUserId: staff.id,
    actorLabel: staff.profile.full_name ?? staff.profile.email,
    action: 'PAYMENT_REVERIFIED',
    entity: 'payments',
    entityId: payment.id,
    after: { razorpay_payment_id: captured.id, receipt_number: result.receipt_number },
  });

  revalidatePath(`/admin/payments/${payment.id}`);
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/members/${payment.member_id}`);
  revalidatePath('/admin');

  return {
    message: result.already_settled
      ? 'This payment was already settled.'
      : `Confirmed with Razorpay. Membership activated and receipt ${result.receipt_number} issued.`,
    receiptNumber: result.receipt_number,
  };
}
