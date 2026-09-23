import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * Message copy, kept in one place so the owner's tone stays consistent across
 * SMS, WhatsApp and email. Text is deliberately short — Indian transactional
 * SMS is billed per 160-character segment.
 */

export interface ExpiryReminderContext {
  memberName: string;
  gymName: string;
  planName: string;
  expiryDate: string;
  daysRemaining: number;
  renewUrl: string;
  gymPhone?: string | null;
}

export interface ReceiptContext {
  memberName: string;
  gymName: string;
  planName: string;
  amount: number;
  receiptNumber: string;
  expiryDate: string;
  receiptUrl: string;
}

export interface WelcomeContext {
  memberName: string;
  gymName: string;
  loginUrl: string;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function otpMessage(code: string, gymName: string, ttlMinutes: number): string {
  return `${code} is your ${gymName} login code. It expires in ${ttlMinutes} minutes. Do not share this code with anyone.`;
}

export function expiryReminder(ctx: ExpiryReminderContext): { subject: string; body: string } {
  const name = firstName(ctx.memberName);
  const when =
    ctx.daysRemaining > 1
      ? `in ${ctx.daysRemaining} days`
      : ctx.daysRemaining === 1
        ? 'tomorrow'
        : 'today';

  const subject =
    ctx.daysRemaining > 0
      ? `Your ${ctx.gymName} membership expires ${when}`
      : `Your ${ctx.gymName} membership expires today`;

  const body =
    `Hi ${name}, your ${ctx.planName} membership at ${ctx.gymName} expires ${when} ` +
    `(${formatDate(ctx.expiryDate)}). Renew here: ${ctx.renewUrl}` +
    (ctx.gymPhone ? ` or call ${ctx.gymPhone}.` : '.');

  return { subject, body };
}

export function expiredNotice(ctx: ExpiryReminderContext): { subject: string; body: string } {
  const name = firstName(ctx.memberName);
  return {
    subject: `Your ${ctx.gymName} membership has expired`,
    body:
      `Hi ${name}, your ${ctx.planName} membership at ${ctx.gymName} expired on ` +
      `${formatDate(ctx.expiryDate)}. Renew any time here: ${ctx.renewUrl}` +
      (ctx.gymPhone ? ` or call ${ctx.gymPhone}.` : '.'),
  };
}

export function paymentReceipt(ctx: ReceiptContext): { subject: string; body: string } {
  const name = firstName(ctx.memberName);
  return {
    subject: `Payment received — receipt ${ctx.receiptNumber}`,
    body:
      `Hi ${name}, we have received ${formatCurrency(ctx.amount)} for your ${ctx.planName} membership at ` +
      `${ctx.gymName}. Valid until ${formatDate(ctx.expiryDate)}. ` +
      `Receipt ${ctx.receiptNumber}: ${ctx.receiptUrl}`,
  };
}

export function welcome(ctx: WelcomeContext): { subject: string; body: string } {
  const name = firstName(ctx.memberName);
  return {
    subject: `Welcome to ${ctx.gymName}`,
    body:
      `Welcome ${name}! Your ${ctx.gymName} membership account is ready. ` +
      `Sign in with your mobile number at ${ctx.loginUrl} to see your plan, offers and receipts.`,
  };
}
