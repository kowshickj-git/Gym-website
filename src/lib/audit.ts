import 'server-only';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

/**
 * Audit trail.
 *
 * Writes are best effort: a gym should never fail to record a cash payment
 * because the audit insert had a hiccup. Failures are logged, not thrown.
 */

export interface AuditEntry {
  actorUserId?: string | null;
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

async function requestIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]!.trim();
    return headerList.get('x-real-ip');
  } catch {
    return null;
  }
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('audit_logs').insert({
      actor_user_id: entry.actorUserId ?? null,
      actor_label: entry.actorLabel ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      before_data: (entry.before ?? null) as Json,
      after_data: (entry.after ?? null) as Json,
      ip_address: await requestIp(),
    });
  } catch (error) {
    console.error('[audit] could not record entry', entry.action, error);
  }
}

/** Trims a row down to the fields worth keeping in the log. */
export function auditSnapshot<T extends Record<string, unknown>>(row: T | null, fields: (keyof T)[]): Json | null {
  if (!row) return null;
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) snapshot[String(field)] = row[field];
  return snapshot as Json;
}
