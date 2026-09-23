import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertMember, authErrorResponse } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normaliseUpiReference } from '@/lib/upi';
import { hit, rateLimitResponse } from '@/lib/rate-limit';
import { dispatch, isLiveChannel } from '@/lib/notifications';
import { formatCurrency } from '@/lib/utils';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  paymentId: z.string().uuid(),
  reference: z.string().trim().min(6).max(40),
});

/**
 * The member reports the UPI reference their app showed after paying.
 *
 * This does not activate anything — it only moves the payment into the front
 * desk's confirmation queue. A member typing a made-up number gets nothing but
 * a rejected payment, because a human still matches it against the bank SMS.
 */
export async function POST(request: NextRequest) {
  try {
    const { member } = await assertMember();

    const limit = hit(`upi:reference:${member.id}`, 15, 600);
    if (!limit.allowed) return rateLimitResponse(limit);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter the reference number from your UPI app.' }, { status: 400 });
    }

    const reference = normaliseUpiReference(parsed.data.reference);
    if (!reference) {
      return NextResponse.json(
        { error: 'That does not look like a UPI reference. It is usually 12 digits.' },
        { status: 400 },
      );
    }

    // Runs as the member: fn_submit_upi_reference only touches their own row.
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc('fn_submit_upi_reference', {
      p_payment_id: parsed.data.paymentId,
      p_reference: reference,
    });

    if (error) {
      // The unique index stops two members claiming the same bank reference.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That reference number has already been used. Please check and try again.' },
          { status: 409 },
        );
      }
      if (error.message?.includes('BAD_REFERENCE')) {
        return NextResponse.json({ error: 'That reference number is not valid.' }, { status: 400 });
      }
      if (error.message?.includes('NOT_AWAITING_REFERENCE')) {
        return NextResponse.json({ error: 'This payment is no longer waiting for a reference.' }, { status: 409 });
      }
      console.error('[api] UPI reference submission failed', error);
      return NextResponse.json({ error: 'Could not save that reference. Please try again.' }, { status: 500 });
    }

    await recordAudit({
      actorUserId: member.user_id,
      actorLabel: member.full_name,
      action: 'UPI_REFERENCE_SUBMITTED',
      entity: 'payments',
      entityId: parsed.data.paymentId,
      after: { reference },
    });

    void notifyDesk(parsed.data.paymentId, member.full_name, reference).catch((notifyError) =>
      console.error('[api] desk notification failed', notifyError),
    );

    return NextResponse.json({
      ok: true,
      message: 'Thanks — the gym will confirm your payment shortly.',
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('[api] UPI reference route failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

/**
 * Nudges the gym so a member is not left waiting on someone happening to open
 * the dashboard. Best effort — the queue in /admin/payments/upi is the real
 * mechanism.
 */
async function notifyDesk(paymentId: string, memberName: string, reference: string): Promise<void> {
  const supabase = createAdminClient();

  const [{ data: settings }, { data: payment }] = await Promise.all([
    supabase.from('gym_settings').select('gym_name, whatsapp_phone, contact_phone').eq('id', true).maybeSingle(),
    supabase.from('payments').select('amount').eq('id', paymentId).maybeSingle(),
  ]);

  const deskNumber = settings?.whatsapp_phone ?? settings?.contact_phone;
  if (!deskNumber) return;

  const channel = isLiveChannel('WHATSAPP') ? 'WHATSAPP' : 'SMS';

  await dispatch({
    kind: 'CUSTOM',
    channel,
    recipient: deskNumber,
    subject: 'UPI payment awaiting confirmation',
    body:
      `${memberName} says they have paid ${formatCurrency(Number(payment?.amount ?? 0))} by UPI. ` +
      `Reference ${reference}. Check the bank SMS and confirm it in the admin dashboard.`,
    dedupeKey: `upi-desk:${paymentId}`,
    metadata: { payment_id: paymentId, reference },
  });
}
