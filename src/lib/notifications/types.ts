import type { NotificationChannel, NotificationKind } from '@/types/database';

export interface OutboundMessage {
  channel: NotificationChannel;
  /** E.164 phone number, or an email address for the EMAIL channel. */
  recipient: string;
  body: string;
  subject?: string;
  /** Provider-specific extras: DLT template ids, WhatsApp template names, etc. */
  meta?: Record<string, unknown>;
}

export interface DeliveryResult {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

/**
 * Every delivery route implements this. Swapping MSG91 for Twilio, or adding
 * Gupshup later, means adding one file and one line in the registry — no
 * caller changes.
 */
export interface NotificationProvider {
  readonly name: string;
  readonly channel: NotificationChannel;
  /** False when credentials are absent; the dispatcher then falls back. */
  isConfigured(): boolean;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

export interface NotificationRequest extends OutboundMessage {
  kind: NotificationKind;
  memberId?: string | null;
  membershipId?: string | null;
  /**
   * Stable key that makes a send idempotent. The row has a unique index on it,
   * so a repeated cron run cannot message the same member twice.
   */
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
}
