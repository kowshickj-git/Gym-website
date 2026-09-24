'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Search, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { EmptyState } from '@/components/ui/feedback';
import { MembershipStatusBadge } from '@/components/status-badge';
import { deleteMembers } from '@/app/(admin)/admin/members/actions';
import { formatCurrency } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { MembershipStatus } from '@/types/database';

export interface RemovableMember {
  id: string;
  full_name: string;
  phone: string;
  plan_name: string | null;
  membership_status: MembershipStatus | null;
  is_active: boolean;
  is_sample: boolean;
  payments: number;
  paid_total: number;
  receipts: number;
}

export function RemoveMembers({ members }: { members: RemovableMember[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    if (!term) return members;
    return members.filter(
      (m) => m.full_name.toLowerCase().includes(term) || (digits.length > 0 && m.phone.includes(digits)),
    );
  }, [members, query]);

  const chosen = members.filter((m) => selected.has(m.id));
  const totals = chosen.reduce(
    (acc, m) => ({
      payments: acc.payments + m.payments,
      paid: acc.paid + m.paid_total,
      receipts: acc.receipts + m.receipts,
    }),
    { payments: 0, paid: 0, receipts: 0 },
  );

  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const samples = members.filter((m) => m.is_sample);
  const deactivated = members.filter((m) => !m.is_active);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectOnly(group: RemovableMember[]) {
    setSelected(new Set(group.map((m) => m.id)));
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const m of visible) {
        if (allVisibleSelected) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMembers([...selected], typed);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.deleted === 1 ? 'Member deleted.' : `${result.deleted} members deleted.`);
      setSelected(new Set());
      setTyped('');
      setConfirming(false);
      router.refresh();
    });
  }

  if (members.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Trash2 aria-hidden />} title="No members" description="There is nobody to remove." />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------ Quick selection */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {samples.length > 0 ? (
          <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => selectOnly(samples)}>
            Select sample members ({samples.length})
          </Button>
        ) : null}
        {deactivated.length > 0 ? (
          <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => selectOnly(deactivated)}>
            Select deactivated ({deactivated.length})
          </Button>
        ) : null}
        {selected.size > 0 ? (
          <Button size="sm" variant="ghost" className="shrink-0 rounded-full" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        ) : null}
      </div>

      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or mobile number"
          className="pl-9"
          aria-label="Search members"
        />
      </div>

      <Card className="gap-0 py-0">
        <label className="flex items-center gap-3 border-b px-4 py-3 text-sm font-medium">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all shown" />
          {allVisibleSelected ? 'Unselect all shown' : `Select all shown (${visible.length})`}
        </label>

        {visible.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">No member matches “{query}”.</p>
        ) : (
          <ul className="divide-y">
            {visible.map((m) => (
              <li key={m.id}>
                <label className="hover:bg-accent/50 flex cursor-pointer items-start gap-3 px-4 py-3">
                  <Checkbox
                    checked={selected.has(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                    className="mt-0.5"
                    aria-label={`Select ${m.full_name}`}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{m.full_name}</span>
                      {m.is_sample ? <Badge variant="muted">Sample</Badge> : null}
                      {!m.is_active ? <Badge variant="warning">Deactivated</Badge> : null}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {formatPhone(m.phone)} · {m.plan_name ?? 'No plan'}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {m.payments === 0
                        ? 'No payments'
                        : `${m.payments} ${m.payments === 1 ? 'payment' : 'payments'} · ${formatCurrency(m.paid_total)} paid`}
                    </span>
                  </span>
                  <MembershipStatusBadge status={m.membership_status} showIcon={false} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------ Action bar */}
      {selected.size > 0 ? (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-xl md:border">
          <p className="text-sm">
            <span className="font-semibold">{selected.size} selected</span>
            {totals.payments > 0 ? (
              <span className="text-muted-foreground block text-xs">
                {totals.payments} {totals.payments === 1 ? 'payment' : 'payments'} · {formatCurrency(totals.paid)}
              </span>
            ) : null}
          </p>
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>
      ) : null}

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) setTyped('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size === 1 ? chosen[0]?.full_name : `${selected.size} members`} permanently?
            </DialogTitle>
            <DialogDescription>
              {totals.payments > 0
                ? `This also deletes ${totals.payments} ${totals.payments === 1 ? 'payment' : 'payments'} (${formatCurrency(totals.paid)}) and ${totals.receipts} ${totals.receipts === 1 ? 'receipt' : 'receipts'}, and that money disappears from your reports. `
                : 'They have no payments on record. '}
              This cannot be undone. To keep their history instead, deactivate them from their member page.
            </DialogDescription>
          </DialogHeader>

          {selected.size > 1 ? (
            <p className="text-muted-foreground text-xs">
              {chosen
                .slice(0, 6)
                .map((m) => m.full_name)
                .join(', ')}
              {chosen.length > 6 ? ` and ${chosen.length - 6} more` : ''}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="confirm-delete" className="text-sm font-medium">
              Type DELETE to confirm
            </label>
            <Input
              id="confirm-delete"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="DELETE"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep them
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending || typed.trim().toUpperCase() !== 'DELETE'}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
