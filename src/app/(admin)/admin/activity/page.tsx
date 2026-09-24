import type { Metadata } from 'next';
import Link from 'next/link';
import { History, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription, EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';

export const metadata: Metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

const LIMIT = 100;

const KIND_LABEL: Record<string, string> = {
  OTP: 'Login code',
  WELCOME: 'Welcome',
  PAYMENT_RECEIPT: 'Receipt',
  EXPIRY_REMINDER: 'Expiry reminder',
  EXPIRED: 'Expired notice',
  OFFER_ANNOUNCEMENT: 'Offer',
  CUSTOM: 'Message',
};

const MESSAGE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'logged', label: 'Not sent' },
] as const;

type MessageFilter = (typeof MESSAGE_FILTERS)[number]['value'];

/**
 * What the system has done on the owner's behalf, so none of it needs the
 * database to answer. "Did Karthik get his reminder?" is the messages tab;
 * "who changed the Diwali price?" is the changes tab.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; show?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requireAdmin()]);
  const tab = params.tab === 'changes' ? 'changes' : 'messages';
  const show: MessageFilter = MESSAGE_FILTERS.some((f) => f.value === params.show)
    ? (params.show as MessageFilter)
    : 'all';

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-muted-foreground text-sm">The latest {LIMIT} messages and changes, newest first.</p>
      </header>

      <nav className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1" aria-label="Activity type">
        {(
          [
            { value: 'messages', label: 'Messages', Icon: MessageSquare },
            { value: 'changes', label: 'Changes', Icon: History },
          ] as const
        ).map(({ value, label, Icon }) => (
          <Link
            key={value}
            href={value === 'messages' ? '/admin/activity' : '/admin/activity?tab=changes'}
            aria-current={tab === value ? 'page' : undefined}
            className={
              tab === value
                ? 'bg-background flex h-9 items-center justify-center gap-2 rounded-md text-sm font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium'
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'messages' ? <Messages show={show} /> : <Changes />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------

async function Messages({ show }: { show: MessageFilter }) {
  const supabase = await createReadOnlyServerSupabase();
  let query = supabase
    .from('notifications')
    .select('id, kind, channel, recipient, body, status, provider, error, created_at, member:members(full_name)')
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (show === 'failed') query = query.eq('status', 'FAILED');
  if (show === 'logged') query = query.eq('provider', 'console');

  const { data } = await query;
  const rows = (data ?? []) as unknown as {
    id: string;
    kind: string;
    channel: string;
    recipient: string;
    body: string;
    status: string;
    provider: string | null;
    error: string | null;
    created_at: string;
    member: { full_name: string } | null;
  }[];

  const loggedOnly = rows.some((row) => row.provider === 'console');

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {MESSAGE_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            asChild
            size="sm"
            variant={show === filter.value ? 'default' : 'outline'}
            className="shrink-0 rounded-full"
          >
            <Link href={filter.value === 'all' ? '/admin/activity' : `/admin/activity?show=${filter.value}`}>
              {filter.label}
            </Link>
          </Button>
        ))}
      </div>

      {loggedOnly ? (
        <Alert variant="warning">
          <AlertDescription>
            <p>
              Messages marked <strong>Not sent</strong> were only written to the server log, because no SMS or WhatsApp
              gateway is set up yet. Members did not receive them. Settings shows which channels are live.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 py-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={<MessageSquare aria-hidden />}
            title={show === 'all' ? 'No messages yet' : 'Nothing here'}
            description={
              show === 'failed'
                ? 'No message has failed to send.'
                : 'Reminders, receipts and login codes appear here as they go out.'
            }
            className="py-10"
          />
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{KIND_LABEL[row.kind] ?? row.kind}</span>
                  <Badge variant="muted">{row.channel === 'WHATSAPP' ? 'WhatsApp' : row.channel}</Badge>
                  <DeliveryBadge status={row.status} provider={row.provider} />
                  <span className="text-muted-foreground ml-auto text-xs">{formatDateTime(row.created_at)}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  To {row.member?.full_name ? `${row.member.full_name} · ` : ''}
                  {row.channel === 'EMAIL' ? row.recipient : formatPhone(row.recipient)}
                </p>
                <p className="text-sm text-pretty">{row.body}</p>
                {row.error ? <p className="text-destructive text-xs">{row.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** "Sent" from the console provider would be a lie: nothing left the server. */
function DeliveryBadge({ status, provider }: { status: string; provider: string | null }) {
  if (status === 'FAILED') return <Badge variant="danger">Failed</Badge>;
  if (status === 'PENDING') return <Badge variant="warning">Sending</Badge>;
  if (provider === 'console') return <Badge variant="warning">Not sent</Badge>;
  if (status === 'SENT') return <Badge variant="success">Sent</Badge>;
  return <Badge variant="muted">{status.toLowerCase()}</Badge>;
}

