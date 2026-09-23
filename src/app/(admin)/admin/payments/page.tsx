import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Receipt as ReceiptIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/admin/pagination';
import { StatCard } from '@/components/stat-card';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { PAGE_SIZE, PAYMENT_METHOD_LABEL, PAYMENT_STATE_LABEL } from '@/lib/constants';
import { formatCurrency, formatDateTime, pluralise, todayInIst } from '@/lib/utils';
import type { DashboardStats, PaymentMethod, PaymentState } from '@/types/database';

export const metadata: Metadata = { title: 'Payments' };
export const dynamic = 'force-dynamic';

const METHOD_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'ONLINE', label: 'Online' },
] as const;

const STATUS_TABS = [
  { value: 'PAID', label: 'Paid' },
  { value: 'ALL', label: 'Everything' },
  { value: 'FAILED', label: 'Failed' },
] as const;

interface PaymentRow {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentState;
  paid_at: string | null;
  created_at: string;
  notes: string | null;
  collected_by_name: string | null;
  plan_snapshot: { plan_name?: string } | null;
  members: { id: string; full_name: string; phone: string } | null;
  receipts: { id: string; receipt_number: string } | null;
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; method?: string; status?: string; from?: string; to?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requireStaff()]);

  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const method = params.method ?? 'ALL';
  const status = params.status ?? 'PAID';
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createReadOnlyServerSupabase();

  let query = supabase
    .from('payments')
    .select(
      'id, amount, method, status, paid_at, created_at, notes, collected_by_name, plan_snapshot, members(id, full_name, phone), receipts(id, receipt_number)',
      { count: 'exact' },
    );

  if (status !== 'ALL') query = query.eq('status', status as PaymentState);
  if (method !== 'ALL') query = query.eq('method', method as PaymentMethod);
  if (params.from) query = query.gte('created_at', `${params.from}T00:00:00`);
  if (params.to) query = query.lte('created_at', `${params.to}T23:59:59`);

  const [{ data, count }, statsResult] = await Promise.all([
    query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1),
    supabase.rpc('fn_admin_dashboard_stats'),
  ]);

  const payments = (data ?? []) as unknown as PaymentRow[];
  const total = count ?? 0;
  const stats = statsResult.data as unknown as DashboardStats | null;

  const buildHref = (updates: Record<string, string>) => {
    const next = new URLSearchParams();
    if (method !== 'ALL') next.set('method', method);
    if (status !== 'PAID') next.set('status', status);
    if (params.from) next.set('from', params.from);
    if (params.to) next.set('to', params.to);
    for (const [key, value] of Object.entries(updates)) {
      if (value === 'ALL' && key === 'method') next.delete(key);
      else if (value === 'PAID' && key === 'status') next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `/admin/payments?${query}` : '/admin/payments';
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground text-sm">{pluralise(total, 'payment')} matching</p>
        </div>
        <Button asChild>
          <Link href="/admin/payments/record">
            <ReceiptIcon aria-hidden />
            Record payment
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today" value={formatCurrency(stats?.todays_collection ?? 0)} hint={todayInIst()} />
        <StatCard label="This month" value={formatCurrency(stats?.monthly_revenue ?? 0)} />
        <StatCard label="Last month" value={formatCurrency(stats?.last_month_revenue ?? 0)} />
        <StatCard label="All time" value={formatCurrency(stats?.lifetime_revenue ?? 0)} />
      </div>

      <div className="space-y-2">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {METHOD_TABS.map((tab) => (
            <Button
              key={tab.value}
              asChild
              size="sm"
              variant={method === tab.value ? 'default' : 'outline'}
              className="shrink-0 rounded-full"
            >
              <Link href={buildHref({ method: tab.value })}>{tab.label}</Link>
            </Button>
          ))}
          <span className="bg-border mx-1 w-px shrink-0" aria-hidden />
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              asChild
              size="sm"
              variant={status === tab.value ? 'default' : 'outline'}
              className="shrink-0 rounded-full"
            >
              <Link href={buildHref({ status: tab.value })}>{tab.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      {payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReceiptIcon aria-hidden />}
            title="No payments here"
            description="Try a different filter, or record the first payment at the desk."
            action={
              <Button asChild>
                <Link href="/admin/payments/record">Record a payment</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2 lg:hidden">
            {payments.map((payment) => (
              <li key={payment.id}>
                <Link href={`/admin/payments/${payment.id}`}>
                  <Card className="hover:border-primary/40 gap-2 py-4 transition-colors">
                    <div className="flex items-start justify-between gap-3 px-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{payment.members?.full_name ?? 'Unknown member'}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {payment.plan_snapshot?.plan_name ?? 'Membership'} · {PAYMENT_METHOD_LABEL[payment.method]}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(payment.paid_at ?? payment.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum font-bold">{formatCurrency(Number(payment.amount))}</p>
                        {payment.status === 'PAID' ? (
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {payment.receipts?.receipt_number ?? 'Paid'}
                          </span>
                        ) : (
                          <Badge variant={payment.status === 'FAILED' ? 'danger' : 'muted'}>
                            {PAYMENT_STATE_LABEL[payment.status]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Card className="hidden gap-0 py-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Collected by</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(payment.paid_at ?? payment.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {payment.members ? (
                        <Link href={`/admin/members/${payment.members.id}`} className="hover:underline">
                          {payment.members.full_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{payment.plan_snapshot?.plan_name ?? '—'}</TableCell>
                    <TableCell>{PAYMENT_METHOD_LABEL[payment.method]}</TableCell>
                    <TableCell className="text-muted-foreground">{payment.collected_by_name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{payment.receipts?.receipt_number ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          payment.status === 'PAID' ? 'success' : payment.status === 'FAILED' ? 'danger' : 'muted'
                        }
                      >
                        {PAYMENT_STATE_LABEL[payment.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="tnum text-right font-semibold">
                      {formatCurrency(Number(payment.amount))}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="icon-sm" aria-label="Open payment">
                        <Link href={`/admin/payments/${payment.id}`}>
                          <ChevronRight aria-hidden />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Pagination page={page} total={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
