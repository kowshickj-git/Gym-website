'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertAdmin, assertStaff } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { memberCreateSchema, memberUpdateSchema } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';
import { dispatch, reminderChannels, templates } from '@/lib/notifications';
import { getGymSettings } from '@/lib/data';
import { siteUrl } from '@/lib/env';

export interface MemberFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  memberId?: string;
}

const UNIQUE_VIOLATION = '23505';

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '_form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

function readMemberForm(formData: FormData) {
  return {
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    date_of_birth: formData.get('date_of_birth'),
    gender: formData.get('gender'),
    weight_kg: formData.get('weight_kg'),
    height_cm: formData.get('height_cm'),
    emergency_contact_name: formData.get('emergency_contact_name'),
    emergency_contact_phone: formData.get('emergency_contact_phone'),
    address: formData.get('address'),
    notes: formData.get('notes'),
    join_date: formData.get('join_date'),
  };
}

/** Registers a walk-in. The member can sign in with this number immediately. */
export async function createMember(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const staff = await assertStaff().catch(() => null);
  if (!staff) return { error: 'Your session has expired. Please sign in again.' };

  const parsed = memberCreateSchema.safeParse(readMemberForm(formData));
  if (!parsed.success) {
    return { error: 'Please check the highlighted fields.', fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('members')
    .insert({
      ...parsed.data,
      join_date: parsed.data.join_date ?? undefined,
      created_by: staff.id,
    })
    .select('id, full_name, phone, email')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: 'That mobile number is already registered.',
        fieldErrors: { phone: 'A member with this number already exists.' },
      };
    }
    console.error('[admin] create member failed', error);
    return { error: 'Could not save the member. Please try again.' };
  }

  await recordAudit({
    actorUserId: staff.id,
    actorLabel: staff.profile.full_name ?? staff.profile.email,
    action: 'MEMBER_CREATED',
    entity: 'members',
    entityId: data.id,
    after: { full_name: data.full_name, phone: data.phone },
  });

  // Welcome message is a nicety, never a reason to fail the registration.
  void sendWelcome(data.id, data.full_name, data.phone, data.email).catch((welcomeError) =>
    console.error('[admin] welcome message failed', welcomeError),
  );

  revalidatePath('/admin/members');
  revalidatePath('/admin');
  redirect(`/admin/members/${data.id}?created=1`);
}

async function sendWelcome(memberId: string, name: string, phone: string, email: string | null) {
  const settings = await getGymSettings();
  const message = templates.welcome({
    memberName: name,
    gymName: settings.gym_name,
    loginUrl: `${siteUrl()}/login`,
  });

  for (const channel of reminderChannels(Boolean(email))) {
    const outcome = await dispatch({
      kind: 'WELCOME',
      channel,
      recipient: channel === 'EMAIL' ? email! : phone,
      subject: message.subject,
      body: message.body,
      memberId,
      dedupeKey: `welcome:${memberId}:${channel}`,
    });
    if (outcome.sent || outcome.skipped) break;
  }
}

export async function updateMember(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const staff = await assertStaff().catch(() => null);
  if (!staff) return { error: 'Your session has expired. Please sign in again.' };

  const parsed = memberUpdateSchema.safeParse({
    ...readMemberForm(formData),
    id: formData.get('id'),
    is_active: formData.get('is_active') === 'on',
  });

  if (!parsed.success) {
    return { error: 'Please check the highlighted fields.', fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const { id, ...fields } = parsed.data;
  const supabase = await createServerSupabase();

  const { data: before } = await supabase.from('members').select('*').eq('id', id).maybeSingle();

  const { error } = await supabase
    .from('members')
    .update({ ...fields, join_date: fields.join_date ?? undefined })
    .eq('id', id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: 'That mobile number belongs to another member.', fieldErrors: { phone: 'Already in use.' } };
    }
    console.error('[admin] update member failed', error);
    return { error: 'Could not save the changes. Please try again.' };
  }

  // Keep the login identity in step when staff correct a phone number.
  if (before && before.phone !== fields.phone && before.user_id) {
    await createAdminClient().from('users').update({ phone: fields.phone }).eq('id', before.user_id);
  }

  await recordAudit({
    actorUserId: staff.id,
    actorLabel: staff.profile.full_name ?? staff.profile.email,
    action: 'MEMBER_UPDATED',
    entity: 'members',
    entityId: id,
    before: before ? { full_name: before.full_name, phone: before.phone, is_active: before.is_active } : null,
    after: { full_name: fields.full_name, phone: fields.phone, is_active: fields.is_active },
  });

  revalidatePath(`/admin/members/${id}`);
  revalidatePath('/admin/members');

  return { success: true, memberId: id };
}

