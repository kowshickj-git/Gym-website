import 'server-only';

import { cache } from 'react';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import type { OfferWithRules, PricingPlan } from '@/lib/pricing';
import type {
  GymSettings,
  MembershipCategory,
  MembershipPlan,
  Offer,
  OfferPlanRule,
} from '@/types/database';

/**
 * Shared read queries.
 *
 * Wrapped in React's `cache` so a page that needs the gym's name in three
 * places still issues one query per request.
 */

const FALLBACK_SETTINGS: GymSettings = {
  id: true,
  gym_name: 'Iron Core Fitness',
  tagline: 'Strength for every body, every day.',
  address_line1: null,
  address_line2: null,
  city: null,
  state: 'Tamil Nadu',
  pincode: null,
  contact_phone: null,
  whatsapp_phone: null,
  contact_email: null,
  gstin: null,
  logo_url: null,
  currency: 'INR',
  receipt_prefix: 'GYM',
  receipt_terms: null,
  reminder_offsets_days: [7, 3, 1, 0],
  opening_hours: null,
  maps_url: null,
  upi_vpa: null,
  upi_payee_name: null,
  upi_enabled: false,
  updated_at: new Date().toISOString(),
};

/**
 * The gym's own details. Falls back to sane defaults so the landing page still
 * renders on a fresh install where nobody has opened /admin/settings yet.
 */
export const getGymSettings = cache(async (): Promise<GymSettings> => {
  try {
    const supabase = await createReadOnlyServerSupabase();
    const { data } = await supabase.from('gym_settings').select('*').eq('id', true).maybeSingle();
    return data ?? FALLBACK_SETTINGS;
  } catch {
    return FALLBACK_SETTINGS;
  }
});

export const getCategories = cache(async (includeInactive = false): Promise<MembershipCategory[]> => {
  const supabase = await createReadOnlyServerSupabase();
  let query = supabase.from('membership_categories').select('*').order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data } = await query;
  return data ?? [];
});

export interface PlanWithCategory extends MembershipPlan {
  category: Pick<MembershipCategory, 'id' | 'name' | 'slug' | 'description' | 'icon'> | null;
}

export const getPlans = cache(async (includeInactive = false): Promise<PlanWithCategory[]> => {
  const supabase = await createReadOnlyServerSupabase();
  let query = supabase
    .from('membership_plans')
    .select('*, category:membership_categories(id, name, slug, description, icon)')
    .order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);

  const { data } = await query;
  return (data ?? []) as unknown as PlanWithCategory[];
});

/**
 * Live offers with their scoping rules attached, ready for the discount engine.
 * Anonymous callers only see currently-running campaigns (enforced by RLS);
 * staff see everything.
 */
export const getOffersWithRules = cache(async (includeInactive = false): Promise<OfferWithRules[]> => {
  const supabase = await createReadOnlyServerSupabase();

  let offerQuery = supabase.from('offers').select('*').order('ends_at', { ascending: true });
  if (!includeInactive) {
    const nowIso = new Date().toISOString();
    offerQuery = offerQuery.eq('is_active', true).lte('starts_at', nowIso).gte('ends_at', nowIso);
  }

  const { data: offers } = await offerQuery;
  if (!offers?.length) return [];

  const { data: rules } = await supabase
    .from('offer_plan_rules')
    .select('*')
    .in(
      'offer_id',
      offers.map((o) => o.id),
    );

  const byOffer = new Map<string, OfferPlanRule[]>();
  for (const rule of rules ?? []) {
    const list = byOffer.get(rule.offer_id) ?? [];
    list.push(rule);
    byOffer.set(rule.offer_id, list);
  }

  return offers.map((offer: Offer) => ({ ...offer, rules: byOffer.get(offer.id) ?? [] }));
});

/** Maps a plan row onto the shape the pricing engine expects. */
export function toPricingPlan(plan: PlanWithCategory): PricingPlan {
  return {
    id: plan.id,
    name: plan.name,
    category_id: plan.category_id,
    category_name: plan.category?.name ?? null,
    duration_months: plan.duration_months,
    base_price: Number(plan.base_price),
  };
}

/** How many times a member has already redeemed each offer. */
export async function getMemberOfferUsage(memberId: string): Promise<Record<string, number>> {
  const supabase = await createReadOnlyServerSupabase();
  const { data } = await supabase
    .from('payments')
    .select('offer_id')
    .eq('member_id', memberId)
    .eq('status', 'PAID')
    .not('offer_id', 'is', null);

  const usage: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.offer_id) usage[row.offer_id] = (usage[row.offer_id] ?? 0) + 1;
  }
  return usage;
}

/** The single membership a member should see on their dashboard. */
export async function getCurrentMembership(memberId: string) {
  const supabase = await createReadOnlyServerSupabase();
  const { data } = await supabase
    .from('memberships')
    .select('*')
    .eq('member_id', memberId)
    .neq('status', 'CANCELLED')
    .order('expiry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export function formattedGymAddress(settings: GymSettings): string {
  return [settings.address_line1, settings.address_line2, settings.city, settings.state, settings.pincode]
    .filter(Boolean)
    .join(', ');
}
