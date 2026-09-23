'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { categorySchema, planSchema } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';

export interface CatalogueState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '_form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

function revalidateCatalogue() {
  revalidatePath('/admin/plans');
  revalidatePath('/plans');
  revalidatePath('/');
}

/**
 * Creates or updates a plan.
 *
 * Prices live only here — nothing in the codebase hard-codes an amount, so the
 * owner can change what a 6-month cardio membership costs without a deploy.
 */
export async function savePlan(_prev: CatalogueState, formData: FormData): Promise<CatalogueState> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can change pricing.' };

  const parsed = planSchema.safeParse({
    id: formData.get('id') || undefined,
    category_id: formData.get('category_id'),
    name: formData.get('name'),
    duration_months: formData.get('duration_months'),
    base_price: formData.get('base_price'),
    description: formData.get('description'),
    highlight: formData.get('highlight'),
    is_active: formData.get('is_active') === 'on',
    sort_order: formData.get('sort_order') || 0,
  });

  if (!parsed.success) {
    return { error: 'Please check the highlighted fields.', fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const { id, ...fields } = parsed.data;
  const supabase = await createServerSupabase();

  const before = id ? (await supabase.from('membership_plans').select('*').eq('id', id).maybeSingle()).data : null;

  const { error } = id
    ? await supabase.from('membership_plans').update(fields).eq('id', id)
    : await supabase.from('membership_plans').insert(fields);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: 'That category already has a plan of this length.',
        fieldErrors: { duration_months: 'Edit the existing plan instead.' },
      };
    }
    console.error('[admin] save plan failed', error);
    return { error: 'Could not save the plan. Please try again.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: id ? 'PLAN_UPDATED' : 'PLAN_CREATED',
    entity: 'membership_plans',
    entityId: id ?? null,
    before: before ? { name: before.name, base_price: before.base_price, is_active: before.is_active } : null,
    after: { name: fields.name, base_price: fields.base_price, is_active: fields.is_active },
  });

  revalidateCatalogue();
  return { success: true };
}

export async function setPlanActive(planId: string, isActive: boolean): Promise<{ error?: string }> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can change pricing.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('membership_plans').update({ is_active: isActive }).eq('id', planId);

  if (error) {
    console.error('[admin] toggle plan failed', error);
    return { error: 'Could not update the plan.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: isActive ? 'PLAN_ACTIVATED' : 'PLAN_DEACTIVATED',
    entity: 'membership_plans',
    entityId: planId,
    after: { is_active: isActive },
  });

  revalidateCatalogue();
  return {};
}

/**
 * Deletes a plan. Refuses when memberships reference it — deactivating is the
 * right move there, so the history of what people bought stays intact.
 */
export async function deletePlan(planId: string): Promise<{ error?: string }> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can change pricing.' };

  const supabase = await createServerSupabase();

  const { count } = await supabase
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId);

  if ((count ?? 0) > 0) {
    return {
      error: `${count} membership${count === 1 ? '' : 's'} use this plan, so it cannot be deleted. Deactivate it instead — it will disappear from the plans page but the history stays.`,
    };
  }

  const { error } = await supabase.from('membership_plans').delete().eq('id', planId);
  if (error) {
    console.error('[admin] delete plan failed', error);
    return { error: 'Could not delete the plan.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: 'PLAN_DELETED',
    entity: 'membership_plans',
    entityId: planId,
  });

  revalidateCatalogue();
  return {};
}

/** Categories are extensible: the gym can add "Personal Training" later. */
export async function saveCategory(_prev: CatalogueState, formData: FormData): Promise<CatalogueState> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can change categories.' };

  const rawName = String(formData.get('name') ?? '');
  const rawSlug = String(formData.get('slug') ?? '').trim();

  const parsed = categorySchema.safeParse({
    id: formData.get('id') || undefined,
    name: rawName,
    slug: rawSlug || slugify(rawName),
    description: formData.get('description'),
    is_active: formData.get('is_active') === 'on',
    sort_order: formData.get('sort_order') || 0,
  });

  if (!parsed.success) {
    return { error: 'Please check the highlighted fields.', fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const { id, ...fields } = parsed.data;
  const supabase = await createServerSupabase();

  const { error } = id
    ? await supabase.from('membership_categories').update(fields).eq('id', id)
    : await supabase.from('membership_categories').insert(fields);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: 'A category with that name already exists.', fieldErrors: { name: 'Already in use.' } };
    }
    console.error('[admin] save category failed', error);
    return { error: 'Could not save the category.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: id ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED',
    entity: 'membership_categories',
    entityId: id ?? null,
    after: { name: fields.name, is_active: fields.is_active },
  });

  revalidateCatalogue();
  return { success: true };
}

export async function deleteCategory(categoryId: string): Promise<{ error?: string }> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can change categories.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('membership_categories').delete().eq('id', categoryId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { error: 'This category still has plans. Delete or move those first, or just deactivate the category.' };
    }
    console.error('[admin] delete category failed', error);
    return { error: 'Could not delete the category.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: 'CATEGORY_DELETED',
    entity: 'membership_categories',
    entityId: categoryId,
  });

  revalidateCatalogue();
  return {};
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
