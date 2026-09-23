import { NextResponse, type NextRequest } from 'next/server';
import { settlePayment } from '@/lib/payments';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook.
 *
 * This is the authoritative activation path. The browser callback in
 * /api/payments/verify is a convenience so the member sees their receipt
 * immediately; this endpoint is what guarantees that a captured payment always
 * becomes a membership, even if the member closed the tab, lost signal, or the
 * browser call failed.
 *
 * Razorpay retries on a non-2xx, so anything we cannot process yet returns 500
 * and anything we deliberately ignore returns 200.
 */

interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        amount: number;
        status: string;
        error_description?: string;
      };
    };
    order?: { entity?: { id: string } };
  };
}

export async function POST(request: NextRequest) {
  if (!serverEnv.razorpayWebhookSecret) {
    console.error('[webhook] RAZORPAY_WEBHOOK_SECRET is not set; refusing to process');
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  // The signature covers the exact bytes Razorpay sent, so read the raw body.
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[webhook] rejected a request with an invalid signature');
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Malformed payload.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const entity = event.payload?.payment?.entity;

  try {
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const orderId = entity?.order_id ?? event.payload?.order?.entity?.id;
        if (!orderId) return NextResponse.json({ received: true, ignored: 'no order id' });

        const { data: payment } = await supabase
          .from('payments')
          .select('id, amount, status')
          .eq('razorpay_order_id', orderId)
          .maybeSingle();

        if (!payment) {
          // An order we never recorded. Acknowledge so Razorpay stops retrying,
          // but leave a loud trace for reconciliation.
          console.error('[webhook] captured payment for an unknown order', orderId);
          await recordAudit({
            action: 'WEBHOOK_UNKNOWN_ORDER',
            entity: 'payments',
            actorLabel: 'razorpay-webhook',
            after: { order_id: orderId, payment_id: entity?.id },
          });
          return NextResponse.json({ received: true, ignored: 'unknown order' });
        }

        if (payment.status === 'PAID') {
          return NextResponse.json({ received: true, alreadySettled: true });
        }

        const result = await settlePayment({
          paymentId: payment.id,
          razorpayPaymentId: entity?.id ?? null,
        });

        await recordAudit({
          action: 'WEBHOOK_PAYMENT_SETTLED',
          entity: 'payments',
          entityId: payment.id,
          actorLabel: 'razorpay-webhook',
          after: { membership_id: result.membership_id, receipt_number: result.receipt_number },
        });

        return NextResponse.json({ received: true, settled: !result.already_settled });
      }

      case 'payment.failed': {
        const orderId = entity?.order_id;
        if (!orderId) return NextResponse.json({ received: true });

        await supabase
          .from('payments')
          .update({
            status: 'FAILED',
            failure_reason: entity?.error_description?.slice(0, 300) ?? 'Payment failed at the gateway',
            razorpay_payment_id: entity?.id ?? null,
          })
          .eq('razorpay_order_id', orderId)
          .neq('status', 'PAID');

        return NextResponse.json({ received: true });
      }

      default:
        // Subscription, refund and settlement events are not used yet.
        return NextResponse.json({ received: true, ignored: event.event });
    }
  } catch (error) {
    // Returning 500 asks Razorpay to retry, which is what we want for a
    // transient database problem.
    console.error('[webhook] processing failed', event.event, error);
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 });
  }
}
