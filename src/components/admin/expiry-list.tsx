import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactActions } from '@/components/contact-actions';
import { PaymentStatusBadge } from '@/components/status-badge';
import { formatDate, formatDaysRemaining } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { MemberDirectoryRow } from '@/types/database';

/**
 * The call sheet.
 *
 * Optimised for one job: the owner works down this list on a phone, tapping
 * call or WhatsApp. Everything they need to open the conversation — name, plan,
 * weight, when it ends, whether they have paid — is on the card, so they never
 * have to open the profile first.
 */
export function ExpiryList({
  members,
  variant,
  gymName,
  emptyTitle,
  emptyDescription,
}: {
  members: MemberDirectoryRow[];
  variant: 'expiring' | 'expired';
  gymName: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (members.length === 0) {
    return (
      <Card>
        <EmptyState icon={<CalendarClock aria-hidden />} title={emptyTitle} description={emptyDescription} />
      </Card>
    );
  }

  const messageFor = (member: MemberDirectoryRow) => {
    const first = member.full_name.split(' ')[0];
    return variant === 'expiring'
      ? `Hi ${first}, this is ${gymName}. Your ${member.plan_name ?? 'gym'} membership ends on ${formatDate(member.expiry_date)}. Shall we renew it for you?`
      : `Hi ${first}, this is ${gymName}. Your membership ended on ${formatDate(member.expiry_date)}. We would love to have you back — shall we set up a renewal?`;
  };

  return (
    <>
      {/* ---------------------------------------------------- Phone: cards */}
      <ul className="space-y-2 lg:hidden">
        {members.map((member) => (
          <li key={member.id}>
            <Card className="gap-3 py-4">
              <div className="flex items-start justify-between gap-3 px-4">
                <Link href={`/admin/members/${member.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.full_name}</p>
                  <p className="text-muted-foreground tnum text-xs">{formatPhone(member.phone)}</p>
                </Link>
                <span
                  className={
                    variant === 'expiring'
                      ? 'bg-warning/15 text-warning-foreground dark:text-warning rounded-md px-2 py-1 text-xs font-semibold'
                      : 'bg-destructive/10 text-destructive rounded-md px-2 py-1 text-xs font-semibold'
                  }
                >
                  {formatDaysRemaining(member.days_remaining)}
                </span>
              </div>

              <dl className="grid grid-cols-3 gap-x-3 gap-y-1 px-4 text-xs">
                <div className="col-span-2">
                  <dt className="text-muted-foreground">{variant === 'expired' ? 'Previous plan' : 'Plan'}</dt>
                  <dd className="truncate font-medium">
                    {member.plan_name ?? '—'}
                    {member.category_name ? ` · ${member.category_name}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Weight</dt>
                  <dd className="font-medium">{member.weight_kg ? `${Number(member.weight_kg)} kg` : '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">{variant === 'expired' ? 'Expired on' : 'Expires on'}</dt>
                  <dd className="font-medium">{formatDate(member.expiry_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd>
                    <PaymentStatusBadge status={member.payment_status} />
                  </dd>
                </div>
              </dl>

              <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-4">
                <ContactActions
                  phone={member.phone}
                  name={member.full_name}
                  message={messageFor(member)}
                  size="sm"
                  labelled
                />
                <Button asChild size="sm">
                  <Link href={`/admin/payments/record?member=${member.id}`}>Renew</Link>
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {/* -------------------------------------------------- Desktop: table */}
      <Card className="hidden gap-0 py-0 lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead>{variant === 'expired' ? 'Previous plan' : 'Plan'}</TableHead>
              <TableHead>{variant === 'expired' ? 'Expired on' : 'Expiry date'}</TableHead>
              <TableHead>{variant === 'expired' ? 'Ago' : 'Days left'}</TableHead>
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
                <TableCell className="tnum text-right">
                  {member.weight_kg ? Number(member.weight_kg) : '—'}
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {member.plan_name ?? '—'}
                  {member.category_name ? (
                    <span className="text-muted-foreground block text-xs">{member.category_name}</span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(member.expiry_date)}</TableCell>
                <TableCell
                  className={
                    variant === 'expiring'
                      ? 'text-warning-foreground dark:text-warning font-medium whitespace-nowrap'
                      : 'text-destructive font-medium whitespace-nowrap'
                  }
                >
                  {formatDaysRemaining(member.days_remaining)}
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={member.payment_status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <ContactActions phone={member.phone} name={member.full_name} message={messageFor(member)} />
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/admin/payments/record?member=${member.id}`}>Renew</Link>
                    </Button>
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
    </>
  );
}
