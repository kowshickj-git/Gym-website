import 'server-only';

import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './session';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import type { Member, UserRole } from '@/types/database';

/**
 * Route guards.
 *
 * Pages call these at the top of the component; API routes call the `assert*`
 * variants and handle the thrown error. Authorisation is always re-checked on
 * the server — middleware only provides the fast redirect, never the decision.
 */

const STAFF_ROLES: UserRole[] = ['ADMIN', 'STAFF'];

export async function requireUser(redirectTo = '/login'): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(redirectTo);
  return user;
}

/** Staff-only pages. Members who wander in are sent to their own dashboard. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/admin/login');
  if (!STAFF_ROLES.includes(user.role)) redirect('/dashboard');
  return user;
}

/** Operations only the owner may perform (pricing, offers, settings, staff). */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/admin/login');
  if (user.role !== 'ADMIN') redirect('/admin');
  return user;
}

export interface MemberContext extends CurrentUser {
  member: Member;
}

/**
 * A signed-in member with a member record. Someone who signed in with a number
 * the gym has never registered lands on the onboarding page instead.
 */
export async function requireMember(): Promise<MemberContext> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (STAFF_ROLES.includes(user.role)) redirect('/admin');
  if (!user.member) redirect('/welcome');
  return user as MemberContext;
}

export class AuthorisationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthorisationError';
  }
}

/** Route-handler equivalent of `requireUser`. */
export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorisationError('You must be signed in.', 401);
  return user;
}

export async function assertStaff(): Promise<CurrentUser> {
  const user = await assertUser();
  if (!STAFF_ROLES.includes(user.role)) {
    throw new AuthorisationError('This action is restricted to gym staff.', 403);
  }
  return user;
}

export async function assertAdmin(): Promise<CurrentUser> {
  const user = await assertUser();
  if (user.role !== 'ADMIN') {
    throw new AuthorisationError('This action is restricted to the gym owner.', 403);
  }
  return user;
}

export async function assertMember(): Promise<MemberContext> {
  const user = await assertUser();
  if (!user.member) throw new AuthorisationError('No membership record is linked to this account.', 403);
  return user as MemberContext;
}

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role === 'ADMIN' || role === 'STAFF';
}

/**
 * Whether this account may take money: record a desk payment, or confirm or
 * reject a UPI payment. The owner always can. Other staff can only while the
 * owner leaves "Can take payments" switched on for them in /admin/settings.
 *
 * Checked by the actions themselves, not just by hiding buttons.
 */
export async function canTakePayments(user: CurrentUser): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'STAFF') return false;

  const supabase = await createReadOnlyServerSupabase();
  const { data } = await supabase
    .from('admin_users')
    .select('can_collect_cash, is_active')
    .eq('user_id', user.id)
    .maybeSingle();
  return Boolean(data?.is_active && data.can_collect_cash);
}

export const NO_PAYMENT_PERMISSION =
  'Your account is not allowed to take payments. Ask the gym owner to turn on "Can take payments" for you in Settings.';

/** Maps a thrown guard error onto an HTTP response. */
export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof AuthorisationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
