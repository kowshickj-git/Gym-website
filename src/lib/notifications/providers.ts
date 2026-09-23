import 'server-only';

import { serverEnv } from '@/lib/env';
import type { DeliveryResult, NotificationProvider, OutboundMessage } from './types';

/**
 * Concrete delivery routes.
 *
 * The gym launches without an SMS contract, so `console` is the default and
 * every message is written to the server log and the notifications table. When
 * the owner signs up with MSG91 (or Twilio, or WhatsApp Cloud), setting the
 * provider env vars is the entire switch-over — no code changes.
 */

const TIMEOUT_MS = 10_000;

async function postJson(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Console — the development and pre-contract fallback
// -----------------------------------------------------------------------------
class ConsoleProvider implements NotificationProvider {
  constructor(public readonly channel: NotificationProvider['channel']) {}
  readonly name = 'console';

  isConfigured() {
    return true;
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    console.info(
      `[notification:${this.channel}] -> ${message.recipient}\n` +
        (message.subject ? `  subject: ${message.subject}\n` : '') +
        message.body
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
    );
    return { ok: true, provider: 'console', messageId: `console-${Date.now()}` };
  }
}

// -----------------------------------------------------------------------------
// MSG91 — the common choice for Indian transactional SMS (DLT registered)
// -----------------------------------------------------------------------------
class Msg91SmsProvider implements NotificationProvider {
  readonly name = 'msg91';
  readonly channel = 'SMS' as const;

  isConfigured() {
    return Boolean(serverEnv.msg91AuthKey && serverEnv.msg91SenderId);
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const templateId = (message.meta?.templateId as string | undefined) ?? serverEnv.msg91TemplateId;
    if (!templateId) {
      return { ok: false, provider: this.name, error: 'MSG91_TEMPLATE_ID is not set' };
    }

    // MSG91 wants the number without the leading "+".
    const mobile = message.recipient.replace(/^\+/, '');

    try {
      const response = await postJson('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: serverEnv.msg91AuthKey!,
        },
        body: JSON.stringify({
          template_id: templateId,
          sender: serverEnv.msg91SenderId,
          short_url: '0',
          recipients: [{ mobiles: mobile, ...(message.meta?.variables ?? { body: message.body }) }],
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { type?: string; message?: string };
      if (!response.ok || payload.type === 'error') {
        return { ok: false, provider: this.name, error: payload.message ?? `HTTP ${response.status}` };
      }
      return { ok: true, provider: this.name, messageId: payload.message };
    } catch (error) {
      return { ok: false, provider: this.name, error: (error as Error).message };
    }
  }
}

// -----------------------------------------------------------------------------
// Twilio — SMS and WhatsApp
// -----------------------------------------------------------------------------
class TwilioProvider implements NotificationProvider {
  readonly name = 'twilio';

  constructor(public readonly channel: 'SMS' | 'WHATSAPP') {}

  private get from() {
    return this.channel === 'WHATSAPP' ? serverEnv.twilioWhatsappFrom : serverEnv.twilioFrom;
  }

  isConfigured() {
    return Boolean(serverEnv.twilioAccountSid && serverEnv.twilioAuthToken && this.from);
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const sid = serverEnv.twilioAccountSid!;
    const to = this.channel === 'WHATSAPP' ? `whatsapp:${message.recipient}` : message.recipient;
    const from = this.channel === 'WHATSAPP' ? `whatsapp:${this.from}` : this.from!;

    try {
      const response = await postJson(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${sid}:${serverEnv.twilioAuthToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({ To: to, From: from, Body: message.body }),
      });

      const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!response.ok) {
        return { ok: false, provider: this.name, error: payload.message ?? `HTTP ${response.status}` };
      }
      return { ok: true, provider: this.name, messageId: payload.sid };
    } catch (error) {
      return { ok: false, provider: this.name, error: (error as Error).message };
    }
  }
}

// -----------------------------------------------------------------------------
// WhatsApp Cloud API (Meta)
// -----------------------------------------------------------------------------
class WhatsAppCloudProvider implements NotificationProvider {
  readonly name = 'whatsapp-cloud';
  readonly channel = 'WHATSAPP' as const;

  isConfigured() {
    return Boolean(serverEnv.whatsappPhoneNumberId && serverEnv.whatsappAccessToken);
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const templateName = message.meta?.templateName as string | undefined;

    // Outside the 24-hour service window Meta only accepts approved templates,
    // so a caller that supplies one gets a template send; otherwise plain text.
    const body = templateName
      ? {
          messaging_product: 'whatsapp',
          to: message.recipient.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: (message.meta?.languageCode as string) ?? 'en' },
            components: message.meta?.components ?? [],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: message.recipient.replace(/^\+/, ''),
          type: 'text',
          text: { preview_url: false, body: message.body },
        };

    try {
      const response = await postJson(
        `https://graph.facebook.com/v21.0/${serverEnv.whatsappPhoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serverEnv.whatsappAccessToken}`,
          },
          body: JSON.stringify(body),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message: string };
      };
      if (!response.ok) {
        return { ok: false, provider: this.name, error: payload.error?.message ?? `HTTP ${response.status}` };
      }
      return { ok: true, provider: this.name, messageId: payload.messages?.[0]?.id };
    } catch (error) {
      return { ok: false, provider: this.name, error: (error as Error).message };
    }
  }
}

