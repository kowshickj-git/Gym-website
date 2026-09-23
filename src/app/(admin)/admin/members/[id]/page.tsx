import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Mail,
  MapPin,
  Pencil,
  Receipt as ReceiptIcon,
  Ruler,
  Scale,
  StickyNote,
  UserRound,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, EmptyState } from '@/components/ui/feedback';
import { Avatar, AvatarFallback, AvatarImage, Separator } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactActions } from '@/components/contact-actions';
import { MembershipStatusBadge, PaymentStatusBadge } from '@/components/status-badge';
import { MemberStatusToggle } from '@/components/admin/member-status-toggle';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATE_LABEL } from '@/lib/constants';
import { daysUntil, formatCurrency, formatDate, formatDateTime, formatDaysRemaining, initials } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createReadOnlyServerSupabase();
  const { data } = await supabase.from('members').select('full_name').eq('id', id).maybeSingle();
  return { title: data?.full_name ?? 'Member' };
}

export default async function AdminMemberDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ id }, { created }, staff] = await Promise.all([params, searchParams, requireStaff()]);
  const supabase = await createReadOnlyServerSupabase();

  const { data: member } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
  if (!member) notFound();

  const [{ data: memberships }, { data: payments }] = await Promise.all([
    supabase
      .from('memberships')
      .select('*')
      .eq('member_id', id)
      .order('start_date', { ascending: false })
      .limit(20),
    supabase
      .from('payments')
      .select('*, receipts(id, receipt_number)')
      .eq('member_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const current = (memberships ?? []).find((m) => m.status !== 'CANCELLED') ?? null;
  const remaining = current ? daysUntil(current.expiry_date) : null;
  const lifetimeValue = (payments ?? [])
    .filter((payment) => payment.status === 'PAID')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/members">
          <ArrowLeft aria-hidden />
          Members
        </Link>
      </Button>

      {created ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>{member.full_name} is registered</AlertTitle>
          <AlertDescription>
            They can sign in at the member login with {formatPhone(member.phone)}. Record their first payment to start a
            membership.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ---------------------------------------------------------- Identity */}
      <Card className="gap-4">
        <div className="flex flex-wrap items-start gap-4 px-5">
          <Avatar className="size-16">
            {member.photo_url ? <AvatarImage src={member.photo_url} alt="" /> : null}
            <AvatarFallback className="text-lg">{initials(member.full_name)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight">{member.full_name}</h1>
              {!member.is_active ? <Badge variant="muted">Deactivated</Badge> : null}
            </div>
            <p className="text-muted-foreground tnum text-sm">{formatPhone(member.phone)}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <MembershipStatusBadge status={current?.status ?? null} />
              {current ? <PaymentStatusBadge status={current.payment_status} /> : null}
            </div>
          </div>

          <ContactActions phone={member.phone} name={member.full_name} size="icon" />
        </div>

        <div className="grid gap-2 px-5 sm:grid-cols-2">
          <Button asChild size="lg">
            <Link href={`/admin/payments/record?member=${member.id}`}>
              <ReceiptIcon aria-hidden />
              {current ? 'Renew membership' : 'Start membership'}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/admin/members/${member.id}/edit`}>
              <Pencil aria-hidden />
              Edit details
            </Link>
          </Button>
        </div>
      </Card>

      {/* -------------------------------------------------- Current membership */}
      <Card>
        <CardHeader>
          <CardTitle>Current membership</CardTitle>
        </CardHeader>
        <CardContent>
          {current ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Detail label="Plan" value={current.plan_name} />
              <Detail label="Category" value={current.category_name} />
              <Detail label="Started" value={formatDate(current.start_date)} />
              <Detail
                label="Expires"
                value={formatDate(current.expiry_date)}
                sub={formatDaysRemaining(remaining)}
                tone={remaining !== null && remaining < 0 ? 'danger' : remaining !== null && remaining <= 7 ? 'warning' : undefined}
              />
              <Detail label="Paid" value={formatCurrency(Number(current.final_amount))} />
              {Number(current.discount_amount) > 0 ? (
                <Detail
                  label="Discount"
                  value={formatCurrency(Number(current.discount_amount))}
                  sub={current.offer_name ?? undefined}
                />
              ) : null}
              <Detail label="Term" value={`${current.duration_months} months`} />
              <Detail label="Type" value={current.is_renewal ? 'Renewal' : 'First term'} />
            </dl>
          ) : (
            <EmptyState
              icon={<CalendarClock aria-hidden />}
              title="No membership yet"
              description="Record a payment to start this member's first term."
              className="py-8"
              action={
                <Button asChild>
                  <Link href={`/admin/payments/record?member=${member.id}`}>Record a payment</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="Weight" value={member.weight_kg ? `${Number(member.weight_kg)} kg` : '—'} icon={<Scale />} />
            <Detail label="Height" value={member.height_cm ? `${Number(member.height_cm)} cm` : '—'} icon={<Ruler />} />
            <Detail label="Gender" value={formatGender(member.gender)} icon={<UserRound />} />
            <Detail label="Date of birth" value={member.date_of_birth ? formatDate(member.date_of_birth) : '—'} />
            <Detail label="Member since" value={formatDate(member.join_date)} />
            <Detail label="Lifetime value" value={formatCurrency(lifetimeValue)} />
            <Detail label="Email" value={member.email ?? '—'} icon={<Mail />} className="sm:col-span-2" />
          </dl>

          {member.emergency_contact_name || member.emergency_contact_phone ? (
            <>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-muted-foreground text-xs">Emergency contact</p>
                  <p className="text-sm font-medium">{member.emergency_contact_name ?? 'Not named'}</p>
                  {member.emergency_contact_phone ? (
                    <p className="text-muted-foreground tnum text-sm">
                      {formatPhone(member.emergency_contact_phone)}
                    </p>
                  ) : null}
                </div>
                {member.emergency_contact_phone ? (
                  <ContactActions
                    phone={member.emergency_contact_phone}
                    name={member.emergency_contact_name ?? undefined}
                  />
                ) : null}
              </div>
            </>
          ) : null}

          {member.address ? (
            <>
              <Separator />
              <p className="text-muted-foreground flex gap-2 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="text-pretty">{member.address}</span>
              </p>
            </>
          ) : null}

          {member.notes ? (
            <>
              <Separator />
              <div className="bg-muted/50 flex gap-2 rounded-lg p-3 text-sm">
                <StickyNote className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="text-pretty">{member.notes}</p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* --------------------------------------------------- Payment history */}
      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        {!payments?.length ? (
          <EmptyState icon={<ReceiptIcon aria-hidden />} title="No payments recorded" className="py-10" />
        ) : (
          <ul className="divide-y border-t">
            {payments.map((payment) => {
              const receipt = Array.isArray(payment.receipts) ? payment.receipts[0] : payment.receipts;
              const snapshot = payment.plan_snapshot as { plan_name?: string } | null;

              return (
                <li key={payment.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{snapshot?.plan_name ?? 'Membership'}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(payment.paid_at ?? payment.created_at)} ·{' '}
                      {PAYMENT_METHOD_LABEL[payment.method]}
                      {payment.collected_by_name ? ` · ${payment.collected_by_name}` : ''}
                    </p>
                    {payment.notes ? <p className="text-muted-foreground mt-0.5 text-xs">{payment.notes}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-semibold">{formatCurrency(Number(payment.amount))}</p>
                    {payment.status === 'PAID' ? (
                      receipt ? (
                        <span className="text-muted-foreground font-mono text-xs">{receipt.receipt_number}</span>
                      ) : (
                        <Badge variant="success">Paid</Badge>
                      )
                    ) : (
                      <Badge variant={payment.status === 'FAILED' ? 'danger' : 'muted'}>
                        {PAYMENT_STATE_LABEL[payment.status]}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------ Membership history */}
      {memberships && memberships.length > 1 ? (
        <Card className="gap-0 py-0">
          <CardHeader className="py-5">
            <CardTitle>Membership history</CardTitle>
          </CardHeader>
          <ul className="divide-y border-t">
            {memberships.map((membership) => (
              <li key={membership.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {membership.plan_name} · {membership.category_name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(membership.start_date)} → {formatDate(membership.expiry_date)}
                  </p>
                </div>
                <MembershipStatusBadge status={membership.status} showIcon={false} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {staff.role === 'ADMIN' ? <MemberStatusToggle memberId={member.id} isActive={member.is_active} /> : null}
    </div>
  );
}

function Detail({
  label,
  value,
  sub,
  icon,
  tone,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: 'warning' | 'danger';
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground flex items-center gap-1 text-xs [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="truncate text-sm font-semibold">{value}</dd>
      {sub ? (
        <dd
          className={
            tone === 'danger'
              ? 'text-destructive text-xs font-medium'
              : tone === 'warning'
                ? 'text-warning-foreground dark:text-warning text-xs font-medium'
                : 'text-muted-foreground text-xs'
          }
        >
          {sub}
        </dd>
      ) : null}
    </div>
  );
}

function formatGender(gender: string | null): string {
  if (!gender) return '—';
  return gender
    .toLowerCase()
    .split('_')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}