/** Deactivating keeps the history; it only takes the member off the active lists. */
export async function setMemberActive(memberId: string, isActive: boolean): Promise<{ error?: string }> {
  const staff = await assertStaff().catch(() => null);
  if (!staff) return { error: 'Your session has expired.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('members').update({ is_active: isActive }).eq('id', memberId);

  if (error) {
    console.error('[admin] toggle member failed', error);
    return { error: 'Could not update the member.' };
  }

  await recordAudit({
    actorUserId: staff.id,
    actorLabel: staff.profile.full_name ?? staff.profile.email,
    action: isActive ? 'MEMBER_REACTIVATED' : 'MEMBER_DEACTIVATED',
    entity: 'members',
    entityId: memberId,
    after: { is_active: isActive },
  });

  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath('/admin/members');
  return {};
}

/**
 * Saves a member's photo on their behalf.
 *
 * The file is uploaded from the browser straight to Supabase Storage; this only
 * records the resulting URL, and only accepts one that points into this
 * member's folder of the photo bucket.
 */
export async function saveMemberPhoto(memberId: string, url: string | null): Promise<{ error?: string }> {
  const staff = await assertStaff().catch(() => null);
  if (!staff) return { error: 'Your session has expired.' };

  if (url !== null && !isMemberPhotoUrl(url, memberId)) {
    return { error: 'That image could not be saved.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('members').update({ photo_url: url }).eq('id', memberId);

  if (error) {
    console.error('[admin] member photo save failed', error);
    return { error: url ? 'Could not save the photo.' : 'Could not remove the photo.' };
  }

  await recordAudit({
    actorUserId: staff.id,
    actorLabel: staff.profile.full_name ?? staff.profile.email,
    action: url ? 'MEMBER_PHOTO_SET' : 'MEMBER_PHOTO_CLEARED',
    entity: 'members',
    entityId: memberId,
  });

  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath('/admin/members');
  return {};
}

function isMemberPhotoUrl(url: string, memberId: string): boolean {
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

/** Cancels a membership without deleting it, so reports stay accurate. */
export async function cancelMembership(membershipId: string, reason: string): Promise<{ error?: string }> {
  const admin = await assertAdmin().catch(() => null);
  if (!admin) return { error: 'Only the gym owner can cancel a membership.' };

  const why = reason.trim();
  if (why.length < 3) return { error: 'Say briefly why, so the history makes sense later.' };

  const supabase = await createServerSupabase();
  const { data: membership } = await supabase
    .from('memberships')
    .select('id, member_id, status')
    .eq('id', membershipId)
    .maybeSingle();

  if (!membership) return { error: 'That membership no longer exists.' };
  if (membership.status === 'CANCELLED') return { error: 'That membership is already cancelled.' };

  const { error } = await supabase
    .from('memberships')
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancel_reason: why.slice(0, 300) })
    .eq('id', membershipId);

  if (error) {
    console.error('[admin] cancel membership failed', error);
    return { error: 'Could not cancel the membership.' };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorLabel: admin.profile.full_name ?? admin.profile.email,
    action: 'MEMBERSHIP_CANCELLED',
    entity: 'memberships',
    entityId: membershipId,
    before: { status: membership.status },
    after: { status: 'CANCELLED', reason: why },
  });

  revalidatePath(`/admin/members/${membership.member_id}`);
  revalidatePath('/admin/members');
  return {};
}
