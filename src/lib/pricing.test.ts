import { describe, expect, it } from 'vitest';
import {
  computeDiscount,
  offerCoversPlan,
  quotePlan,
  savingsPercent,
  toPaise,
  type OfferWithRules,
  type PricingPlan,
} from './pricing';
import type { Offer, OfferPlanRule } from '@/types/database';

const NOW = new Date('2026-10-20T10:00:00.000Z');

const CARDIO = 'cat-cardio';
const WEIGHTS = 'cat-weights';

const annualCardio: PricingPlan = {
  id: 'plan-annual-cardio',
  name: 'Annual',
  category_id: CARDIO,
  category_name: 'Cardio + Weight Training',
  duration_months: 12,
  base_price: 10000,
};

const monthlyWeights: PricingPlan = {
  id: 'plan-monthly-weights',
  name: 'Monthly',
  category_id: WEIGHTS,
  category_name: 'Weight Training Only',
  duration_months: 1,
  base_price: 800,
};

function makeOffer(overrides: Partial<Offer> & { rules?: OfferPlanRule[] } = {}): OfferWithRules {
  const { rules = [], ...rest } = overrides;
  return {
    id: 'offer-1',
    name: 'Test Offer',
    description: null,
    banner_text: null,
    discount_type: 'PERCENTAGE',
    discount_value: 20,
    max_discount_amount: null,
    min_purchase_amount: 0,
    starts_at: '2026-10-01T00:00:00.000Z',
    ends_at: '2026-11-01T00:00:00.000Z',
    coupon_code: null,
    auto_apply: true,
    is_active: true,
    usage_limit: null,
    per_member_limit: null,
    used_count: 0,
    created_by: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...rest,
    rules,
  };
}

function makeRule(overrides: Partial<OfferPlanRule> = {}): OfferPlanRule {
  return {
    id: 'rule-1',
    offer_id: 'offer-1',
    category_id: null,
    plan_id: null,
    duration_months: null,
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeDiscount', () => {
  it('takes a flat amount off for a fixed discount', () => {
    expect(computeDiscount({ discount_type: 'FIXED', discount_value: 1000, max_discount_amount: null }, 10000)).toBe(
      1000,
    );
  });

  it('takes a proportion off for a percentage discount', () => {
    expect(
      computeDiscount({ discount_type: 'PERCENTAGE', discount_value: 20, max_discount_amount: null }, 10000),
    ).toBe(2000);
  });

  it('honours the percentage cap', () => {
    expect(computeDiscount({ discount_type: 'PERCENTAGE', discount_value: 50, max_discount_amount: 1500 }, 10000)).toBe(
      1500,
    );
  });

  it('never discounts more than the price itself', () => {
    expect(computeDiscount({ discount_type: 'FIXED', discount_value: 5000, max_discount_amount: null }, 800)).toBe(800);
  });

  it('rounds to paise rather than leaving float dust', () => {
    expect(computeDiscount({ discount_type: 'PERCENTAGE', discount_value: 33.33, max_discount_amount: null }, 2100)).toBe(
      699.93,
    );
  });
});

describe('offerCoversPlan', () => {
  it('covers everything when the offer has no rules', () => {
    expect(offerCoversPlan(makeOffer(), annualCardio)).toBe(true);
    expect(offerCoversPlan(makeOffer(), monthlyWeights)).toBe(true);
  });

  it('matches on duration', () => {
    const offer = makeOffer({ rules: [makeRule({ duration_months: 12 })] });
    expect(offerCoversPlan(offer, annualCardio)).toBe(true);
    expect(offerCoversPlan(offer, monthlyWeights)).toBe(false);
  });

  it('ANDs the fields inside one rule', () => {
    const offer = makeOffer({ rules: [makeRule({ category_id: WEIGHTS, duration_months: 12 })] });
    // Right category, wrong duration.
    expect(offerCoversPlan(offer, { ...monthlyWeights, duration_months: 1 })).toBe(false);
    expect(offerCoversPlan(offer, { ...monthlyWeights, duration_months: 12 })).toBe(true);
  });

  it('ORs separate rules', () => {
    const offer = makeOffer({
      rules: [makeRule({ id: 'r1', duration_months: 6 }), makeRule({ id: 'r2', duration_months: 12 })],
    });
    expect(offerCoversPlan(offer, annualCardio)).toBe(true);
  });
});

