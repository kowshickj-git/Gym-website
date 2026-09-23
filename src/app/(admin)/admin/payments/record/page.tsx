import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Info } from 'lucide-react';
import { CashPaymentForm, type PaymentFormMember, type PaymentFormPlan } from '@/components/admin/cash-payment-form';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Record a payment' };
export const dynamic = 'force-dynamic';

export default async function RecordPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const [{ member: preselected }] = await Promise.all([searchParams, requireStaff()]);
  const supabase = await createReadOnlyServerSupabase();

  const [{ data: directory }, { data: plans }] = await Promise.all([
    supabase
      .from('member_directory')
      .select('id, full_name, phone, expiry_date, plan_name')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('membership_plans')
      .select('id, name, duration_months, base_price, membership_categories(name)')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  const members: PaymentFormMember[] = (directory ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    expiry_date: row.expiry_date,
    plan_name: row.plan_name,
  }));

  const planOptions: PaymentFormPlan[] = (plans ?? []).map((plan) => {
    const category = plan.membership_categories as unknown as { name: string } | { name: string }[] | null;
    const categoryName = Array.isArray(category) ? (category[0]?.name ?? '') : (category?.name ?? '');
    return {
      id: plan.id,
      name: plan.name,
      duration_months: plan.duration_months,
      base_price: Number(plan.base_price),
      category_name: categoryName,
    };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={preselected ? `/admin/members/${preselected}` : '/admin/payments'}>
          <ArrowLeft aria-hidden />
          Back
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Record a payment</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          For cash, UPI or card taken at the desk. The membership activates and a receipt is issued as soon as you save.
        </p>
      </header>

      {planOptions.length === 0 ? (
        <Alert variant="warning">
          <Info aria-hidden />
          <AlertDescription>
            There are no active plans yet.{' '}
            <Link href="/admin/plans" className="font-medium underline underline-offset-4">
              Add a plan
            </Link>{' '}
            before recording payments.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="py-5">
          <div className="px-5">
            <CashPaymentForm members={members} plans={planOptions} preselectedMemberId={preselected} />
          </div>
        </Card>
      )}
    </div>
  );
}
