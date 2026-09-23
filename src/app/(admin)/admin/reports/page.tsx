import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/stat-card';
import { CategoryMix, MembershipMixChart, PaymentMethodChart, RevenueChart } from '@/components/admin/charts';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/utils';
import type { CategoryDistributionRow, DashboardStats, RevenueSeriesRow } from '@/types/database';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const RANGES = [6, 12, 24] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const [params] = await Promise.all([searchParams, requireStaff()]);
  const months = RANGES.includes(Number(params.months) as (typeof RANGES)[number]) ? Number(params.months) : 6;

  const supabase = await createReadOnlyServerSupabase();
  const [statsResult, seriesResult, categoryResult] = await Promise.all([
    supabase.rpc('fn_admin_dashboard_stats'),
    supabase.rpc('fn_revenue_series', { p_months: months }),
    supabase.rpc('fn_category_distribution'),
  ]);

  const stats = statsResult.data as unknown as DashboardStats | null;
  const series = (seriesResult.data as unknown as RevenueSeriesRow[] | null) ?? [];
  const categories = (categoryResult.data as unknown as CategoryDistributionRow[] | null) ?? [];

  const totals = series.reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenue),
      payments: acc.payments + Number(row.payment_count),
      cash: acc.cash + Number(row.cash_revenue),
      online: acc.online + Number(row.online_revenue),
      joined: acc.joined + Number(row.new_memberships),
      renewed: acc.renewed + Number(row.renewals),
    }),
    { revenue: 0, payments: 0, cash: 0, online: 0, joined: 0, renewed: 0 },
  );

  const averagePayment = totals.payments > 0 ? totals.revenue / totals.payments : 0;
  const renewalRate =
    totals.joined + totals.renewed > 0 ? (totals.renewed / (totals.joined + totals.renewed)) * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-6 md:py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">How the gym has been doing over the last {months} months.</p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <Button
              key={range}
              asChild
              size="sm"
              variant={months === range ? 'default' : 'outline'}
              className="rounded-full"
            >
              <Link href={`/admin/reports?months=${range}`}>{range}m</Link>
            </Button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Revenue, ${months}m`} value={formatCurrency(totals.revenue)} icon={<TrendingUp aria-hidden />} />
        <StatCard label="Average payment" value={formatCurrency(averagePayment)} hint={`${totals.payments} payments`} />
        <StatCard label="Renewal share" value={`${renewalRate.toFixed(0)}%`} hint={`${totals.renewed} renewals`} />
        <StatCard label="All time" value={formatCurrency(stats?.lifetime_revenue ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Every payment marked paid, by the month it was collected.</CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChart data={series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cash against online</CardTitle>
            <CardDescription>
              {formatCurrency(totals.cash)} at the desk · {formatCurrency(totals.online)} online.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethodChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New members and renewals</CardTitle>
            <CardDescription>
              {totals.joined} joined · {totals.renewed} renewed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MembershipMixChart data={series} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members by category</CardTitle>
          <CardDescription>Active and expiring memberships.</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryMix data={categories} />
        </CardContent>
      </Card>

      {/* The table view: the same numbers, readable without relying on colour. */}
      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Month by month</CardTitle>
              <CardDescription>The figures behind the charts.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/admin/export/payments?months=${months}`} download>
                <Download aria-hidden />
                Export CSV
              </a>
            </Button>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">Online</TableHead>
              <TableHead className="text-right">Payments</TableHead>
              <TableHead className="text-right">New</TableHead>
              <TableHead className="text-right">Renewals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((row) => (
              <TableRow key={row.bucket}>
                <TableCell className="font-medium whitespace-nowrap">{row.label}</TableCell>
                <TableCell className="tnum text-right font-semibold">{formatCurrency(Number(row.revenue))}</TableCell>
                <TableCell className="tnum text-right">{formatCurrency(Number(row.cash_revenue))}</TableCell>
                <TableCell className="tnum text-right">{formatCurrency(Number(row.online_revenue))}</TableCell>
                <TableCell className="tnum text-right">{row.payment_count}</TableCell>
                <TableCell className="tnum text-right">{row.new_memberships}</TableCell>
                <TableCell className="tnum text-right">{row.renewals}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
