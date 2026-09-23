import { Separator } from '@/components/ui/misc';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { ReceiptSnapshot } from '@/types/database';

/**
 * The printable receipt.
 *
 * Rendered from the immutable snapshot stored at payment time, never from live
 * tables — a receipt must keep saying what it said on the day it was issued,
 * even after prices change or a plan is renamed.
 */
export function ReceiptSheet({ snapshot }: { snapshot: ReceiptSnapshot }) {
  const { gym, member, membership, payment } = snapshot;

  return (
    <article className="print-sheet bg-card mx-auto max-w-lg rounded-xl border p-6 shadow-sm print:max-w-none">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-bold">{gym.name}</h1>
          {gym.address ? <p className="text-muted-foreground mt-1 text-xs text-pretty">{gym.address}</p> : null}
          {gym.phone ? <p className="text-muted-foreground text-xs">{formatPhone(gym.phone)}</p> : null}
          {gym.gstin ? <p className="text-muted-foreground text-xs">GSTIN {gym.gstin}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">Receipt</p>
          <p className="font-mono text-sm font-bold">{snapshot.receipt_number}</p>
          <p className="text-muted-foreground text-xs">{formatDate(snapshot.issued_at)}</p>
        </div>
      </header>

      <Separator className="my-4" />

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">Member</p>
          <p className="font-semibold">{member.name}</p>
          <p className="text-muted-foreground text-xs">{formatPhone(member.phone)}</p>
          {member.email ? <p className="text-muted-foreground text-xs break-all">{member.email}</p> : null}
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">Membership</p>
          <p className="font-semibold">{membership.category_name}</p>
          <p className="text-muted-foreground text-xs">
            {membership.plan_name} · {membership.duration_months}{' '}
            {membership.duration_months === 1 ? 'month' : 'months'}
          </p>
        </div>
      </section>

      <Separator className="my-4" />

      <section className="space-y-2 text-sm">
        <Row label="Valid from" value={formatDate(membership.start_date)} />
        <Row label="Valid until" value={formatDate(membership.expiry_date)} />
      </section>

      <Separator className="my-4" />

      <section className="space-y-2 text-sm">
        <Row label="Plan price" value={formatCurrency(Number(payment.base_amount))} />
        {Number(payment.discount_amount) > 0 ? (
          <Row
            label={payment.offer_name ? `Discount — ${payment.offer_name}` : 'Discount'}
            value={`− ${formatCurrency(Number(payment.discount_amount))}`}
            tone="success"
          />
        ) : null}
        <Separator />
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Amount paid</span>
          <span className="tnum text-xl font-bold">{formatCurrency(Number(payment.amount))}</span>
        </div>
      </section>

      <Separator className="my-4" />

      <section className="space-y-2 text-sm">
        <Row label="Payment method" value={PAYMENT_METHOD_LABEL[payment.method] ?? payment.method} />
        <Row label="Reference" value={payment.reference} mono />
        <Row label="Paid on" value={formatDateTime(payment.paid_at)} />
        {payment.collected_by ? <Row label="Collected by" value={payment.collected_by} /> : null}
      </section>

      {gym.terms ? (
        <>
          <Separator className="my-4" />
          <p className="text-muted-foreground text-[11px] leading-relaxed text-pretty">{gym.terms}</p>
        </>
      ) : null}

      <p className="text-muted-foreground mt-4 text-center text-[11px]">
        This is a computer-generated receipt and does not require a signature.
      </p>
    </article>
  );
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'success';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={[
          'tnum text-right font-medium',
          mono ? 'font-mono text-xs break-all' : '',
          tone === 'success' ? 'text-success' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
    </div>
  );
}
