import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveChannel, resolveProvider } from './providers';
import type { NotificationRequest } from './types';

export * from './types';
export { isLiveChannel, resolveProvider } from './providers';
export * as templates from './templates';

export interface DispatchOutcome {
  /** True when a duplicate dedupe key meant we deliberately sent nothing. */
  skipped: boolean;
  sent: boolean;
  notificationId: string | null;
  provider?: string;
  error?: string;
}

const UNIQUE_VIOLATION = '23505';

/**
 * Sends one message and records it.
 *
 * The log row is written *before* the provider call, keyed by `dedupeKey`. A
 * unique-index collision is the signal that this exact reminder already went
 * out, so a cron job that runs twice — or a webhook that retries — cannot
 * message a member a second time.
 */
export async function dispatch(request: NotificationRequest): Promise<DispatchOutcome> {
  const supabase = createAdminClient();

  const { data: logRow, error: insertError } = await supabase
    .from('notifications')
    .insert({
      member_id: request.memberId ?? null,
      membership_id: request.membershipId ?? null,
      kind: request.kind,
      channel: request.channel,
      recipient: request.recipient,
      subject: request.subject ?? null,
      body: request.body,
      status: 'PENDING',
      dedupe_key: request.dedupeKey ?? null,
      metadata: (request.metadata ?? {}) as never,
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return { skipped: true, sent: false, notificationId: null };
    }
    console.error('[notifications] could not record notification', insertError);
    return { skipped: false, sent: false, notificationId: null, error: insertError.message };
  }

  const provider = resolveProvider(request.channel);
  const result = await provider.send(request);

  await supabase
    .from('notifications')
    .update({
      status: result.ok ? 'SENT' : 'FAILED',
      provider: result.provider,
      provider_message_id: result.messageId ?? null,
      error: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
    })
    .eq('id', logRow.id);

  return {
    skipped: false,
    sent: result.ok,
    notificationId: logRow.id,
    provider: result.provider,
    error: result.error,
  };
}

/**
 * Sends the same message over several channels, stopping at the first success.
 * Used for reminders: try WhatsApp (cheap, rich), fall back to SMS (universal).
 */
export async function dispatchWithFallback(
  request: Omit<NotificationRequest, 'channel'>,
  channels: NotificationRequest['channel'][],
): Promise<DispatchOutcome> {
  let last: DispatchOutcome = { skipped: false, sent: false, notificationId: null, error: 'No channels configured' };

  for (const channel of channels) {
    const outcome = await dispatch({
      ...request,
      channel,
      // Keep the dedupe key channel-agnostic so a retry over a second channel
      // is still recognised as the same logical reminder.
      dedupeKey: request.dedupeKey ?? null,
    });
    if (outcome.skipped || outcome.sent) return outcome;
    last = outcome;
  }

  return last;
}

/**
 * Which channels a reminder should try, in order. WhatsApp first when it is
 * live (it is far cheaper than SMS in India), then SMS, then email.
 */
export function reminderChannels(hasEmail: boolean): NotificationRequest['channel'][] {
  const channels: NotificationRequest['channel'][] = [];
  if (isLiveChannel('WHATSAPP')) channels.push('WHATSAPP');
  channels.push('SMS');
  if (hasEmail && isLiveChannel('EMAIL')) channels.push('EMAIL');
  return channels;
}
