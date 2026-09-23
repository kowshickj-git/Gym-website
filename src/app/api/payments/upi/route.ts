import { NextResponse, type NextRequest } from 'next/server';
import { assertMember, authErrorResponse } from '@/lib/auth/guards';
import { planSnapshotFrom, PricingError, quoteFromDatabase } from '@/lib/payments';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOrderSchema } from '@/lib/validation';
import { buildUpiLink, upiAppLinks, upiTransactionRef, UpiConfigError } from '@/lib/upi';
import { hit, rateLimitResponse } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/audit';
import type { Json, Payment } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Starts a UPI Direct payment.
 *
 * No gateway is involved: the response is a `upi://pay` deep link to the gym's
 * own UPI id, so the money moves member-bank → gym-bank with nobody taking a
 * cut. The amount is still computed here from the database, exactly as for a
 * card payment — the deep link embeds it so the member's app cannot be talked
 * into sending less.
 *
 * Because UPI has no merchant callback, the payment stays PENDING until a staff
 * member confirms it against the bank statement.
 */
export async function POST(request: NextRequest) {
  try {
    const { member, id: userId } = await assertMember();

    const limit = hit(`upi:start:${member.id}`, 12, 300);
    if (!limit.allowed) return rateLimitResponse(limit, 'Too many payment attempts. Please wait a moment.');

    const supabase = createAdminClient();
    const { data: settings } = await supabase
      .from('gym_settings')
      .select('gym_name, upi_vpa, upi_payee_name, upi_enabled')
      .eq('id', true)
      .maybeSingle();

    if (!settings?.upi_enabled || !settings.upi_vpa) {
      return NextResponse.json(
        { error: 'The gym has not switched on UPI payments yet.', code: 'UPI_NOT_CONFIGURED' },
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

    if (quoted.quote.final_amount <= 0) {
      return NextResponse.json(
        { error: 'This plan works out to zero. Please ask the front desk to activate it for you.' },
        { status: 400 },
      );
    }

    const { data: payment, error } = await supabase.rpc('fn_start_upi_payment', {
      p_member_id: member.id,
      p_plan_id: quoted.plan.id,
      p_base_amount: quoted.quote.base_amount,
      p_discount_amount: quoted.quote.discount_amount,
      p_amount: quoted.quote.final_amount,
      p_plan_snapshot: planSnapshotFrom(quoted) as Json,
      p_offer_id: quoted.quote.offer?.id ?? null,
      p_coupon_code: quoted.quote.offer?.via_coupon ? (quoted.quote.offer.coupon_code ?? null) : null,
    });

    if (error || !payment) {
      console.error('[api] could not start UPI payment', error);
      return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 });
    }

    const row = payment as unknown as Payment;
    const link = buildUpiLink({
      vpa: settings.upi_vpa,
      payeeName: settings.upi_payee_name ?? settings.gym_name,
      amount: Number(row.amount),
      transactionRef: upiTransactionRef(row.id),
      note: `${settings.gym_name} ${quoted.plan.name}`,
    });

    await recordAudit({
      actorUserId: userId,
      actorLabel: member.full_name,
      action: 'UPI_PAYMENT_STARTED',
      entity: 'payments',
      entityId: row.id,
      after: { amount: row.amount, plan_id: quoted.plan.id },
    });

    return NextResponse.json({
      paymentId: row.id,
      amount: Number(row.amount),
      vpa: settings.upi_vpa,
      payeeName: settings.upi_payee_name ?? settings.gym_name,
      link,
      apps: upiAppLinks(link),
      // Rendered here rather than in the browser: it keeps the QR identical to
      // the link we authorised, and costs the phone no JavaScript.
      qrSvg: await toQrSvg(link),
      quote: quoted.quote,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof PricingError || error instanceof UpiConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[api] UPI start failed', error);
    return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 });
  }
}

/**
 * Renders the deep link as a QR code so a member on a desktop can scan it with
 * their phone. Returned as inline SVG: no image request, no client library.
 */
async function toQrSvg(link: string): Promise<string | null> {
  try {
    const { toString } = await import('qrcode');
    return await toString(link, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (error) {
    // A missing QR is a degraded experience, not a failed payment — the deep
    // link and the plain VPA both still work.
    console.error('[api] QR generation failed', error);
    return null;
  }
}
