import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ReceiptSheet } from '@/components/receipt-sheet';
import { PrintButton } from '@/components/print-button';
import { MemberBottomNav } from '@/components/member/bottom-nav';
import { requireMember } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import type { ReceiptSnapshot } from '@/types/database';

export const metadata: Metadata = {
  title: 'Receipt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { member }] = await Promise.all([params, requireMember()]);

  // RLS already limits this to the member's own receipts; the explicit filter
  // makes the intent obvious and keeps the query index-friendly.
  const supabase = await createReadOnlyServerSupabase();
  const { data: receipt } = await supabase
    .from('receipts')
    .select('id, receipt_number, snapshot, issued_at, member_id')
    .eq('id', id)
    .eq('member_id', member.id)
    .maybeSingle();

  if (!receipt) notFound();

  const snapshot = receipt.snapshot as unknown as ReceiptSnapshot;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-5">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/payments">
            <ArrowLeft aria-hidden />
            Payments
          </Link>
        </Button>
        <PrintButton />
      </div>

      <Alert variant="success" className="print:hidden">
        <CheckCircle2 aria-hidden />
        <AlertTitle>Payment complete</AlertTitle>
        <AlertDescription>
          Your membership is active until {snapshot.membership.expiry_date ? formatIso(snapshot.membership.expiry_date) : '—'}.
        </AlertDescription>
      </Alert>

      <ReceiptSheet snapshot={snapshot} />

      <div className="flex flex-col gap-2 print:hidden sm:flex-row">
        <Button asChild variant="outline" className="flex-1">
          <Link href="/dashboard">Back to my membership</Link>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/payments">All payments</Link>
        </Button>
      </div>

      <MemberBottomNav active="payments" />
    </div>
  );
}

function formatIso(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value}T12:00:00Z`));
}
