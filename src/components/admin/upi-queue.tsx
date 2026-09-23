'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Clock, Copy, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ContactActions } from '@/components/contact-actions';
import { confirmUpiPayment, rejectUpiPayment } from '@/app/(admin)/admin/payments/actions';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';

export interface UpiQueueRow {
  id: string;
  amount: number;
  upi_reference: string | null;
  upi_reference_at: string | null;
  created_at: string;
  plan_name: string | null;
  member: { id: string; full_name: string; phone: string } | null;
}

/**
 * The UPI confirmation queue.
 *
 * One job: the staff member holds their bank SMS in one hand and this in the
 * other, matches the reference, and taps. The reference is the only thing that
 * has to be compared, so it is the largest thing on the card and is one tap to
 * copy.
 */
export function UpiQueue({ rows }: { rows: UpiQueueRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<UpiQueueRow | null>(null);
  const [reason, setReason] = useState('');

  function confirm(row: UpiQueueRow) {
    startTransition(async () => {
      const result = await confirmUpiPayment(row.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Confirmed.', { duration: 8000 });
      router.refresh();
    });
  }

  function reject() {
    if (!rejecting) return;
    const target = rejecting;
    startTransition(async () => {
      const result = await rejectUpiPayment(target.id, reason);
      setRejecting(null);
      setReason('');
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Marked as not received.');
      router.refresh();
    });
  }

  async function copyReference(reference: string) {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success('Reference copied.');
    } catch {
      toast.error('Could not copy.');
    }
  }

  return (
    <>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="gap-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5">
                <div className="min-w-0">
                  {row.member ? (
                    <Link href={`/admin/members/${row.member.id}`} className="font-semibold hover:underline">
                      {row.member.full_name}
                    </Link>
                  ) : (
                    <span className="font-semibold">Unknown member</span>
                  )}
                  <p className="text-muted-foreground tnum text-xs">
                    {row.member ? formatPhone(row.member.phone) : '—'} · {row.plan_name ?? 'Membership'}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Clock className="size-3" aria-hidden />
                    Reported {formatDateTime(row.upi_reference_at ?? row.created_at)}
                  </p>
                </div>
                <p className="tnum text-xl font-bold">{formatCurrency(Number(row.amount))}</p>
              </div>

              {/* The one thing the staff member has to compare. */}
              <div className="mx-5 flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">UPI reference the member reported</p>
                  <p className="truncate font-mono text-base font-bold tracking-wider">
                    {row.upi_reference ?? 'Not yet provided'}
                  </p>
                </div>
                {row.upi_reference ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy reference"
                    onClick={() => void copyReference(row.upi_reference!)}
                  >
                    <Copy aria-hidden />
                  </Button>
                ) : (
                  <Badge variant="muted">Waiting</Badge>
                )}
              </div>

              <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 px-5">
                {row.member ? (
                  <ContactActions phone={row.member.phone} name={row.member.full_name} />
                ) : (
                  <span />
                )}
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => setRejecting(row)}
                >
                  <X aria-hidden />
                  Not received
                </Button>
                <Button variant="success" disabled={pending || !row.upi_reference} onClick={() => confirm(row)}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  Confirm
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as not received?</DialogTitle>
            <DialogDescription>
              Use this when the reference does not appear on the gym&apos;s bank statement. Nothing is refunded —
              {' '}no money ever passed through this system. Call the member and sort it out with them directly.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="e.g. Reference not on the statement; member to re-check their app"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Mark as not received
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
