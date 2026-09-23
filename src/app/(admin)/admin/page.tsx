import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  CalendarClock,
  IndianRupee,
  Plus,
  Receipt,
  Tag,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle, EmptyState } from '@/components/ui/feedback';
import { StatCard } from '@/components/stat-card';
import { CategoryMix, MembershipMixChart, PaymentMethodChart, RevenueChart } from '@/components/admin/charts';
import { ContactActions } from '@/components/contact-actions';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getGymSettings } from '@/lib/data';
import { isRazorpayConfigured } from '@/lib/env';
import { formatCurrency, formatDate, formatDaysRemaining, greeting, pluralise } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { CategoryDistributionRow, DashboardStats, MemberDirectoryRow, RevenueSeriesRow } from '@/types/database';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const user = await requireStaff();
  const supabase = await createReadOnlyServerSupabase();

  const [statsResult, seriesResult, categoryResult, expiringResult, settings] = await Promise.all([
    supabase.rpc('fn_admin_dashboard_stats'),
    supabase.rpc('fn_revenue_series', { p_months: 6 }),
    supabase.rpc('fn_category_distribution'),
    supabase
      .from('member_directory')
      .select('id, full_name, phone, plan_name, expiry_date, days_remaining, payment_status, weight_kg')
      .eq('membership_status', 'EXPIRING_SOON')
      .order('expiry_date', { ascending: true })
      .limit(5),
    getGymSettings(),
  ]);

  // UPI Direct has no gateway callback, so these sit until someone confirms
  // them. Surfacing the count here is what stops a member waiting all day.
  const { count: upiPending } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('method', 'UPI')
    .eq('status', 'PENDING')
    .not('upi_reference', 'is', null);

  const stats = (statsResult.data as unknown as DashboardStats | null) ?? null;
  const series = (seriesResult.data as unknown as RevenueSeriesRow[] | null) ?? [];
  const categories = (categoryResult.data as unknown as CategoryDistributionRow[] | null) ?? [];
  const expiring = (expiringResult.data ?? []) as Pick<
    MemberDirectoryRow,
    'id' | 'full_name' | 'phone' | 'plan_name' | 'expiry_date' | 'days_remaining' | 'payment_status' | 'weight_kg'
  >[];

  const revenueDelta =
    stats && stats.last_month_revenue > 0
      ? ((stats.monthly_revenue - stats.last_month_revenue) / stats.last_month_revenue) * 100
      : null;

  const firstName = (user.profile.full_name ?? 'there').split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-5 md:px-6 md:py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">{greeting()},</p>
          <h1 className="text-2xl font-bold tracking-tight">{firstName}</h1>
        </div>
        <p className="text-muted-foreground text-sm">{settings.gym_name}</p>
      </header>

      {!isRazorpayConfigured() && !settings.upi_enabled ? (
        <Alert variant="warning">
          <BadgeIndianRupee aria-hidden />
          <AlertTitle>Members cannot pay online yet</AlertTitle>
          <AlertDescription>
            <p>
              The quickest fix costs nothing:{' '}
              <Link href="/admin/settings" className="font-medium underline underline-offset-4">
                add your UPI id in Settings
              </Link>{' '}
              and members can pay you directly with no transaction fee. Adding Razorpay keys additionally enables card
              and netbanking. Cash at the desk works either way.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* -------------------------------------------------------- Quick actions */}
      <section aria-labelledby="quick-actions" className="space-y-2">
        <h2 id="quick-actions" className="sr-only">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickAction href="/admin/members/new" icon={<UserPlus aria-hidden />} label="Add member" primary />
          <QuickAction href="/admin/payments/record" icon={<Receipt aria-hidden />} label="Record payment" />
          {user.role === 'ADMIN' ? (
            <>
              <QuickAction href="/admin/offers/new" icon={<Tag aria-hidden />} label="Create offer" />
              <QuickAction href="/admin/plans" icon={<Plus aria-hidden />} label="Add plan" />
            </>
          ) : (
            <>
              <QuickAction href="/admin/expiring" icon={<CalendarClock aria-hidden />} label="Expiring" />
              <QuickAction href="/admin/members" icon={<Users aria-hidden />} label="Find member" />
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------- KPI row */}
      <section aria-labelledby="kpis" className="space-y-2">
        <h2 id="kpis" className="sr-only">
          Key numbers
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="Total members"
            value={String(stats?.total_members ?? 0)}
            hint={stats ? `${stats.new_members_this_month} joined this month` : undefined}
            icon={<Users aria-hidden />}
            href="/admin/members"
          />
          <StatCard
            label="Active"
            value={String(stats?.active_members ?? 0)}
            tone="success"
            icon={<Users aria-hidden />}
            href="/admin/members?status=ACTIVE"
          />
          <StatCard
            label="Expiring soon"
            value={String(stats?.expiring_soon ?? 0)}
            hint="Within 7 days"
            tone="warning"
            icon={<CalendarClock aria-hidden />}
            href="/admin/expiring"
          />
          <StatCard
            label="Expired"
            value={String(stats?.expired_members ?? 0)}
            tone="danger"
            icon={<XCircle aria-hidden />}
            href="/admin/expired"
          />
          <StatCard
            label="Today's collection"
            value={formatCurrency(stats?.todays_collection ?? 0)}
            hint={stats ? pluralise(stats.todays_payment_count, 'payment') : undefined}
            icon={<IndianRupee aria-hidden />}
            href="/admin/payments"
          />
          <StatCard
            label="This month"
            value={formatCurrency(stats?.monthly_revenue ?? 0)}
            delta={revenueDelta}
            deltaGood="up"
            hint="vs last month"
            icon={<BadgeIndianRupee aria-hidden />}
            href="/admin/reports"
          />
        </div>
      </section>

      {(upiPending ?? 0) > 0 ? (
        <Alert variant="info">
          <BadgeIndianRupee aria-hidden />
          <AlertTitle>
            {pluralise(upiPending ?? 0, 'UPI payment')} waiting for you to confirm
          </AlertTitle>
          <AlertDescription>
            Members have paid your UPI id and reported their reference. Check them against your bank SMS —{' '}
            <Link href="/admin/payments/upi" className="font-medium underline underline-offset-4">
              open the confirmation queue
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {stats && stats.unpaid_memberships > 0 ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <AlertTitle>{pluralise(stats.unpaid_memberships, 'membership')} with an outstanding fee</AlertTitle>
          <AlertDescription>
            <Link href="/admin/members?payment=UNPAID" className="font-medium underline underline-offset-4">
              Review unpaid memberships
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* -------------------------------------------------------------- Charts */}
      <section aria-labelledby="charts" className="grid gap-4 lg:grid-cols-2">
        <h2 id="charts" className="sr-only">
          Trends
        </h2>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue, last 6 months</CardTitle>
            <CardDescription>Every payment marked paid, cash and online together.</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How members pay</CardTitle>
            <CardDescription>Collections split by cash at the desk and online.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethodChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New members and renewals</CardTitle>
            <CardDescription>Memberships started each month.</CardDescription>
          </CardHeader>
          <CardContent>
            <MembershipMixChart data={series} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Members by category</CardTitle>
            <CardDescription>Active and expiring memberships only.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryMix data={categories} />
          </CardContent>
        </Card>
      </section>

      {/* ----------------------------------------------------- Expiring preview */}
      <section aria-labelledby="expiring" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="expiring" className="font-semibold">
            Expiring in the next 7 days
          </h2>
          <Button asChild variant="link" size="sm" className="h-auto p-0">
            <Link href="/admin/expiring">
              See all
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        <Card className="gap-0 py-0">
          {expiring.length === 0 ? (
            <EmptyState
              icon={<CalendarClock aria-hidden />}
              title="Nothing expiring this week"
              description="Members whose plans are within seven days of ending will show up here so you can call them."
              className="py-10"
            />
          ) : (
            <ul className="divide-y">
              {expiring.map((member) => (
                <li key={member.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/members/${member.id}`} className="truncate font-medium hover:underline">
                      {member.full_name}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {formatPhone(member.phone)} · {member.plan_name ?? 'No plan'}
                      {member.weight_kg ? ` · ${Number(member.weight_kg)} kg` : ''}
                    </p>
                    <p className="text-warning-foreground dark:text-warning text-xs font-medium">
                      {formatDaysRemaining(member.days_remaining)} · {formatDate(member.expiry_date)}
                    </p>
                  </div>
                  <ContactActions phone={member.phone} name={member.full_name} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  primary,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Button asChild variant={primary ? 'default' : 'outline'} className="h-auto flex-col gap-1.5 py-3.5">
      <Link href={href}>
        <span className="[&_svg]:size-5">{icon}</span>
        <span className="text-xs font-semibold">{label}</span>
      </Link>
    </Button>
  );
}
