import { round2 } from './utils';
import type { DiscountType, Offer, OfferPlanRule } from '@/types/database';

/**
 * The discount engine.
 *
 * Pure functions with no I/O so they can be unit tested and so the same
 * evaluation runs whether we are painting a price card or authorising a
 * payment. The *caller* decides where the offers come from; the server always
 * re-quotes from the database before charging anyone, so a tampered client
 * price can never reach Razorpay.
 */

export interface PricingPlan {
  id: string;
  name: string;
  category_id: string;
  category_name?: string | null;
  duration_months: number;
  base_price: number;
}

/** An offer together with the rules that scope it. No rules means "all plans". */
export interface OfferWithRules extends Offer {
  rules: OfferPlanRule[];
}

export type IneligibleReason =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'BELOW_MINIMUM'
  | 'PLAN_NOT_ELIGIBLE'
  | 'USAGE_LIMIT_REACHED'
  | 'MEMBER_LIMIT_REACHED';

export interface EvaluatedOffer {
  offer: OfferWithRules;
  eligible: boolean;
  reason?: IneligibleReason;
  /** Rupees off. Zero when not eligible. */
  discount: number;
}

export interface AppliedOffer {
  id: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  coupon_code: string | null;
  /** True when this offer was selected because the member typed its coupon. */
  via_coupon: boolean;
}

export interface Quote {
  plan_id: string;
  plan_name: string;
  duration_months: number;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  offer: AppliedOffer | null;
  /** Set when a coupon was supplied but could not be used. */
  coupon_error: string | null;
  /** Every auto-apply offer that *could* have applied, best first. */
  alternatives: AppliedOffer[];
}

export interface QuoteOptions {
  couponCode?: string | null;
  /** Evaluation instant. Injectable so tests are not clock-dependent. */
  now?: Date;
  /** How many times this member has already redeemed each offer, by offer id. */
  memberUsage?: Record<string, number>;
}

const REASON_MESSAGE: Record<IneligibleReason, string> = {
  INACTIVE: 'This offer is no longer available.',
  NOT_STARTED: 'This offer has not started yet.',
  EXPIRED: 'This offer has expired.',
  BELOW_MINIMUM: 'This plan does not meet the minimum purchase amount for the offer.',
  PLAN_NOT_ELIGIBLE: 'This offer does not apply to the selected plan.',
  USAGE_LIMIT_REACHED: 'This offer has been fully claimed.',
  MEMBER_LIMIT_REACHED: 'You have already used this offer.',
};

/**
 * Does a single rule match the plan? Fields set within one rule are ANDed, so
 * `{ category: Cardio, duration: 12 }` means "the annual cardio plan" rather
 * than "anything cardio or anything annual".
 */
function ruleMatches(rule: OfferPlanRule, plan: PricingPlan): boolean {
  if (rule.plan_id && rule.plan_id !== plan.id) return false;
  if (rule.category_id && rule.category_id !== plan.category_id) return false;
  if (rule.duration_months !== null && rule.duration_months !== plan.duration_months) return false;
  return true;
}

/** Rules are ORed: an offer applies if any one of its rules matches. */
export function offerCoversPlan(offer: OfferWithRules, plan: PricingPlan): boolean {
  if (!offer.rules || offer.rules.length === 0) return true;
  return offer.rules.some((rule) => ruleMatches(rule, plan));
}

/** Rupees off for an offer, ignoring eligibility. Never exceeds the base. */
export function computeDiscount(
  offer: Pick<Offer, 'discount_type' | 'discount_value' | 'max_discount_amount'>,
  baseAmount: number,
): number {
  if (baseAmount <= 0) return 0;

  let discount: number;
  if (offer.discount_type === 'FIXED') {
    discount = Number(offer.discount_value);
  } else {
    discount = (baseAmount * Number(offer.discount_value)) / 100;
    const cap = offer.max_discount_amount;
    if (cap !== null && cap !== undefined && Number(cap) > 0) {
      discount = Math.min(discount, Number(cap));
    }
  }

  return round2(Math.max(0, Math.min(discount, baseAmount)));
}

