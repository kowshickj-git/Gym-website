import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CreditCard,
  Receipt as ReceiptIcon,
  Scale,
  Tag,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, EmptyState } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/misc';
import { MemberBottomNav } from '@/components/member/bottom-nav';
import { MembershipStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { requireMember } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getCurrentMembership, getGymSettings, getOffersWithRules } from '@/lib/data';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import { cn, daysUntil, formatCurrency, formatDate, formatDaysRemaining, greeting } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'My membership',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function MemberDashboard() {
  const { member } = await requireMember();
  const supabase = await createReadOnlyServerSupabase();

  const [settings, membership, offers, recentPayments] = await Promise.all([
    getGymSettings(),
    getCurrentMembership(member.id),
    getOffersWithRules(),
    supabase
      .from('payments')
      .select('id, amount, method, paid_at, status, plan_snapshot, receipts(id, receipt_number)')
      .eq('member_id', member.id)
      .eq('status', 'PAID')
      .order('paid_at', { ascending: false })
      .limit(3)
      .then((result) => result.data ?? []),
  ]);

  const remaining = membership ? daysUntil(membership.expiry_date) : null;
  const isExpired = remaining !== null && remaining < 0;
  const isExpiring = remaining !== null && remaining >= 0 && remaining <= 7;
  const firstName = member.full_name.trim().split(/\s+/)[0];

  // Progress through the current term, for the ring on the membership card.
  const totalDays =
    membership && membership.start_date
      ? Math.max(
          1,
          Math.round(
            (new Date(`${membership.expiry_date}T12:00:00Z`).getTime() -
              new Date(`${membership.start_date}T12:00:00Z`).getTime()) /
              86_400_000,
          ),
        )
      : null;
  const elapsedPercent =
    totalDays && remaining !== null ? Math.min(100, Math.max(0, ((totalDays - remaining) / totalDays) * 100)) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      <header className="space-y-0.5">
        <p className="text-muted-foreground text-sm">{greeting()},</p>
        <h1 className="text-2xl font-bold tracking-tight">{firstName}</h1>
      </header>

      {isExpired ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>Your membership has expired</AlertTitle>
          <AlertDescription>
            It ended on {formatDate(membership!.expiry_date)}. Renew now to get straight back on the floor.
          </AlertDescription>
        </Alert>
      ) : null}

      {isExpiring ? (
        <Alert variant="warning">
          <CalendarClock aria-hidden />
          <AlertTitle>{formatDaysRemaining(remaining)}</AlertTitle>
          <AlertDescription>
            Renew before {formatDate(membership!.expiry_date)} to keep training without a break.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* -------------------------------------------------- Membership card */}
      {membership ? (
        <Card className="gap-4 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5">
            <div className="min-w-0 space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Current membership</p>
              <p className="truncate text-xl font-bold">{membership.category_name}</p>
              <p className="text-muted-foreground text-sm">
                {membership.plan_name} · {membership.duration_months}{' '}
                {membership.duration_months === 1 ? 'month' : 'months'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <MembershipStatusBadge status={membership.status} />
              <PaymentStatusBadge status={membership.payment_status} />
            </div>
          </div>

          <div className="px-5">
            <div
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(elapsedPercent)}
              aria-label="Membership term used"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width]',
                  isExpired ? 'bg-destructive' : isExpiring ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${elapsedPercent}%` }}
              />
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
              <span>{formatDate(membership.start_date)}</span>
              <span className={cn('font-semibold', isExpired ? 'text-destructive' : 'text-foreground')}>
                {formatDaysRemaining(remaining)}
              </span>
              <span>{formatDate(membership.expiry_date)}</span>
            </div>
          </div>

          <Separator />

          <dl className="grid grid-cols-2 gap-4 px-5 sm:grid-cols-4">
            <Metric label="Expires on" value={formatDate(membership.expiry_date)} />
            <Metric label="Paid" value={formatCurrency(Number(membership.final_amount))} />
            <Metric
              label="Your weight"
              value={member.weight_kg ? `${Number(member.weight_kg)} kg` : 'Not recorded'}
              icon={<Scale className="size-3.5" aria-hidden />}
            />
            <Metric label="Member since" value={formatDate(member.join_date)} />
          </dl>

          <div className="px-5">
            <Button asChild size="lg" className="w-full">
              <Link href="/plans">
                {isExpired ? 'Renew membership' : 'Renew or upgrade'}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<Tag aria-hidden />}
            title="No active membership"
            description={`You are registered at ${settings.gym_name} but do not have a plan yet. Pick one to get started.`}
            action={
              <Button asChild size="lg">
                <Link href="/plans">
                  Choose a plan
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
        </Card>
      )}

      {/* ------------------------------------------------------- Live offers */}
      {offers.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Offers for you</h2>
            <Button asChild variant="link" size="sm" className="h-auto p-0">
              <Link href="/offers">See all</Link>
            </Button>
          </div>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {offers.slice(0, 5).map((offer) => (
              <Link
                key={offer.id}
                href="/plans"
                className="focus-visible:ring-ring/50 w-64 shrink-0 snap-start rounded-xl outline-none focus-visible:ring-[3px]"
              >
                <Card className="hover:border-primary/40 h-full gap-2 py-4 transition-colors">
                  <div className="space-y-1.5 px-4">
                    <Badge variant="success" className="gap-1">
                      <Tag className="size-3" aria-hidden />
                      {offer.discount_type === 'PERCENTAGE'
                        ? `${Number(offer.discount_value)}% off`
                        : `${formatCurrency(Number(offer.discount_value))} off`}
                    </Badge>
                    <p className="font-semibold">{offer.name}</p>
                    <p className="text-muted-foreground line-clamp-2 text-xs text-pretty">
                      {offer.description ?? `Valid until ${formatDate(offer.ends_at)}`}
                    </p>
                    {offer.coupon_code ? (
                      <p className="text-muted-foreground text-xs">
                        Code <span className="text-foreground font-mono font-semibold">{offer.coupon_code}</span>
                      </p>
                    ) : null}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------- Recent payments */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent payments</h2>
          <Button asChild variant="link" size="sm" className="h-auto p-0">
            <Link href="/payments">See all</Link>
          </Button>
        </div>

        <Card className="gap-0 py-0">
          {recentPayments.length === 0 ? (
            <EmptyState
              icon={<CreditCard aria-hidden />}
              title="No payments yet"
              description="Your receipts will appear here after your first payment."
              className="py-10"
            />
          ) : (
            <ul className="divide-y">
              {recentPayments.map((payment) => {
                const receipt = Array.isArray(payment.receipts) ? payment.receipts[0] : payment.receipts;
                const snapshot = payment.plan_snapshot as { plan_name?: string; category_name?: string } | null;

                return (
                  <li key={payment.id} className="flex items-center gap-3 p-4">
                    <span className="bg-success/10 text-success flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <ReceiptIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {snapshot?.plan_name ?? 'Membership'}
                        {snapshot?.category_name ? ` · ${snapshot.category_name}` : ''}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(payment.paid_at)} · {PAYMENT_METHOD_LABEL[payment.method]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-semibold">{formatCurrency(Number(payment.amount))}</p>
                      {receipt ? (
                        <Link
                          href={`/receipts/${receipt.id}`}
                          className="text-primary text-xs font-medium hover:underline"
                        >
                          Receipt
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <MemberBottomNav active="home" />
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground flex items-center gap-1 text-xs">
        {icon}
        {label}
      </dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}
