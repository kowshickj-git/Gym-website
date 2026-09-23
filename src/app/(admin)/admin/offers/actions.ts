'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertAdmin } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { offerSchema } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';

export interface OfferState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const UNIQUE_VIOLATION = '23505';

function revalidateOffers() {
  revalidatePath('/admin/offers');
  revalidatePath('/offers');
  revalidatePath('/plans');
  revalidatePath('/');
}

/**
 * Creates or updates a campaign.
 *
 * Festival dates are never hard-coded: Pongal, Diwali and Puthandu move every
 * year, so the admin picks the window and the discount engine reads it at quote
 * time. The scope rules (categories, durations) are rewritten wholesale on each
 * save, which keeps "no rules means all plans" unambiguous.
 */
export async function saveOffer(_prev: OfferState, formData: FormData): Promise<OfferState> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can manage offers.' };

  const parsed = offerSchema.safeParse({
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    description: formData.get('description'),
    banner_text: formData.get('banner_text'),
    discount_type: formData.get('discount_type'),
    discount_value: formData.get('discount_value'),
    max_discount_amount: formData.get('max_discount_amount'),
    min_purchase_amount: formData.get('min_purchase_amount') || 0,
    starts_at: formData.get('starts_at'),
    ends_at: formData.get('ends_at'),
    coupon_code: formData.get('coupon_code'),
    auto_apply: formData.get('auto_apply') === 'on',
    is_active: formData.get('is_active') === 'on',
    usage_limit: formData.get('usage_limit'),
    per_member_limit: formData.get('per_member_limit'),
    category_ids: formData.getAll('category_ids').map(String).filter(Boolean),
    duration_months: formData.getAll('duration_months').map(String).filter(Boolean),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'Please check the highlighted fields.', fieldErrors };
  }

  const { id, category_ids, duration_months, ...fields } = parsed.data;
  const supabase = await createServerSupabase();

  const payload = {
    ...fields,
    starts_at: new Date(fields.starts_at).toISOString(),
    ends_at: new Date(fields.ends_at).toISOString(),
    created_by: admin.id,
  };

  const { data: saved, error } = id
    ? await supabase.from('offers').update(payload).eq('id', id).select('id').single()
    : await supabase.from('offers').insert(payload).select('id').single();

  if (error || !saved) {
    if (error?.code === UNIQUE_VIOLATION) {
      return { error: 'That coupon code is already in use.', fieldErrors: { coupon_code: 'Already taken.' } };
    }
    console.error('[admin] save offer failed', error);
    return { error: 'Could not save the offer. Please try again.' };
  }

  // Replace the scope rules rather than merging: the form shows the whole set,
  // so what the owner submitted is the complete truth.
  await supabase.from('offer_plan_rules').delete().eq('offer_id', saved.id);

  const rules: { offer_id: string; category_id: string | null; duration_months: number | null }[] = [];

  if (category_ids.length > 0 && duration_months.length > 0) {
    // Both chosen: the offer covers that grid of combinations.
    for (const categoryId of category_ids) {
      for (const months of duration_months) {
        rules.push({ offer_id: saved.id, category_id: categoryId, duration_months: months });
      }
    }
  } else if (category_ids.length > 0) {
    for (const categoryId of category_ids) {
      rules.push({ offer_id: saved.id, category_id: categoryId, duration_months: null });
    }
  } else if (duration_months.length > 0) {
    for (const months of duration_months) {
      rules.push({ offer_id: saved.id, category_id: null, duration_months: months });
    }
  }

  if (rules.length > 0) {
    const { error: ruleError } = await supabase.from('offer_plan_rules').insert(rules);
    if (ruleError) {
      console.error('[admin] save offer rules failed', ruleError);
      return { error: 'The offer was saved but its plan rules could not be applied. Please edit and try again.' };
    }
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: id ? 'OFFER_UPDATED' : 'OFFER_CREATED',
    entity: 'offers',
    entityId: saved.id,
    after: {
      name: fields.name,
      discount_type: fields.discount_type,
      discount_value: fields.discount_value,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      scope_rules: rules.length,
    },
  });

  revalidateOffers();
  redirect('/admin/offers?saved=1');
}

export async function setOfferActive(offerId: string, isActive: boolean): Promise<{ error?: string }> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can manage offers.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('offers').update({ is_active: isActive }).eq('id', offerId);

  if (error) {
    console.error('[admin] toggle offer failed', error);
    return { error: 'Could not update the offer.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: isActive ? 'OFFER_ACTIVATED' : 'OFFER_DEACTIVATED',
    entity: 'offers',
    entityId: offerId,
    after: { is_active: isActive },
  });

  revalidateOffers();
  return {};
}

export async function deleteOffer(offerId: string): Promise<{ error?: string }> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can manage offers.' };

  const supabase = await createServerSupabase();

  const { count } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('offer_id', offerId);

  if ((count ?? 0) > 0) {
    return {
      error: `${count} payment${count === 1 ? ' has' : 's have'} used this offer, so it cannot be deleted. Switch it off instead — the history stays intact.`,
    };
  }

  const { error } = await supabase.from('offers').delete().eq('id', offerId);
  if (error) {
    console.error('[admin] delete offer failed', error);
    return { error: 'Could not delete the offer.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: 'OFFER_DELETED',
    entity: 'offers',
    entityId: offerId,
  });

  revalidateOffers();
  return {};
}
