'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { setMemberActive } from '@/app/(admin)/admin/members/actions';

/**
 * Deactivate / reactivate. Deliberately behind a confirmation and kept at the
 * bottom of the page — it is the one destructive-looking action here, even
 * though nothing is deleted.
 */
export function MemberStatusToggle({ memberId, isActive }: { memberId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: boolean) {
    startTransition(async () => {
      const result = await setMemberActive(memberId, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? 'Member reactivated.' : 'Member deactivated.');
      router.refresh();
    });
  }

  return (
    <Card className="gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5">
        <div>
          <p className="text-sm font-semibold">{isActive ? 'Deactivate member' : 'Reactivate member'}</p>
          <p className="text-muted-foreground text-sm text-pretty">
            {isActive
              ? 'Takes them off the active lists. Payments, memberships and receipts are all kept.'
              : 'Puts them back on the active lists.'}
          </p>
        </div>

        {isActive ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-destructive" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserMinus aria-hidden />}
                Deactivate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deactivate this member?</DialogTitle>
                <DialogDescription>
                  They will stop appearing in the active member list and the expiry reminders. Nothing is deleted, and
                  you can reactivate them at any time.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={() => apply(false)}>
                    Deactivate
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button variant="outline" onClick={() => apply(true)} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
            Reactivate
          </Button>
        )}
      </div>
    </Card>
  );
}