// -----------------------------------------------------------------------------
// Changes
// -----------------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  AUTH_LOGIN: 'Signed in',
  MEMBER_CREATED: 'Added a member',
  MEMBER_UPDATED: 'Edited a member',
  MEMBER_SELF_UPDATE: 'Member updated their profile',
  MEMBER_DEACTIVATED: 'Deactivated a member',
  MEMBER_REACTIVATED: 'Reactivated a member',
  MEMBERSHIP_CANCELLED: 'Cancelled a membership',
  MEMBER_DELETED: 'Deleted a member',
  PAYMENT_RECORDED_OFFLINE: 'Recorded a desk payment',
  PAYMENT_ORDER_CREATED: 'Started an online payment',
  PAYMENT_REVERIFIED: 'Re-checked a payment with Razorpay',
  PAYMENT_REVERIFY_NOT_CAPTURED: 'Re-checked a payment: not captured',
  PAYMENT_SIGNATURE_INVALID: 'Rejected a payment with a bad signature',
  PAYMENT_AMOUNT_MISMATCH: 'Rejected a payment for the wrong amount',
  WEBHOOK_PAYMENT_SETTLED: 'Razorpay confirmed a payment',
  WEBHOOK_UNKNOWN_ORDER: 'Razorpay sent an unknown order',
  UPI_PAYMENT_STARTED: 'Started a UPI payment',
  UPI_REFERENCE_SUBMITTED: 'Reported a UPI reference',
  UPI_PAYMENT_CONFIRMED: 'Confirmed a UPI payment',
  UPI_PAYMENT_REJECTED: 'Marked a UPI payment not received',
  PLAN_CREATED: 'Added a plan',
  PLAN_UPDATED: 'Changed a plan',
  PLAN_ACTIVATED: 'Turned a plan on',
  PLAN_DEACTIVATED: 'Turned a plan off',
  PLAN_DELETED: 'Deleted a plan',
  CATEGORY_CREATED: 'Added a category',
  CATEGORY_UPDATED: 'Changed a category',
  CATEGORY_DELETED: 'Deleted a category',
  OFFER_CREATED: 'Created an offer',
  OFFER_UPDATED: 'Changed an offer',
  OFFER_ACTIVATED: 'Turned an offer on',
  OFFER_DEACTIVATED: 'Turned an offer off',
  OFFER_DELETED: 'Deleted an offer',
  SETTINGS_UPDATED: 'Changed gym settings',
  STAFF_CREATED: 'Added staff',
  STAFF_ACTIVATED: 'Reactivated staff',
  STAFF_DEACTIVATED: 'Deactivated staff',
  STAFF_PAYMENTS_ALLOWED: 'Allowed staff to take payments',
  STAFF_PAYMENTS_REVOKED: 'Stopped staff taking payments',
  CRON_EXPIRY_RUN: 'Daily reminder run',
};

/** Turns SCREAMING_SNAKE into a sentence for actions without a hand-written label. */
function describe(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  const words = action.toLowerCase().split('_');
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

/** A short, human summary of what changed, from the stored before/after. */
function summarise(before: unknown, after: unknown): string | null {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const parts: string[] = [];
  // A deletion has no "after": describe what was removed instead.
  if (Object.keys(a).length === 0) {
    for (const [key, value] of Object.entries(b)) {
      if (value === null || value === undefined || typeof value === 'object') continue;
      parts.push(`${key.replaceAll('_', ' ')}: ${String(value)}`);
    }
    return parts.length ? parts.slice(0, 5).join(' · ') : null;
  }
  for (const key of Object.keys(a)) {
    const next = a[key];
    if (next === null || next === undefined || typeof next === 'object') continue;
    const label = key.replaceAll('_', ' ');
    parts.push(key in b && b[key] !== next ? `${label}: ${String(b[key])} → ${String(next)}` : `${label}: ${String(next)}`);
  }
  return parts.length ? parts.slice(0, 4).join(' · ') : null;
}

async function Changes() {
  const supabase = await createReadOnlyServerSupabase();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_label, action, entity, before_data, after_data, created_at')
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>The change log could not be loaded. Please try again.</AlertDescription>
      </Alert>
    );
  }

  const rows = data ?? [];

  return (
    <Card className="gap-0 py-0">
      {rows.length === 0 ? (
        <EmptyState
          icon={<History aria-hidden />}
          title="No changes yet"
          description="Every price change, payment, cancellation and staff change is recorded here with who made it."
          className="py-10"
        />
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const summary = summarise(row.before_data, row.after_data);
            return (
              <li key={row.id} className="space-y-1 p-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold">{describe(row.action)}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{formatDateTime(row.created_at)}</span>
                </div>
                <p className="text-muted-foreground text-xs">By {row.actor_label ?? 'the system'}</p>
                {summary ? <p className="text-sm break-words">{summary}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
