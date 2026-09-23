import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CreditCard, Receipt as ReceiptIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { MemberBottomNav } from '@/components/member/bottom-nav';
import { requireMember } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { PAGE_SIZE, PAYMENT_METHOD_LABEL, PAYMENT_STATE_LABEL } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Payments and receipts',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function MemberPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ page: pageParam }, { member }] = await Promise.all([searchParams, requireMember()]);
  const page = Math.max(1, Number(pageParam ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createReadOnlyServerSupabase();
  const { data: payments, count } = await supabase
    .from('payments')
    .select('id, amount, base_amount, discount_amount, method, status, paid_at, created_at, plan_snapshot, receipts(id, receipt_number)', {
      count: 'exact',
    })
    .eq('member_id', member.id)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasMore = from + PAGE_SIZE < total;
  const paidTotal = (payments ?? [])
    .filter((payment) => payment.status === 'PAID')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground text-sm">
          Every payment on your account, with a receipt you can print or save.
        </p>
      </header>

      {total > 0 ? (
        <Card className="gap-1 py-4">
          <div className="px-5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Paid on this page</p>
            <p className="tnum text-2xl font-bold">{formatCurrency(paidTotal)}</p>
          </div>
        </Card>
      ) : null}

      <Card className="gap-0 py-0">
        {!payments?.length ? (
          <EmptyState
            icon={<CreditCard aria-hidden />}
            title="No payments yet"
            description="Once you buy a membership — online or at the desk — the payment and its receipt appear here."
            action={
              <Button asChild>
                <Link href="/plans">
                  See plans
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {payments.map((payment) => {
              const receipt = Array.isArray(payment.receipts) ? payment.receipts[0] : payment.receipts;
              const snapshot = payment.plan_snapshot as { plan_name?: string; category_name?: string } | null;
              const isPaid = payment.status === 'PAID';

              return (
                <li key={payment.id} className="flex items-start gap-3 p-4">
                  <span
                    className={
                      isPaid
                        ? 'bg-success/10 text-success flex size-10 shrink-0 items-center justify-center rounded-lg'
                        : 'bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg'
                    }
                  >
                    <ReceiptIcon className="size-4.5" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-semibold">{snapshot?.plan_name ?? 'Membership'}</p>
                    {snapshot?.category_name ? (
                      <p className="text-muted-foreground truncate text-xs">{snapshot.category_name}</p>
                    ) : null}
                    <p className="text-muted-foreground text-xs">
                      {formatDate(payment.paid_at ?? payment.created_at)} · {PAYMENT_METHOD_LABEL[payment.method]}
                    </p>
                    {payment.discount_amount > 0 ? (
                      <p className="text-success text-xs">
                        Saved {formatCurrency(Number(payment.discount_amount))} on{' '}
                        {formatCurrency(Number(payment.base_amount))}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="tnum text-sm font-bold">{formatCurrency(Number(payment.amount))}</p>
                    {isPaid ? (
                      receipt ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/receipts/${receipt.id}`}>Receipt</Link>
                        </Button>
                      ) : (
                        <Badge variant="success">Paid</Badge>
                      )
                    ) : (
                      <Badge variant={payment.status === 'FAILED' ? 'danger' : 'muted'}>
                        {PAYMENT_STATE_LABEL[payment.status]}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm" disabled={page === 1}>
            <Link href={`/payments?page=${page - 1}`} aria-disabled={page === 1}>
              Previous
            </Link>
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <Button asChild variant="outline" size="sm" disabled={!hasMore}>
            <Link href={`/payments?page=${page + 1}`} aria-disabled={!hasMore}>
              Next
            </Link>
          </Button>
        </div>
      ) : null}

      <MemberBottomNav active="payments" />
    </div>
  );
}
