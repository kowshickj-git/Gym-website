import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ChevronRight, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MemberFilters } from '@/components/admin/member-filters';
import { MembershipStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { ContactActions } from '@/components/contact-actions';
import { Pagination } from '@/components/admin/pagination';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getCategories } from '@/lib/data';
import { memberFilterSchema } from '@/lib/validation';
import { PAGE_SIZE, PAYMENT_METHOD_LABEL } from '@/lib/constants';
import { formatDate, formatDaysRemaining, pluralise } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { MemberDirectoryRow } from '@/types/database';

export const metadata: Metadata = { title: 'Members' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminMembersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const raw = await searchParams;

  const filters = memberFilterSchema.parse({
    q: typeof raw.q === 'string' ? raw.q : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    category: typeof raw.category === 'string' ? raw.category : undefined,
    payment: typeof raw.payment === 'string' ? raw.payment : undefined,
    page: typeof raw.page === 'string' ? raw.page : undefined,
  });

  const categories = await getCategories(true);
  const supabase = await createReadOnlyServerSupabase();

  let query = supabase.from('member_directory').select('*', { count: 'exact' });

  if (filters.q) {
    const term = filters.q.replace(/[%,()]/g, '');
    // Match on either the display name or any part of the number the staff typed.
    query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  if (filters.status === 'NONE') query = query.is('membership_id', null);
  else if (filters.status !== 'ALL') query = query.eq('membership_status', filters.status);

  if (filters.category) query = query.eq('category_id', filters.category);

  if (filters.payment === 'PAID' || filters.payment === 'UNPAID') {
    query = query.eq('payment_status', filters.payment);
  } else if (filters.payment === 'ONLINE') {
    query = query.eq('last_payment_method', 'ONLINE');
  } else if (filters.payment === 'CASH') {
    query = query.neq('last_payment_method', 'ONLINE').not('last_payment_method', 'is', null);
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count } = await query
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('full_name', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const members = (data ?? []) as MemberDirectoryRow[];
  const total = count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground text-sm">{pluralise(total, 'member')} matching</p>
        </div>
        <Button asChild>
          <Link href="/admin/members/new">
            <UserPlus aria-hidden />
            Add member
          </Link>
        </Button>
      </header>

      <Suspense fallback={<Skeleton className="h-32 w-full" />}>
        <MemberFilters categories={categories} />
      </Suspense>

      {members.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users aria-hidden />}
            title="No members match"
            description="Try clearing a filter, or search by the last few digits of the mobile number."
            action={
              <Button asChild variant="outline">
                <Link href="/admin/members">Clear filters</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* ------------------------------------------- Phone: member cards */}
          <ul className="space-y-2 lg:hidden">
            {members.map((member) => (
              <li key={member.id}>
                <Card className="gap-3 py-4">
                  <div className="flex items-start justify-between gap-3 px-4">
                    <Link href={`/admin/members/${member.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{member.full_name}</p>
                      <p className="text-muted-foreground text-xs">{formatPhone(member.phone)}</p>
                    </Link>
                    <MembershipStatusBadge status={member.membership_status} showIcon={false} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Plan</dt>
                      <dd className="font-medium">{member.plan_name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Category</dt>
                      <dd className="truncate font-medium">{member.category_name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Weight</dt>
                      <dd className="font-medium">{member.weight_kg ? `${Number(member.weight_kg)} kg` : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Expires</dt>
                      <dd className="font-medium">
                        {member.expiry_date ? formatDate(member.expiry_date) : '—'}
                        {member.days_remaining !== null ? (
                          <span className="text-muted-foreground block font-normal">
                            {formatDaysRemaining(member.days_remaining)}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex items-center justify-between gap-2 px-4">
                    <PaymentStatusBadge status={member.payment_status} />
                    <div className="flex items-center gap-2">
                      <ContactActions phone={member.phone} name={member.full_name} />
                      <Button asChild size="sm">
                        <Link href={`/admin/payments/record?member=${member.id}`}>Renew</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {/* ---------------------------------------------- Desktop: a table */}
          <Card className="hidden gap-0 py-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/members/${member.id}`} className="hover:underline">
                        {member.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tnum whitespace-nowrap">
                      {formatPhone(member.phone)}
                    </TableCell>
                    <TableCell>{member.plan_name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground max-w-40 truncate">
                      {member.category_name ?? '—'}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {member.weight_kg ? `${Number(member.weight_kg)}` : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {member.start_date ? formatDate(member.start_date) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {member.expiry_date ? formatDate(member.expiry_date) : '—'}
                    </TableCell>
                    <TableCell>
                      <MembershipStatusBadge status={member.membership_status} showIcon={false} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <PaymentStatusBadge status={member.payment_status} />
                        {member.last_payment_method ? (
                          <span className="text-muted-foreground text-xs">
                            {PAYMENT_METHOD_LABEL[member.last_payment_method]}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <ContactActions phone={member.phone} name={member.full_name} />
                        <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${member.full_name}`}>
                          <Link href={`/admin/members/${member.id}`}>
                            <ChevronRight aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Pagination page={filters.page} total={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
