'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cancelMembership } from '@/app/(admin)/admin/members/actions';

/**
 * Owner-only. Ends a membership early — the member left, or it was recorded by
 * mistake. The row is kept and marked CANCELLED, so the history and receipt
 * stay intact; nothing is refunded, because no money moves through here.
 */
export function CancelMembershipButton({
  membershipId,
  planName,
  memberName,
}: {
  membershipId: string;
  planName: string;
  memberName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await cancelMembership(membershipId, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Membership cancelled.');
      setOpen(false);
      setReason('');
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        <Ban aria-hidden />
        Cancel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {memberName}&apos;s membership?</DialogTitle>
            <DialogDescription>
              {planName} ends today. It stays in their history and their receipt is unchanged. Nothing is refunded
              {' '}by this — if money is owed back, settle that with them directly.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why? e.g. Moved away; recorded against the wrong member"
            aria-label="Reason for cancelling"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep membership
            </Button>
            <Button variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Cancel membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
