'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gymSettingsSchema, staffSchema } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';

export interface SettingsState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '_form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** The gym's own details: name, address, receipt wording, contact numbers. */
export async function saveGymSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can change these settings.' };

  const parsed = gymSettingsSchema.safeParse({
    gym_name: formData.get('gym_name'),
    tagline: formData.get('tagline'),
    address_line1: formData.get('address_line1'),
    address_line2: formData.get('address_line2'),
    city: formData.get('city'),
    state: formData.get('state'),
    pincode: formData.get('pincode'),
    contact_phone: formData.get('contact_phone'),
    whatsapp_phone: formData.get('whatsapp_phone'),
    contact_email: formData.get('contact_email'),
    gstin: formData.get('gstin'),
    receipt_prefix: formData.get('receipt_prefix'),
    receipt_terms: formData.get('receipt_terms'),
    opening_hours: formData.get('opening_hours'),
    maps_url: formData.get('maps_url'),
    upi_vpa: formData.get('upi_vpa'),
    upi_payee_name: formData.get('upi_payee_name'),
    upi_enabled: formData.get('upi_enabled') === 'on',
  });

  if (!parsed.success) {
    return { error: 'Please check the highlighted fields.', fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('gym_settings').update(parsed.data).eq('id', true);

  if (error) {
    console.error('[admin] save settings failed', error);
    return { error: 'Could not save the settings. Please try again.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: 'SETTINGS_UPDATED',
    entity: 'gym_settings',
    after: { gym_name: parsed.data.gym_name, receipt_prefix: parsed.data.receipt_prefix },
  });

  // These strings appear on the landing page, in receipts and in reminders.
  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Invites a staff account.
 *
 * Creates the Supabase user with a temporary password the owner reads out; the
 * new member of staff signs in with it and is expected to change it. There is
 * no public signup path into the admin area, by design.
 */
export async function inviteStaff(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can add staff.' };

  const parsed = staffSchema.safeParse({
    email: formData.get('email'),
    display_name: formData.get('display_name'),
    designation: formData.get('designation'),
    role: formData.get('role'),
    can_collect_cash: formData.get('can_collect_cash') === 'on',
    can_manage_plans: formData.get('can_manage_plans') === 'on',
  });

  if (!parsed.success) {
    return { error: 'Please check the highlighted fields.', fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const temporaryPassword = formData.get('temporary_password');
  if (typeof temporaryPassword !== 'string' || temporaryPassword.length < 10) {
    return {
      error: 'Set a temporary password of at least 10 characters.',
      fieldErrors: { temporary_password: 'At least 10 characters.' },
    };
  }

  const supabase = createAdminClient();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.display_name, role: parsed.data.role },
  });

  if (createError || !created?.user) {
    if (createError?.message?.toLowerCase().includes('already')) {
      return { error: 'An account with that email already exists.', fieldErrors: { email: 'Already registered.' } };
    }
    console.error('[admin] create staff failed', createError);
    return { error: 'Could not create the staff account.' };
  }

  const { error: profileError } = await supabase.from('users').upsert(
    {
      id: created.user.id,
      role: parsed.data.role,
      full_name: parsed.data.display_name,
      email: parsed.data.email,
      is_active: true,
    },
    { onConflict: 'id' },
  );

  if (profileError) {
    console.error('[admin] staff profile failed', profileError);
    return { error: 'The account was created but its profile could not be saved.' };
  }

  await supabase.from('admin_users').upsert(
    {
      user_id: created.user.id,
      display_name: parsed.data.display_name,
      designation: parsed.data.designation,
      can_collect_cash: parsed.data.can_collect_cash,
      can_manage_plans: parsed.data.can_manage_plans,
      is_active: true,
    },
    { onConflict: 'user_id' },
  );

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: 'STAFF_CREATED',
    entity: 'users',
    entityId: created.user.id,
    after: { email: parsed.data.email, role: parsed.data.role },
  });

  revalidatePath('/admin/settings');
  return { success: true };
}

export async function setStaffActive(userId: string, isActive: boolean): Promise<{ error?: string }> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can manage staff.' };

  if (userId === admin.id) {
    return { error: 'You cannot deactivate your own account.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('users').update({ is_active: isActive }).eq('id', userId);

  if (error) {
    console.error('[admin] toggle staff failed', error);
    return { error: 'Could not update that account.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
    entity: 'users',
    entityId: userId,
    after: { is_active: isActive },
  });

  revalidatePath('/admin/settings');
  return {};
}
