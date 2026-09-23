import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch, reminderChannels, templates } from '@/lib/notifications';
import { publicEnv } from '@/lib/env';
import { quotePlan, type OfferWithRules, type PricingPlan, type Quote } from '@/lib/pricing';
import type { OfferPlanRule, PaymentMethod, SettlementResult } from '@/types/database';

/**
 * Server-side payment orchestration.
 *
 * Two rules hold everywhere in this file:
 *   1. Prices are always recomputed here from the database. A number that
 *      arrived from the browser is only ever used to *compare against*, never
 *      to charge.
 *   2. Activation goes through `fn_settle_payment`, which is idempotent, so the
 *      verify callback and the webhook can both fire without double-crediting.
 */

export interface AuthoritativeQuote {
  quote: Quote;
  plan: {
    id: string;
    name: string;
    category_id: string;
    category_name: string;
    duration_months: number;
    base_price: number;
  };
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/**
 * Re-prices a plan from the database using the service role, so the result is
 * independent of anything the client claimed.
 */
export async function quoteFromDatabase(
  planId: string,
  options: { couponCode?: string | null; memberId?: string | null } = {},
): Promise<AuthoritativeQuote> {
  const supabase = createAdminClient();

  const { data: plan, error: planError } = await supabase
    .from('membership_plans')
    .select('*, category:membership_categories(id, name, is_active)')
    .eq('id', planId)
    .maybeSingle();

  if (planError) throw new PricingError('Could not load that plan.');
  if (!plan) throw new PricingError('That plan no longer exists.');
  if (!plan.is_active) throw new PricingError('That plan is no longer available.');

  const category = plan.category as unknown as { id: string; name: string; is_active: boolean } | null;
  if (category && !category.is_active) {
    throw new PricingError('That membership category is no longer available.');
  }

  const nowIso = new Date().toISOString();
  const { data: offers } = await supabase
    .from('offers')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso);

  let rules: OfferPlanRule[] = [];
  if (offers?.length) {
    const { data } = await supabase
      .from('offer_plan_rules')
      .select('*')
      .in(
        'offer_id',
        offers.map((offer) => offer.id),
      );
    rules = data ?? [];
  }

  const offersWithRules: OfferWithRules[] = (offers ?? []).map((offer) => ({
    ...offer,
    rules: rules.filter((rule) => rule.offer_id === offer.id),
  }));

