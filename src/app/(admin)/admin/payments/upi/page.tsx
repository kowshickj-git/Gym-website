import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BadgeIndianRupee, Info } from 'lucide-react';
import { Alert, AlertDescription, EmptyState } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UpiQueue, type UpiQueueRow } from '@/components/admin/upi-queue';
import { canTakePayments, requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getGymSettings } from '@/lib/data';
import { pluralise } from '@/lib/utils';

export const metadata: Metadata = { title: 'UPI confirmations' };
export const dynamic = 'force-dynamic';

export default async function UpiQueuePage() {
  const [settings, staff] = await Promise.all([getGymSettings(), requireStaff()]);
  const canDecide = await canTakePayments(staff);
  const supabase = await createReadOnlyServerSupabase();

  const { data } = await supabase
    .from('payments')
    .select('id, amount, upi_reference, upi_reference_at, created_at, plan_snapshot, members(id, full_name, phone)')
    .eq('method', 'UPI')
    .eq('status', 'PENDING')
    .not('upi_reference', 'is', null)
    .order('upi_reference_at', { ascending: true })
    .limit(100);

  const rows: UpiQueueRow[] = (data ?? []).map((payment) => {
    const member = (Array.isArray(payment.members) ? payment.members[0] : payment.members) as
      | { id: string; full_name: string; phone: string }
      | undefined;
    const snapshot = payment.plan_snapshot as { plan_name?: string } | null;

    return {
      id: payment.id,
      amount: Number(payment.amount),
      upi_reference: payment.upi_reference,
      upi_reference_at: payment.upi_reference_at,
      created_at: payment.created_at,
      plan_name: snapshot?.plan_name ?? null,
      member: member ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/payments">
          <ArrowLeft aria-hidden />
          Payments
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">UPI confirmations</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {rows.length > 0
            ? `${pluralise(rows.length, 'payment')} waiting. Check each reference against your bank SMS, then confirm.`
            : 'Members who pay by UPI appear here for you to confirm against the bank.'}
        </p>
      </header>

      {!settings.upi_enabled || !settings.upi_vpa ? (
        <Alert variant="warning">
          <Info aria-hidden />
          <AlertDescription>
            <p>
              UPI payments are switched off, so nothing new will arrive here.{' '}
              <Link href="/admin/settings" className="font-medium underline underline-offset-4">
                Add your UPI id in Settings
              </Link>{' '}
              to let members pay you directly with no transaction fee.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BadgeIndianRupee aria-hidden />}
            title="Nothing waiting"
            description="When a member pays by UPI and reports their reference number, it lands here. Confirming it activates their membership and issues the receipt."
          />
        </Card>
      ) : (
        <>
          <Alert variant="info">
            <Info aria-hidden />
            <AlertDescription>
              The money goes straight into the gym&apos;s bank account, so this system never sees it. Confirm only what
              you can see on your own statement.
            </AlertDescription>
          </Alert>

          <UpiQueue rows={rows} canDecide={canDecide} />
        </>
      )}
    </div>
  );
}