describe('quotePlan', () => {
  it('returns the base price when nothing applies', () => {
    const quote = quotePlan(annualCardio, [], { now: NOW });
    expect(quote.base_amount).toBe(10000);
    expect(quote.discount_amount).toBe(0);
    expect(quote.final_amount).toBe(10000);
    expect(quote.offer).toBeNull();
  });

  it('applies a running auto campaign', () => {
    const diwali = makeOffer({ name: 'Diwali Special', discount_value: 20, max_discount_amount: 2000 });
    const quote = quotePlan(annualCardio, [diwali], { now: NOW });
    expect(quote.discount_amount).toBe(2000);
    expect(quote.final_amount).toBe(8000);
    expect(quote.offer?.name).toBe('Diwali Special');
    expect(quote.offer?.via_coupon).toBe(false);
  });

  it('ignores a campaign whose window has not opened', () => {
    const scheduled = makeOffer({ starts_at: '2026-12-01T00:00:00.000Z', ends_at: '2026-12-15T00:00:00.000Z' });
    expect(quotePlan(annualCardio, [scheduled], { now: NOW }).discount_amount).toBe(0);
  });

  it('ignores a campaign whose window has closed', () => {
    const past = makeOffer({ starts_at: '2026-01-01T00:00:00.000Z', ends_at: '2026-01-15T00:00:00.000Z' });
    expect(quotePlan(annualCardio, [past], { now: NOW }).discount_amount).toBe(0);
  });

  it('ignores a deactivated campaign', () => {
    expect(quotePlan(annualCardio, [makeOffer({ is_active: false })], { now: NOW }).discount_amount).toBe(0);
  });

  it('enforces the minimum purchase amount', () => {
    const offer = makeOffer({ min_purchase_amount: 3000 });
    expect(quotePlan(monthlyWeights, [offer], { now: NOW }).discount_amount).toBe(0);
    expect(quotePlan(annualCardio, [offer], { now: NOW }).discount_amount).toBe(2000);
  });

  it('picks the most generous of several auto offers', () => {
    const small = makeOffer({ id: 'small', name: 'Small', discount_type: 'FIXED', discount_value: 500 });
    const big = makeOffer({ id: 'big', name: 'Big', discount_type: 'PERCENTAGE', discount_value: 25 });
    const quote = quotePlan(annualCardio, [small, big], { now: NOW });
    expect(quote.offer?.id).toBe('big');
    expect(quote.discount_amount).toBe(2500);
    expect(quote.alternatives.map((a) => a.id)).toEqual(['small']);
  });

  it('applies a coupon that is not auto-applied', () => {
    const coupon = makeOffer({ id: 'c', name: 'New Member', coupon_code: 'NEWYOU', auto_apply: false, discount_value: 10 });
    const without = quotePlan(annualCardio, [coupon], { now: NOW });
    expect(without.discount_amount).toBe(0);

    const withCode = quotePlan(annualCardio, [coupon], { now: NOW, couponCode: 'newyou' });
    expect(withCode.discount_amount).toBe(1000);
    expect(withCode.offer?.via_coupon).toBe(true);
    expect(withCode.coupon_error).toBeNull();
  });

  it('reports an unknown coupon without failing the quote', () => {
    const quote = quotePlan(annualCardio, [], { now: NOW, couponCode: 'NOPE' });
    expect(quote.coupon_error).toBe('That coupon code is not valid.');
    expect(quote.final_amount).toBe(10000);
  });

  it('explains why an otherwise-valid coupon does not apply here', () => {
    const coupon = makeOffer({
      coupon_code: 'BIGONLY',
      auto_apply: false,
      rules: [makeRule({ duration_months: 12 })],
    });
    const quote = quotePlan(monthlyWeights, [coupon], { now: NOW, couponCode: 'BIGONLY' });
    expect(quote.coupon_error).toBe('This offer does not apply to the selected plan.');
    expect(quote.discount_amount).toBe(0);
  });

  it('keeps the better deal when a coupon is worth less than the live campaign', () => {
    const auto = makeOffer({ id: 'auto', name: 'Diwali', discount_type: 'FIXED', discount_value: 2000 });
    const coupon = makeOffer({
      id: 'coupon',
      name: 'Small Coupon',
      coupon_code: 'SAVE100',
      auto_apply: false,
      discount_type: 'FIXED',
      discount_value: 100,
    });
    const quote = quotePlan(annualCardio, [auto, coupon], { now: NOW, couponCode: 'SAVE100' });
    expect(quote.offer?.id).toBe('auto');
    expect(quote.discount_amount).toBe(2000);
  });

  it('stops honouring an offer once its global usage limit is hit', () => {
    const offer = makeOffer({ usage_limit: 10, used_count: 10 });
    expect(quotePlan(annualCardio, [offer], { now: NOW }).discount_amount).toBe(0);
  });

  it('stops honouring an offer once this member has used it up', () => {
    const offer = makeOffer({ id: 'once', per_member_limit: 1 });
    expect(quotePlan(annualCardio, [offer], { now: NOW, memberUsage: { once: 1 } }).discount_amount).toBe(0);
    expect(quotePlan(annualCardio, [offer], { now: NOW, memberUsage: { once: 0 } }).discount_amount).toBe(2000);
  });

  it('never produces a negative total', () => {
    const huge = makeOffer({ discount_type: 'FIXED', discount_value: 99999 });
    const quote = quotePlan(monthlyWeights, [huge], { now: NOW });
    expect(quote.final_amount).toBe(0);
    expect(quote.discount_amount).toBe(800);
  });
});

describe('derived helpers', () => {
  it('reports the percentage saved', () => {
    const quote = quotePlan(annualCardio, [makeOffer({ discount_value: 20 })], { now: NOW });
    expect(savingsPercent(quote)).toBe(20);
  });

  it('converts rupees to whole paise', () => {
    expect(toPaise(8000)).toBe(800000);
    expect(toPaise(699.93)).toBe(69993);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
});
