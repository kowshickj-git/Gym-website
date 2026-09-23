'use server';

import { revalidatePath } from 'next/cache';
import { assertMember } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { memberSelfUpdateSchema } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';

export interface ProfileFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

/**
 * Member self-service edit.
 *
 * Goes through the `fn_update_my_profile` database function rather than a
 * direct table write, so the set of columns a member can change is enforced in
 * one place — the phone number, membership and amounts are not among them.
 */
export async function updateMyProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  let member;
  try {
    ({ member } = await assertMember());
  } catch {
    return { error: 'Please sign in again.' };
  }

  const parsed = memberSelfUpdateSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    date_of_birth: formData.get('date_of_birth'),
    gender: formData.get('gender'),
    weight_kg: formData.get('weight_kg'),
    height_cm: formData.get('height_cm'),
    emergency_contact_name: formData.get('emergency_contact_name'),
    emergency_contact_phone: formData.get('emergency_contact_phone'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'Please check the highlighted fields.', fieldErrors };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('fn_update_my_profile', {
    p_full_name: parsed.data.full_name,
    p_email: parsed.data.email,
    p_date_of_birth: parsed.data.date_of_birth,
    p_gender: parsed.data.gender,
    p_weight_kg: parsed.data.weight_kg,
    p_height_cm: parsed.data.height_cm,
    p_emergency_contact_name: parsed.data.emergency_contact_name,
    p_emergency_contact_phone: parsed.data.emergency_contact_phone,
  });

  if (error) {
    console.error('[profile] update failed', error);
    return { error: 'Could not save your details. Please try again.' };
  }

  await recordAudit({
    actorUserId: member.user_id,
    actorLabel: member.full_name,
    action: 'MEMBER_SELF_UPDATE',
    entity: 'members',
    entityId: member.id,
    after: parsed.data,
  });

  revalidatePath('/profile');
  revalidatePath('/dashboard');

  return { success: true };
}

/**
 * Saves (or clears) the member's own profile photo.
 *
 * The file itself is uploaded straight from the browser to Supabase Storage,
 * where the bucket policy confines a member to a folder named after their own
 * member id. This only records the resulting URL.
 */
export async function saveMyPhoto(url: string | null): Promise<{ error?: string }> {
  let member;
  try {
    ({ member } = await assertMember());
  } catch {
    return { error: 'Please sign in again.' };
  }

  if (url !== null && !isOwnPhotoUrl(url, member.id)) {
    return { error: 'That image could not be saved.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('fn_set_my_photo', { p_photo_url: url });

  if (error) {
    console.error('[profile] photo save failed', error);
    return { error: url ? 'Could not save the photo.' : 'Could not remove the photo.' };
  }

  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return {};
}

/**
 * Accepts only a public URL in this member's own folder of the photo bucket —
 * the action must not become a way to point a profile at an arbitrary address.
 */
function isOwnPhotoUrl(url: string, memberId: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.pathname.includes(`/storage/v1/object/public/member-photos/${memberId}/`)
    );
  } catch {
    return false;
  }
}
