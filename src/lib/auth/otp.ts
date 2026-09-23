import 'server-only';

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { requireEnv, serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch, templates } from '@/lib/notifications';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from '@/lib/constants';

/**
 * One-time password issuance and verification.
 *
 * Codes are never stored in the clear: the table holds an HMAC keyed by
 * AUTH_SECRET, so a database leak does not hand an attacker live login codes.
 * Delivery goes through the notification abstraction, which means the gym can
 * move from console logging to MSG91 SMS without touching this file.
 */

function hashCode(phone: string, code: string): string {
  const secret = requireEnv('AUTH_SECRET', serverEnv.authSecret);
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i += 1) code += randomInt(0, 10).toString();
  // Avoid codes that look like placeholders (000000, 111111).
  return /^(\d)\1+$/.test(code) ? generateCode() : code;
}

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type OtpRequestResult =
  | {
      ok: true;
      expiresAt: string;
      /** Present only in demo mode, so a reviewer without an SMS gateway can sign in. */
      devCode?: string;
      /** True when the code was only written to the server log. */
      simulated: boolean;
    }
  | { ok: false; error: string; retryAfter?: number };

export interface OtpRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Issues a code for `phone`.
 *
 * Deliberately does not reveal whether the number belongs to a member: the
 * response is identical either way, so this endpoint cannot be used to
 * enumerate the gym's membership. A non-member simply never receives an SMS.
 */
export async function requestOtp(phone: string, context: OtpRequestContext = {}): Promise<OtpRequestResult> {
  const supabase = createAdminClient();
  const now = Date.now();

  // Durable rate limit: counts real rows, so it survives serverless cold starts.
  const { data: recent, error: recentError } = await supabase
    .from('otp_challenges')
    .select('created_at')
    .eq('phone', phone)
    .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(OTP_MAX_SENDS_PER_HOUR + 1);

  if (recentError) {
    console.error('[otp] rate-limit lookup failed', recentError);
    return { ok: false, error: 'Could not send the code right now. Please try again.' };
  }

  if (recent && recent.length >= OTP_MAX_SENDS_PER_HOUR) {
    return {
      ok: false,
      error: 'Too many codes requested. Please try again in an hour, or call the gym.',
      retryAfter: 3600,
    };
  }

  const lastSentAt = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
  const sinceLast = (now - lastSentAt) / 1000;
  if (lastSentAt && sinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
    return {
      ok: false,
      error: 'A code was just sent. Please wait a few seconds before asking for another.',
      retryAfter: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast),
    };
  }

  // Supersede any outstanding code for this number.
  await supabase
    .from('otp_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('phone', phone)
    .is('consumed_at', null);

  const code = generateCode();
  const expiresAt = new Date(now + OTP_TTL_SECONDS * 1000).toISOString();

  const { error: insertError } = await supabase.from('otp_challenges').insert({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: expiresAt,
    ip_address: context.ipAddress ?? null,
    user_agent: context.userAgent?.slice(0, 500) ?? null,
  });

  if (insertError) {
    console.error('[otp] could not store challenge', insertError);
    return { ok: false, error: 'Could not send the code right now. Please try again.' };
  }

  const { data: settings } = await supabase.from('gym_settings').select('gym_name').eq('id', true).maybeSingle();
  const gymName = settings?.gym_name ?? 'Iron Core Fitness';

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  const outcome = await dispatch({
    kind: 'OTP',
    channel: 'SMS',
    recipient: phone,
    body: templates.otpMessage(code, gymName, Math.round(OTP_TTL_SECONDS / 60)),
    memberId: member?.id ?? null,
    // OTP bodies are transient; keep the log but not the code itself.
    metadata: { purpose: 'login' },
    meta: {
      templateId: serverEnv.msg91OtpTemplateId,
      variables: { OTP: code, otp: code, gym: gymName },
    },
  });

  const simulated = outcome.provider === 'console' || !outcome.sent;

  return {
    ok: true,
    expiresAt,
    simulated,
    devCode: serverEnv.demoMode ? code : undefined,
  };
}

export type OtpVerifyResult = { ok: true } | { ok: false; error: string; attemptsLeft?: number };

/** Checks a code and burns it. A code is single-use even if verification fails later. */
export async function verifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  const supabase = createAdminClient();
  const cleaned = code.replace(/\D/g, '');

  if (cleaned.length !== OTP_LENGTH) {
    return { ok: false, error: `Enter the ${OTP_LENGTH}-digit code from your SMS.` };
  }

  const { data: challenge, error } = await supabase
    .from('otp_challenges')
    .select('id, code_hash, expires_at, attempts')
    .eq('phone', phone)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[otp] verification lookup failed', error);
    return { ok: false, error: 'Could not verify the code. Please try again.' };
  }

  if (!challenge) {
    return { ok: false, error: 'That code has expired. Please request a new one.' };
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await supabase
      .from('otp_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challenge.id);
    return { ok: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }

  const matches = safeEquals(challenge.code_hash, hashCode(phone, cleaned));

  if (!matches) {
    const attempts = challenge.attempts + 1;
    await supabase.from('otp_challenges').update({ attempts }).eq('id', challenge.id);
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
    return {
      ok: false,
      error: attemptsLeft > 0 ? 'That code is not correct.' : 'Too many incorrect attempts. Request a new code.',
      attemptsLeft,
    };
  }

  await supabase
    .from('otp_challenges')
    .update({ consumed_at: new Date().toISOString(), attempts: challenge.attempts + 1 })
    .eq('id', challenge.id);

  return { ok: true };
}
