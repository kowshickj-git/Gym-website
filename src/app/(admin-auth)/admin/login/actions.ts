'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerSupabase } from '@/lib/supabase/server';
import { adminLoginSchema } from '@/lib/validation';
import { hit } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/audit';
import { isStaffRole } from '@/lib/auth/guards';

export interface AdminLoginState {
  error?: string;
}

/**
 * Staff sign-in with email and password.
 *
 * Staff accounts are created by the owner (or the bootstrap script), never by
 * self-registration — there is no public signup path into the admin area.
 */
export async function adminLogin(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const limit = hit(`admin:login:${ip}`, 10, 900);
  if (!limit.allowed) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const parsed = adminLoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your email and password.' };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // Deliberately vague: this must not reveal which staff emails exist.
  if (error || !data.user) {
    return { error: 'Those details do not match a staff account.' };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active || !isStaffRole(profile.role)) {
    await supabase.auth.signOut();
    return { error: 'This account does not have access to the admin area.' };
  }

  await recordAudit({
    actorUserId: data.user.id,
    actorLabel: parsed.data.email,
    action: 'AUTH_LOGIN',
    entity: 'users',
    entityId: data.user.id,
    after: { method: 'password', role: profile.role },
  });

  const next = String(formData.get('next') ?? '').trim();
  // Only ever redirect within this site.
  redirect(next.startsWith('/admin') ? next : '/admin');
}
