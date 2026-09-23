import { z } from 'zod';
import { normalisePhone } from './phone';
import { OFFLINE_PAYMENT_METHODS } from './constants';

/**
 * Every value that crosses a trust boundary — form submissions, route handler
 * bodies, query strings — is parsed here first. Schemas are shared between the
 * client form and the server handler so the two can never drift.
 */

const trimmed = z.string().trim();

export const phoneField = trimmed
  .min(1, 'Mobile number is required')
  .transform((value, ctx) => {
    const normalised = normalisePhone(value);
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' });
      return z.NEVER;
    }
    return normalised;
  });

export const optionalPhoneField = trimmed
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (!value) return null;
    const normalised = normalisePhone(value);
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' });
      return z.NEVER;
    }
    return normalised;
  });

const optionalEmail = trimmed
  .optional()
  .nullable()
  .transform((value) => (value ? value.toLowerCase() : null))
  .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), 'Enter a valid email address');

const optionalText = (max: number) =>
  trimmed
    .max(max, `Keep this under ${max} characters`)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

/** Accepts "" from an unfilled number input and turns it into null. */
const optionalNumber = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((value, ctx) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a number` });
        return z.NEVER;
      }
      if (parsed < min || parsed > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be between ${min} and ${max}` });
        return z.NEVER;
      }
      return parsed;
    });

const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Use the date picker' });
      return z.NEVER;
    }
    return value;
  });

export const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);

// -----------------------------------------------------------------------------
// Authentication
// -----------------------------------------------------------------------------
export const otpRequestSchema = z.object({ phone: phoneField });

export const otpVerifySchema = z.object({
  phone: phoneField,
  code: trimmed.regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const adminLoginSchema = z.object({
  email: trimmed.min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// -----------------------------------------------------------------------------
// Members
// -----------------------------------------------------------------------------
export const memberCoreSchema = z.object({
  full_name: trimmed.min(2, 'Enter the full name').max(120, 'That name is too long'),
  phone: phoneField,
  email: optionalEmail,
  date_of_birth: optionalDate,
  gender: z.union([genderEnum, z.literal(''), z.null(), z.undefined()]).transform((v) => (v ? v : null)),
  weight_kg: optionalNumber(20, 400, 'Weight'),
  height_cm: optionalNumber(80, 250, 'Height'),
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: optionalPhoneField,
  address: optionalText(400),
  notes: optionalText(1000),
});

export const memberCreateSchema = memberCoreSchema.extend({
  join_date: optionalDate,
});

export const memberUpdateSchema = memberCoreSchema.extend({
  id: z.string().uuid(),
  join_date: optionalDate,
  is_active: z.boolean().optional(),
});

/** What a member may change about themselves. Phone is deliberately absent. */
export const memberSelfUpdateSchema = z.object({
  full_name: trimmed.min(2, 'Enter your full name').max(120),
  email: optionalEmail,
  date_of_birth: optionalDate,
  gender: z.union([genderEnum, z.literal(''), z.null(), z.undefined()]).transform((v) => (v ? v : null)),
  weight_kg: optionalNumber(20, 400, 'Weight'),
  height_cm: optionalNumber(80, 250, 'Height'),
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: optionalPhoneField,
});

// -----------------------------------------------------------------------------
// Catalogue
// -----------------------------------------------------------------------------
export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: trimmed.min(2, 'Enter a category name').max(80),
  slug: trimmed
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only'),
  description: optionalText(400),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
});

export const planSchema = z.object({
  id: z.string().uuid().optional(),
  category_id: z.string().uuid('Choose a category'),
  name: trimmed.min(1, 'Enter a plan name').max(60),
  duration_months: z.coerce
    .number()
    .int('Duration must be a whole number of months')
    .min(1, 'Minimum one month')
    .max(60, 'Maximum 60 months'),
  base_price: z.coerce.number().min(0, 'Price cannot be negative').max(1_000_000, 'That price looks wrong'),
  description: optionalText(400),
  highlight: optionalText(40),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
});

// -----------------------------------------------------------------------------
// Offers
// -----------------------------------------------------------------------------
export const offerSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: trimmed.min(2, 'Give the campaign a name').max(80),
    description: optionalText(400),
    banner_text: optionalText(60),
    discount_type: z.enum(['FIXED', 'PERCENTAGE']),
    discount_value: z.coerce.number().positive('Enter a discount greater than zero'),
    max_discount_amount: optionalNumber(1, 1_000_000, 'Maximum discount'),
    min_purchase_amount: z.coerce.number().min(0).default(0),
    starts_at: trimmed.min(1, 'Choose a start date'),
    ends_at: trimmed.min(1, 'Choose an end date'),
    coupon_code: trimmed
      .optional()
      .nullable()
      .transform((value) => (value ? value.toUpperCase() : null))
      .refine(
        (value) => value === null || /^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(value),
        'Coupon codes are 3-24 characters: letters, numbers, hyphen or underscore',
      ),
    auto_apply: z.boolean().default(true),
    is_active: z.boolean().default(true),
    usage_limit: optionalNumber(1, 100_000, 'Usage limit'),
    per_member_limit: optionalNumber(1, 100, 'Per-member limit'),
    category_ids: z.array(z.string().uuid()).default([]),
    duration_months: z.array(z.coerce.number().int().min(1).max(60)).default([]),
  })
  .refine((data) => new Date(data.ends_at) > new Date(data.starts_at), {
    message: 'The end date must be after the start date',
    path: ['ends_at'],
  })
  .refine((data) => data.discount_type !== 'PERCENTAGE' || data.discount_value <= 100, {
    message: 'A percentage discount cannot exceed 100%',
    path: ['discount_value'],
  })
  .refine((data) => data.auto_apply || Boolean(data.coupon_code), {
    message: 'An offer that is not applied automatically needs a coupon code',
    path: ['coupon_code'],
  });

