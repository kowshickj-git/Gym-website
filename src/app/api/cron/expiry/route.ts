import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch, reminderChannels, templates } from '@/lib/notifications';
import { DEFAULT_REMINDER_OFFSETS } from '@/lib/constants';
import { publicEnv, serverEnv } from '@/lib/env';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily expiry job. Wired up in vercel.json to run at 08:00 IST.
 *
 * Two jobs in one pass:
 *   1. Re-derive every membership's stored status, so the admin lists and the
 *      member dashboard agree with the calendar.
 *   2. Send the reminders due today.
 *
 * Duplicate protection lives in the database: each notification carries a
 * dedupe key of `expiry:<membership>:<offset>` against a unique index, so a
 * retried or manually re-run job cannot message anyone twice.
 */

interface DueMembership {
  id: string;
  member_id: string;
  plan_name: string;
  expiry_date: string;
  members: { id: string; full_name: string; phone: string; email: string | null; is_active: boolean } | null;
}

function isAuthorised(request: NextRequest): boolean {
  const expected = serverEnv.cronSecret;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const provided = bearer || (request.nextUrl.searchParams.get('secret') ?? '');

  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();

  // ---------------------------------------------------------------- Statuses
  const { data: refreshed, error: refreshError } = await supabase.rpc('fn_refresh_membership_statuses');
  if (refreshError) {
    console.error('[cron] status refresh failed', refreshError);
    return NextResponse.json({ error: 'Status refresh failed.' }, { status: 500 });
  }

  const [{ data: settings }] = await Promise.all([
    supabase.from('gym_settings').select('gym_name, contact_phone, reminder_offsets_days').eq('id', true).maybeSingle(),
  ]);

  const gymName = settings?.gym_name ?? 'Iron Core Fitness';
  const gymPhone = settings?.contact_phone ?? null;
  const offsets = settings?.reminder_offsets_days?.length
    ? settings.reminder_offsets_days
    : DEFAULT_REMINDER_OFFSETS;

  const results = { sent: 0, skipped: 0, failed: 0, considered: 0 };

  // --------------------------------------------------------------- Reminders
  for (const offset of offsets) {
    const target = istDatePlus(offset);

    const { data, error } = await supabase
      .from('memberships')
      .select('id, member_id, plan_name, expiry_date, members(id, full_name, phone, email, is_active)')
      .eq('expiry_date', target)
      .neq('status', 'CANCELLED')
      .limit(500);

    if (error) {
      console.error('[cron] could not load memberships for offset', offset, error);
      continue;
    }

    const due = (data ?? []) as unknown as DueMembership[];

    for (const membership of due) {
      const member = membership.members;
      // Deactivated members are not chased; that is what deactivating means.
      if (!member || !member.is_active) continue;

      results.considered += 1;

      const context = {
        memberName: member.full_name,
        gymName,
        planName: membership.plan_name,
        expiryDate: membership.expiry_date,
        daysRemaining: offset,
        renewUrl: `${publicEnv.siteUrl}/plans`,
        gymPhone,
      };

      const message = offset <= 0 ? templates.expiredNotice(context) : templates.expiryReminder(context);
      const channels = reminderChannels(Boolean(member.email));

      let delivered = false;
      for (const channel of channels) {
        const outcome = await dispatch({
          kind: offset <= 0 ? 'EXPIRED' : 'EXPIRY_REMINDER',
          channel,
          recipient: channel === 'EMAIL' ? member.email! : member.phone,
          subject: message.subject,
          body: message.body,
          memberId: member.id,
          membershipId: membership.id,
          // Offset, not date: re-running the job the same day is a no-op.
          dedupeKey: `expiry:${membership.id}:${offset}`,
          metadata: { offset, expiry_date: membership.expiry_date },
        });

        if (outcome.skipped) {
          results.skipped += 1;
          delivered = true;
          break;
        }
        if (outcome.sent) {
          results.sent += 1;
          delivered = true;
          break;
        }
      }

      if (!delivered) results.failed += 1;
    }
  }

  await supabase.rpc('fn_purge_expired_otps');

  const summary = {
    ok: true,
    durationMs: Date.now() - startedAt,
    statuses: Array.isArray(refreshed) ? refreshed[0] : refreshed,
    reminders: results,
    offsets,
  };

  await recordAudit({
    actorLabel: 'cron',
    action: 'CRON_EXPIRY_RUN',
    entity: 'memberships',
    after: summary,
  });

  console.info('[cron] expiry run complete', summary);
  return NextResponse.json(summary);
}

/** `YYYY-MM-DD` for today plus `days`, evaluated in IST. */
function istDatePlus(days: number): string {
  const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  nowIst.setDate(nowIst.getDate() + days);
  const year = nowIst.getFullYear();
  const month = String(nowIst.getMonth() + 1).padStart(2, '0');
  const day = String(nowIst.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Vercel Cron issues GET; POST is here so the job can be triggered by hand. */
export async function POST(request: NextRequest) {
  return GET(request);
}
