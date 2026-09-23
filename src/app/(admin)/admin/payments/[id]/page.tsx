import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReceiptSheet } from '@/components/receipt-sheet';
import { PrintButton } from '@/components/print-button';
import { ReverifyPaymentButton } from '@/components/admin/reverify-payment-button';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATE_LABEL } from '@/lib/constants';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { ReceiptSnapshot } from '@/types/database';

export const metadata: Metadata = { title: 'Payment' };
export const dynamic = 'force-dynamic';

export default async function AdminPaymentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recorded?: string }>;
}) {
  const [{ id }, { recorded }] = await Promise.all([params, searchParams, requireStaff()]);
  const supabase = await createReadOnlyServerSupabase();

  const { data: payment } = await supabase
    .from('payments')
    .select(
      'id, amount, base_amount, discount_amount, method, status, paid_at, created_at, notes, collected_by_name, coupon_code, razorpay_order_id, razorpay_payment_id, failure_reason, plan_snapshot, members(id, full_name, phone), receipts(id, receipt_number, snapshot), memberships(id, start_date, expiry_date, plan_name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!payment) notFound();

  const member = (Array.isArray(payment.members) ? payment.members[0] : payment.members) as
    | { id: string; full_name: string; phone: string }
    | undefined;
  const receipt = (Array.isArray(payment.receipts) ? payment.receipts[0] : payment.receipts) as
    | { id: string; receipt_number: string; snapshot: ReceiptSnapshot }
    | undefined;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-5 md:px-6 md:py-6">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/payments">
            <ArrowLeft aria-hidden />
            Payments
          </Link>
        </Button>
        {receipt ? <PrintButton /> : null}
      </div>

      {recorded ? (
        <Alert variant="success" className="print:hidden">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Payment recorded</AlertTitle>
          <AlertDescription>
            The membership is active and receipt {receipt?.receipt_number} has been issued.
            {member ? ' The member has been messaged a copy.' : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {receipt ? (
        <ReceiptSheet snapshot={receipt.snapshot} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Payment not completed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Badge variant={payment.status === 'FAILED' ? 'danger' : 'muted'}>
              {PAYMENT_STATE_LABEL[payment.status]}
            </Badge>
            <dl className="space-y-2">
              <Row label="Member" value={member?.full_name ?? '—'} />
              <Row label="Amount" value={formatCurrency(Number(payment.amount))} />
              <Row label="Method" value={PAYMENT_METHOD_LABEL[payment.method]} />
              <Row label="Started" value={formatDateTime(payment.created_at)} />
              {payment.failure_reason ? <Row label="Reason" value={payment.failure_reason} /> : null}
            </dl>
            <p className="text-muted-foreground text-pretty">
              No membership was created for this attempt. The webhook settles late payments on its own, but if the
              member says money left their account you can ask Razorpay directly right now.
            </p>
            {payment.razorpay_order_id ? <ReverifyPaymentButton paymentId={payment.id} /> : null}
          </CardContent>
        </Card>
      )}

      {/* Operational detail staff sometimes need, kept off the printed receipt. */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Internal detail</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            {member ? (
              <Row
                label="Member"
                value={`${member.full_name} · ${formatPhone(member.phone)}`}
                href={`/admin/members/${member.id}`}
              />
            ) : null}
            <Row label="Payment id" value={payment.id} mono />
            {payment.razorpay_order_id ? <Row label="Razorpay order" value={payment.razorpay_order_id} mono /> : null}
            {payment.razorpay_payment_id ? (
              <Row label="Razorpay payment" value={payment.razorpay_payment_id} mono />
            ) : null}
            {payment.coupon_code ? <Row label="Coupon used" value={payment.coupon_code} mono /> : null}
            {payment.collected_by_name ? <Row label="Collected by" value={payment.collected_by_name} /> : null}
            {payment.notes ? <Row label="Notes" value={payment.notes} /> : null}
            <Row label="Recorded" value={formatDateTime(payment.created_at)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  const body = (
    <span className={mono ? 'font-mono text-xs break-all' : 'text-right font-medium'}>{value}</span>
  );

  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {href ? (
        <Link href={href} className="text-primary inline-flex items-center gap-1 text-right font-medium hover:underline">
          {value}
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
