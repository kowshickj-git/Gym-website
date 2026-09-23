import 'server-only';

import { createHmac } from 'node:crypto';
import { requireEnv, serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import type { AppUser, Member, UserRole } from '@/types/database';

/**
 * Turning a verified phone number into a Supabase session.
 *
 * Members authenticate by OTP, but Supabase still needs a credential behind the
 * session so that RLS has a real `auth.uid()` to work with. Each member is
 * therefore given an internal Supabase identity keyed to their phone number:
 *
 *   email    m919876543210@<MEMBER_EMAIL_DOMAIN>   (never shown, never mailed)
 *   password HMAC(AUTH_SECRET, "member:<phone>")   (derived, never stored)
 *
 * The member never sees or types either. Their real email address, if they have
 * one, lives on `members.email` where it belongs. Rotating AUTH_SECRET
 * invalidates every derived password, so treat it as a long-lived secret.
 */

const MEMBER_EMAIL_DOMAIN = process.env.MEMBER_EMAIL_DOMAIN?.trim() || 'members.ironcore.local';

function internalEmailFor(phone: string): string {
  return `m${phone.replace(/\D/g, '')}@${MEMBER_EMAIL_DOMAIN}`;
}

function derivedPasswordFor(phone: string): string {
  const secret = requireEnv('AUTH_SECRET', serverEnv.authSecret);
  // Prefixed so it always satisfies any future password-complexity policy.
  return `Ic1!${createHmac('sha256', secret).update(`member:${phone}`).digest('base64url').slice(0, 40)}`;
}

export interface ProvisionResult {
  userId: string;
  memberId: string | null;
  created: boolean;
}

/**
 * Ensures a Supabase auth user, a `public.users` row and — where the phone
 * belongs to an existing member record — the link between them.
 *
 * Walk-ins registered by the front desk get their member row first; this fills
 * in the login identity the moment they first sign in.
 */
export async function provisionMemberIdentity(phone: string): Promise<ProvisionResult> {
  const supabase = createAdminClient();
  const email = internalEmailFor(phone);
  const password = derivedPasswordFor(phone);

  const { data: existingAppUser } = await supabase
    .from('users')
    .select('id, role, is_active')
    .eq('phone', phone)
    .maybeSingle();

  let userId = existingAppUser?.id ?? null;
  let created = false;

  if (!userId) {
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { phone, login_method: 'otp' },
    });

    if (createError || !createdUser?.user) {
      // Most likely cause: the auth user already exists from an earlier sign-in
      // whose public.users row was removed. Recover by looking it up.
      const recovered = await findAuthUserByEmail(email);
      if (!recovered) {
        throw new Error(`Could not provision login for ${phone}: ${createError?.message ?? 'unknown error'}`);
      }
      userId = recovered;
      // Re-derive the password so the account is usable again.
      await supabase.auth.admin.updateUserById(userId, { password });
    } else {
      userId = createdUser.user.id;
      created = true;
    }
  }

  const { data: memberRow } = await supabase
    .from('members')
    .select('id, full_name, email, user_id')
    .eq('phone', phone)
    .maybeSingle();

  const { error: upsertError } = await supabase.from('users').upsert(
    {
      id: userId,
      phone,
      role: (existingAppUser as { role?: UserRole } | null)?.role ?? 'MEMBER',
      full_name: memberRow?.full_name ?? null,
      email: memberRow?.email ?? null,
      is_active: true,
    },
    { onConflict: 'id' },
  );

  if (upsertError) {
    throw new Error(`Could not provision user profile for ${phone}: ${upsertError.message}`);
  }

  if (memberRow && memberRow.user_id !== userId) {
    await supabase.from('members').update({ user_id: userId }).eq('id', memberRow.id);
  }

  return { userId, memberId: memberRow?.id ?? null, created };
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  // listUsers has no email filter in the current SDK; page through the first
  // few pages, which is ample for a single-gym deployment.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Signs the member in, writing the Supabase session cookies onto the current
 * response. Must be called from a Route Handler or Server Action.
 */
export async function createMemberSession(phone: string): Promise<{ userId: string; memberId: string | null }> {
  const identity = await provisionMemberIdentity(phone);
  const supabase = await createServerSupabase();

  const { error } = await supabase.auth.signInWithPassword({
    email: internalEmailFor(phone),
    password: derivedPasswordFor(phone),
  });

  if (error) {
    throw new Error(`Could not start the session: ${error.message}`);
  }

  return { userId: identity.userId, memberId: identity.memberId };
}

export interface CurrentUser {
  id: string;
  role: UserRole;
  profile: AppUser;
  member: Member | null;
}

/** The signed-in principal, or null. Reads the session cookie; RLS-safe. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
  if (!profile || !profile.is_active) return null;

  let member: Member | null = null;
  if (profile.role === 'MEMBER') {
    const { data } = await supabase.from('members').select('*').eq('user_id', user.id).maybeSingle();
    member = data ?? null;
  }

  return { id: user.id, role: profile.role, profile, member };
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
}
