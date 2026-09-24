'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Plus, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/misc';
import { SubmitButton } from '@/components/submit-button';
import {
  inviteStaff,
  setStaffActive,
  setStaffCanTakePayments,
  type SettingsState,
} from '@/app/(admin)/admin/settings/actions';
import { formatDate } from '@/lib/utils';
import type { UserRole } from '@/types/database';

interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  can_take_payments: boolean;
}

export function StaffManager({ staff, currentUserId }: { staff: StaffRow[]; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function togglePayments(row: StaffRow) {
    startTransition(async () => {
      const result = await setStaffCanTakePayments(row.id, !row.can_take_payments);
      if (result.error) toast.error(result.error);
      else toast.success(row.can_take_payments ? 'They can no longer take payments.' : 'They can now take payments.');
    });
  }

  function toggle(row: StaffRow) {
    startTransition(async () => {
      const result = await setStaffActive(row.id, !row.is_active);
      if (result.error) toast.error(result.error);
      else toast.success(row.is_active ? 'Account deactivated.' : 'Account reactivated.');
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {staff.map((row) => (
          <li key={row.id} className="flex items-center gap-3 p-4">
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold">{row.full_name ?? row.email}</p>
                <Badge variant={row.role === 'ADMIN' ? 'default' : 'secondary'}>
                  {row.role === 'ADMIN' ? 'Owner' : 'Staff'}
                </Badge>
                {row.id === currentUserId ? <Badge variant="outline">You</Badge> : null}
              </div>
              <p className="text-muted-foreground truncate text-xs">{row.email}</p>
              <p className="text-muted-foreground text-xs">Added {formatDate(row.created_at)}</p>
              {row.role === 'STAFF' ? (
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <Switch
                    checked={row.can_take_payments}
                    onCheckedChange={() => togglePayments(row)}
                    disabled={pending || !row.is_active}
                  />
                  Can take payments
                </label>
              ) : null}
            </div>
            <Switch
              checked={row.is_active}
              onCheckedChange={() => toggle(row)}
              disabled={pending || row.id === currentUserId}
              aria-label={`${row.is_active ? 'Deactivate' : 'Activate'} ${row.full_name ?? row.email}`}
            />
          </li>
        ))}
      </ul>

      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add a staff account
      </Button>

      <InviteDialog key={open ? 'open' : 'closed'} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(inviteStaff, {});
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (state.success) {
      toast.success('Staff account created. Share the temporary password with them directly.');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a staff account</DialogTitle>
          <DialogDescription>
            They sign in with this email and the temporary password you set. Tell them the password in person — it is
            not emailed anywhere.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-name">Name</Label>
            <Input id="staff-name" name="display_name" required placeholder="e.g. Suresh at the front desk" />
            {state.fieldErrors?.display_name ? (
              <p className="text-destructive text-xs">{state.fieldErrors.display_name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input id="staff-email" name="email" type="email" required placeholder="name@yourgym.com" />
            {state.fieldErrors?.email ? <p className="text-destructive text-xs">{state.fieldErrors.email}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-password">Temporary password</Label>
            <Input
              id="staff-password"
              name="temporary_password"
              type="text"
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
              autoComplete="off"
            />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">Ask them to change it after their first sign-in.</p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => setPassword(randomPassword())}
              >
                Generate
              </Button>
            </div>
            {state.fieldErrors?.temporary_password ? (
              <p className="text-destructive text-xs">{state.fieldErrors.temporary_password}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-role">Role</Label>
            <select
              id="staff-role"
              name="role"
              defaultValue="STAFF"
              className="border-input h-11 w-full rounded-lg border bg-transparent px-3 text-base md:text-sm"
            >
              <option value="STAFF">Staff — members and payments</option>
              <option value="ADMIN">Owner — everything, including pricing</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-designation">Designation</Label>
            <Input id="staff-designation" name="designation" placeholder="e.g. Front desk, Trainer" />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <Label htmlFor="can_collect_cash">Can take payments</Label>
            <Switch id="can_collect_cash" name="can_collect_cash" defaultChecked />
          </div>

          {state.error ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Readable but unguessable: the owner has to read this out loud. */
function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}