  let memberUsage: Record<string, number> = {};
  if (options.memberId) {
    const { data: usage } = await supabase
      .from('payments')
      .select('offer_id')
      .eq('member_id', options.memberId)
      .eq('status', 'PAID')
      .not('offer_id', 'is', null);

    memberUsage = (usage ?? []).reduce<Record<string, number>>((acc, row) => {
      if (row.offer_id) acc[row.offer_id] = (acc[row.offer_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const pricingPlan: PricingPlan = {
    id: plan.id,
    name: plan.name,
    category_id: plan.category_id,
    category_name: category?.name ?? null,
    duration_months: plan.duration_months,
    base_price: Number(plan.base_price),
  };

  return {
    quote: quotePlan(pricingPlan, offersWithRules, { couponCode: options.couponCode, memberUsage }),
    plan: {
      id: plan.id,
      name: plan.name,
      category_id: plan.category_id,
      category_name: category?.name ?? 'Membership',
      duration_months: plan.duration_months,
      base_price: Number(plan.base_price),
    },
  };
}

/** The frozen plan/offer details stored on the payment row. */
export function planSnapshotFrom(quoted: AuthoritativeQuote) {
  return {
    plan_id: quoted.plan.id,
    plan_name: quoted.plan.name,
    category_id: quoted.plan.category_id,
    category_name: quoted.plan.category_name,
    duration_months: quoted.plan.duration_months,
    base_price: quoted.plan.base_price,
    offer_name: quoted.quote.offer?.name ?? null,
  };
}

/**
 * Marks a payment paid, creates the membership and issues the receipt, then
 * lets the member know. Safe to call more than once for the same payment.
 */
export async function settlePayment(params: {
  paymentId: string;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
  notify?: boolean;
}): Promise<SettlementResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('fn_settle_payment', {
    p_payment_id: params.paymentId,
    p_razorpay_payment_id: params.razorpayPaymentId ?? undefined,
    p_razorpay_signature: params.razorpaySignature ?? undefined,
  });

  if (error) {
    throw new Error(`Could not activate the membership: ${error.message}`);
  }

  const result = data as unknown as SettlementResult;

  if (params.notify !== false && !result.already_settled) {
    // A failed notification must never roll back a successful payment.
    void sendReceiptNotification(result).catch((notifyError) => {
      console.error('[payments] receipt notification failed', notifyError);
    });
  }

  return result;
}

async function sendReceiptNotification(result: SettlementResult): Promise<void> {
  if (!result.receipt_id) return;

  const supabase = createAdminClient();

  const [{ data: receipt }, { data: settings }] = await Promise.all([
    supabase
      .from('receipts')
      .select('id, receipt_number, member_id, snapshot, members(full_name, phone, email)')
      .eq('id', result.receipt_id)
      .maybeSingle(),
    supabase.from('gym_settings').select('gym_name').eq('id', true).maybeSingle(),
  ]);

  if (!receipt) return;

  const memberRow = (Array.isArray(receipt.members) ? receipt.members[0] : receipt.members) as
    | { full_name: string; phone: string; email: string | null }
    | undefined;
  if (!memberRow) return;

  const snapshot = receipt.snapshot as unknown as {
    membership?: { plan_name?: string; expiry_date?: string };
    payment?: { amount?: number };
  };

  const message = templates.paymentReceipt({
    memberName: memberRow.full_name,
    gymName: settings?.gym_name ?? 'Iron Core Fitness',
    planName: snapshot.membership?.plan_name ?? 'Membership',
    amount: Number(snapshot.payment?.amount ?? 0),
    receiptNumber: receipt.receipt_number,
    expiryDate: snapshot.membership?.expiry_date ?? '',
    receiptUrl: `${publicEnv.siteUrl}/receipts/${receipt.id}`,
  });

  const channels = reminderChannels(Boolean(memberRow.email));

  for (const channel of channels) {
    const outcome = await dispatch({
      kind: 'PAYMENT_RECEIPT',
      channel,
      recipient: channel === 'EMAIL' ? memberRow.email! : memberRow.phone,
      subject: message.subject,
      body: message.body,
      memberId: receipt.member_id,
      membershipId: result.membership_id,
      dedupeKey: `receipt:${receipt.id}:${channel}`,
      metadata: { receipt_number: receipt.receipt_number },
    });
    if (outcome.sent || outcome.skipped) break;
  }
}

/** Records an offline payment (cash, UPI at the desk, card machine). */
export async function recordOfflinePayment(params: {
  memberId: string;
  planId: string;
  method: PaymentMethod;
  baseAmount: number;
  discountAmount: number;
  amount: number;
  offerId?: string | null;
  couponCode?: string | null;
  notes?: string | null;
  collectedBy: string;
  collectedByName?: string | null;
  paidAt?: string | null;
}): Promise<SettlementResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('fn_record_offline_payment', {
    p_member_id: params.memberId,
    p_plan_id: params.planId,
    p_base_amount: params.baseAmount,
    p_discount_amount: params.discountAmount,
    p_amount: params.amount,
    p_method: params.method,
    p_collected_by: params.collectedBy,
    p_collected_by_name: params.collectedByName ?? null,
    p_offer_id: params.offerId ?? null,
    p_coupon_code: params.couponCode ?? null,
    p_notes: params.notes ?? null,
    p_paid_at: params.paidAt ?? new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Could not record the payment: ${error.message}`);
  }

  const result = data as unknown as SettlementResult;

  void sendReceiptNotification(result).catch((notifyError) => {
    console.error('[payments] receipt notification failed', notifyError);
  });

  return result;
}
