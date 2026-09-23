import type { Metadata } from 'next';
import { ExpiryList } from '@/components/admin/expiry-list';
import { Pagination } from '@/components/admin/pagination';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getGymSettings } from '@/lib/data';
import { PAGE_SIZE } from '@/lib/constants';
import { pluralise } from '@/lib/utils';
import type { MemberDirectoryRow } from '@/types/database';

export const metadata: Metadata = { title: 'Expired' };
export const dynamic = 'force-dynamic';

export default async function ExpiredPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [{ page: pageParam }, settings] = await Promise.all([searchParams, getGymSettings(), requireStaff()]);
  const page = Math.max(1, Number(pageParam ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createReadOnlyServerSupabase();
  const { data, count } = await supabase
    .from('member_directory')
    .select('*', { count: 'exact' })
    .eq('membership_status', 'EXPIRED')
    .eq('is_active', true)
    // Most recently lapsed first: they are the easiest to win back.
    .order('expiry_date', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const members = (data ?? []) as MemberDirectoryRow[];
  const total = count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Expired memberships</h1>
        <p className="text-muted-foreground text-sm">
          {pluralise(total, 'member')} whose plan has ended, most recent first.
        </p>
      </header>

      <ExpiryList
        members={members}
        variant="expired"
        gymName={settings.gym_name}
        emptyTitle="No expired memberships"
        emptyDescription="Every member with a plan is currently inside it. Lapsed members will appear here for win-back calls."
      />

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