export function evaluateOffer(
  offer: OfferWithRules,
  plan: PricingPlan,
  options: QuoteOptions = {},
): EvaluatedOffer {
  const now = options.now ?? new Date();
  const base = Number(plan.base_price);

  const fail = (reason: IneligibleReason): EvaluatedOffer => ({ offer, eligible: false, reason, discount: 0 });

  if (!offer.is_active) return fail('INACTIVE');
  if (new Date(offer.starts_at) > now) return fail('NOT_STARTED');
  if (new Date(offer.ends_at) < now) return fail('EXPIRED');
  if (base < Number(offer.min_purchase_amount ?? 0)) return fail('BELOW_MINIMUM');
  if (!offerCoversPlan(offer, plan)) return fail('PLAN_NOT_ELIGIBLE');
  if (offer.usage_limit !== null && offer.used_count >= offer.usage_limit) return fail('USAGE_LIMIT_REACHED');

  if (offer.per_member_limit !== null) {
    const used = options.memberUsage?.[offer.id] ?? 0;
    if (used >= offer.per_member_limit) return fail('MEMBER_LIMIT_REACHED');
  }

  return { offer, eligible: true, discount: computeDiscount(offer, base) };
}

function toApplied(offer: OfferWithRules, viaCoupon: boolean): AppliedOffer {
  return {
    id: offer.id,
    name: offer.name,
    discount_type: offer.discount_type,
    discount_value: Number(offer.discount_value),
    coupon_code: offer.coupon_code,
    via_coupon: viaCoupon,
  };
}

export function normaliseCoupon(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/**
 * Prices one plan against the full set of offers.
 *
 * When the member supplies a coupon *and* an automatic campaign is running, the
 * larger of the two wins — entering a coupon should never leave someone paying
 * more than they would have without it.
 */
export function quotePlan(plan: PricingPlan, offers: OfferWithRules[], options: QuoteOptions = {}): Quote {
  const base = round2(Number(plan.base_price));
  const coupon = normaliseCoupon(options.couponCode);

  const evaluations = offers.map((offer) => evaluateOffer(offer, plan, options));

  let couponError: string | null = null;
  let couponCandidate: EvaluatedOffer | null = null;

  if (coupon) {
    const match = evaluations.find((e) => normaliseCoupon(e.offer.coupon_code) === coupon);
    if (!match) {
      couponError = 'That coupon code is not valid.';
    } else if (!match.eligible) {
      couponError = REASON_MESSAGE[match.reason!];
    } else {
      couponCandidate = match;
    }
  }

  const autoCandidates = evaluations
    .filter((e) => e.eligible && e.offer.auto_apply && e.discount > 0)
    .sort((a, b) => b.discount - a.discount);

  const bestAuto = autoCandidates[0] ?? null;

  let winner: { evaluation: EvaluatedOffer; viaCoupon: boolean } | null = null;
  if (couponCandidate && bestAuto) {
    winner =
      couponCandidate.discount >= bestAuto.discount
        ? { evaluation: couponCandidate, viaCoupon: true }
        : { evaluation: bestAuto, viaCoupon: false };
  } else if (couponCandidate) {
    winner = { evaluation: couponCandidate, viaCoupon: true };
  } else if (bestAuto) {
    winner = { evaluation: bestAuto, viaCoupon: false };
  }

  const discount = winner ? winner.evaluation.discount : 0;

  return {
    plan_id: plan.id,
    plan_name: plan.name,
    duration_months: plan.duration_months,
    base_amount: base,
    discount_amount: round2(discount),
    final_amount: round2(Math.max(0, base - discount)),
    offer: winner ? toApplied(winner.evaluation.offer, winner.viaCoupon) : null,
    coupon_error: couponError,
    alternatives: autoCandidates
      .filter((c) => c.offer.id !== winner?.evaluation.offer.id)
      .map((c) => toApplied(c.offer, false)),
  };
}

/** Quotes every plan in one pass — used by the plans grid and the landing page. */
export function quotePlans(
  plans: PricingPlan[],
  offers: OfferWithRules[],
  options: QuoteOptions = {},
): Record<string, Quote> {
  const result: Record<string, Quote> = {};
  for (const plan of plans) {
    result[plan.id] = quotePlan(plan, offers, options);
  }
  return result;
}

/** Percentage saved, for the "SAVE 20%" ribbon. */
export function savingsPercent(quote: Quote): number {
  if (quote.base_amount <= 0 || quote.discount_amount <= 0) return 0;
  return Math.round((quote.discount_amount / quote.base_amount) * 100);
}

/** Per-month cost, so a member can compare a 12-month plan against a monthly one. */
export function perMonthPrice(quote: Quote): number {
  if (quote.duration_months <= 0) return quote.final_amount;
  return round2(quote.final_amount / quote.duration_months);
}

/** Razorpay works in paise; never send it a rupee float. */
export function toPaise(rupees: number): number {
  return Math.round(round2(rupees) * 100);
}

export function fromPaise(paise: number): number {
  return round2(paise / 100);
}