// -----------------------------------------------------------------------------
// Resend — transactional email
// -----------------------------------------------------------------------------
class ResendEmailProvider implements NotificationProvider {
  readonly name = 'resend';
  readonly channel = 'EMAIL' as const;

  isConfigured() {
    return Boolean(serverEnv.resendApiKey);
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    try {
      const response = await postJson('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serverEnv.resendApiKey}`,
        },
        body: JSON.stringify({
          from: serverEnv.emailFrom,
          to: [message.recipient],
          subject: message.subject ?? 'Iron Core Fitness',
          text: message.body,
          html: (message.meta?.html as string | undefined) ?? undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) {
        return { ok: false, provider: this.name, error: payload.message ?? `HTTP ${response.status}` };
      }
      return { ok: true, provider: this.name, messageId: payload.id };
    } catch (error) {
      return { ok: false, provider: this.name, error: (error as Error).message };
    }
  }
}

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------
const SMS_PROVIDERS: Record<string, () => NotificationProvider> = {
  msg91: () => new Msg91SmsProvider(),
  twilio: () => new TwilioProvider('SMS'),
  console: () => new ConsoleProvider('SMS'),
};

const WHATSAPP_PROVIDERS: Record<string, () => NotificationProvider> = {
  cloud: () => new WhatsAppCloudProvider(),
  meta: () => new WhatsAppCloudProvider(),
  twilio: () => new TwilioProvider('WHATSAPP'),
  console: () => new ConsoleProvider('WHATSAPP'),
};

const EMAIL_PROVIDERS: Record<string, () => NotificationProvider> = {
  resend: () => new ResendEmailProvider(),
  console: () => new ConsoleProvider('EMAIL'),
};

/**
 * Resolves the provider for a channel, falling back to the console route when
 * the configured one is missing credentials. A misconfigured gateway should
 * degrade to a logged message, never to a crashed reminder job.
 */
export function resolveProvider(channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH'): NotificationProvider {
  if (channel === 'PUSH') return new ConsoleProvider('PUSH');

  const table =
    channel === 'SMS' ? SMS_PROVIDERS : channel === 'WHATSAPP' ? WHATSAPP_PROVIDERS : EMAIL_PROVIDERS;
  const configured =
    channel === 'SMS'
      ? serverEnv.smsProvider
      : channel === 'WHATSAPP'
        ? serverEnv.whatsappProvider
        : serverEnv.emailProvider;

  const factory = table[configured] ?? table.console!;
  const provider = factory();

  if (!provider.isConfigured()) {
    if (provider.name !== 'console') {
      console.warn(
        `[notifications] ${channel} provider "${provider.name}" is not configured; ` +
          `falling back to console logging.`,
      );
    }
    return new ConsoleProvider(channel);
  }

  return provider;
}

/** True when real messages will actually leave the building for this channel. */
export function isLiveChannel(channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH'): boolean {
  return resolveProvider(channel).name !== 'console';
}
