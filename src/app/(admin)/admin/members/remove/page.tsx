import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { RemoveMembers, type RemovableMember } from '@/components/admin/remove-members';
import { requireAdmin } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { isDemoPhone } from '@/lib/phone';
import type { MembershipStatus } from '@/types/database';

export const metadata: Metadata = { title: 'Remove members' };
export const dynamic = 'force-dynamic';

/** Owner-only: pick members and delete them, with everything they own. */
export default async function RemoveMembersPage() {
  await requireAdmin();
  const supabase = await createReadOnlyServerSupabase();

  const [{ data: directory }, { data: payments }, { data: receipts }] = await Promise.all([
    supabase
      .from('member_directory')
      .select('id, full_name, phone, plan_name, membership_status, is_active')
      .order('full_name'),
    supabase.from('payments').select('member_id, amount, status'),
    supabase.from('receipts').select('member_id'),
  ]);

  const members: RemovableMember[] = (directory ?? []).map((row) => {
    const theirs = (payments ?? []).filter((p) => p.member_id === row.id);
    return {
      id: row.id,
      full_name: row.full_name,
      phone: row.phone,
      plan_name: row.plan_name,
      membership_status: row.membership_status as MembershipStatus | null,
      is_active: row.is_active,
      is_sample: isDemoPhone(row.phone),
      payments: theirs.length,
      paid_total: theirs.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + Number(p.amount), 0),
      receipts: (receipts ?? []).filter((r) => r.member_id === row.id).length,
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/members">
          <ArrowLeft aria-hidden />
          Members
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Remove members</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Tick the members to delete, then press Delete at the bottom.
        </p>
      </header>

      <Alert variant="warning">
        <AlertTriangle aria-hidden />
        <AlertTitle>Deleting is permanent</AlertTitle>
        <AlertDescription>
          <p>
            It removes the member&apos;s profile, login, memberships, payments and receipts, and their payments drop out
            of your reports. For someone who has simply left, <strong>deactivate</strong> them instead — their history
            stays and you can bring them back.
          </p>
        </AlertDescription>
      </Alert>

      <RemoveMembers members={members} />
    </div>
  );
}
