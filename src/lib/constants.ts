import type { MembershipStatus, PaymentMethod, PaymentState } from '@/types/database';

/**
 * Days before expiry at which a membership counts as "expiring soon".
 * Mirrored by public.fn_expiring_soon_days() in the database — change both.
 */
export const EXPIRING_SOON_DAYS = 7;

/** Offsets (days before expiry) at which reminders go out. 0 means expiry day. */
export const DEFAULT_REMINDER_OFFSETS = [7, 3, 1, 0];

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
/** Codes a single phone number may request per window. */
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 45;

export const PAGE_SIZE = 20;

export const CURRENCY = 'INR';
export const TIMEZONE = 'Asia/Kolkata';

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring soon',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  ONLINE: 'Online',
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
};

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  CREATED: 'Awaiting payment',
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

/** Methods a staff member can record by hand at the front desk. */
export const OFFLINE_PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'];

/**
 * Festival presets offered as a starting point when creating a campaign.
 * Dates are deliberately absent — the admin always picks the window, because
 * these festivals move every year.
 */
export const FESTIVAL_PRESETS = [
  { name: 'Pongal Offer', banner: 'Pongal Special', description: 'Pongal savings on gym memberships.' },
  { name: 'Tamil New Year Offer', banner: 'Puthandu Special', description: 'Start the Tamil new year strong.' },
  { name: 'Diwali Special', banner: 'Diwali Special', description: 'Festival of lights membership offer.' },
  { name: 'Independence Day Offer', banner: 'Independence Day', description: 'Freedom-week fitness offer.' },
  { name: 'Republic Day Offer', banner: 'Republic Day', description: 'Republic Day membership offer.' },
  { name: 'New Member Offer', banner: 'New here?', description: 'Welcome discount on a first membership.' },
] as const;