// -----------------------------------------------------------------------------
// Checkout and payments
// -----------------------------------------------------------------------------
export const quoteRequestSchema = z.object({
  planId: z.string().uuid('Choose a plan'),
  couponCode: trimmed.max(24).optional().nullable(),
});

export const createOrderSchema = z.object({
  planId: z.string().uuid('Choose a plan'),
  couponCode: trimmed.max(24).optional().nullable(),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: trimmed.min(1),
  razorpay_payment_id: trimmed.min(1),
  razorpay_signature: trimmed.min(1),
});

export const cashPaymentSchema = z.object({
  member_id: z.string().uuid('Choose a member'),
  plan_id: z.string().uuid('Choose a plan'),
  method: z.enum(OFFLINE_PAYMENT_METHODS as [string, ...string[]]),
  coupon_code: trimmed.max(24).optional().nullable(),
  /** Lets the desk honour a hand-negotiated price; defaults to the quoted total. */
  amount_override: optionalNumber(0, 1_000_000, 'Amount'),
  notes: optionalText(500),
  paid_at: trimmed.optional().nullable(),
});

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------
export const gymSettingsSchema = z.object({
  gym_name: trimmed.min(2, 'Enter the gym name').max(100),
  tagline: optionalText(140),
  address_line1: optionalText(140),
  address_line2: optionalText(140),
  city: optionalText(80),
  state: optionalText(80),
  pincode: optionalText(10),
  contact_phone: optionalPhoneField,
  whatsapp_phone: optionalPhoneField,
  contact_email: optionalEmail,
  gstin: optionalText(20),
  receipt_prefix: trimmed
    .min(2, 'At least 2 characters')
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and hyphens only'),
  receipt_terms: optionalText(500),
  opening_hours: optionalText(140),
  maps_url: optionalText(300),
});

export const staffSchema = z.object({
  email: trimmed.min(1, 'Email is required').email('Enter a valid email address'),
  display_name: trimmed.min(2, 'Enter a name').max(80),
  designation: optionalText(60),
  role: z.enum(['ADMIN', 'STAFF']),
  can_collect_cash: z.boolean().default(true),
  can_manage_plans: z.boolean().default(false),
});

// -----------------------------------------------------------------------------
// Listing / filters
// -----------------------------------------------------------------------------
export const memberFilterSchema = z.object({
  q: trimmed.max(100).optional(),
  status: z.enum(['ALL', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'NONE']).default('ALL'),
  category: z.string().optional(),
  payment: z.enum(['ALL', 'PAID', 'UNPAID', 'CASH', 'ONLINE']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
});

export type MemberFilters = z.infer<typeof memberFilterSchema>;
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type PlanInput = z.infer<typeof planSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type OfferInput = z.infer<typeof offerSchema>;
export type CashPaymentInput = z.infer<typeof cashPaymentSchema>;
export type GymSettingsInput = z.infer<typeof gymSettingsSchema>;
export type StaffInput = z.infer<typeof staffSchema>;

/** Flattens a ZodError into the `{ field: message }` shape the forms expect. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
