import { type NextRequest } from 'next/server';
import { assertStaff, authErrorResponse } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Escapes a value for CSV: quote it, and double any quote inside. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Payment export for the gym's accountant.
 *
 * Streams as CSV rather than XLSX so it opens in anything, including the
 * spreadsheet apps most small businesses in India actually use.
 */
export async function GET(request: NextRequest) {
  try {
    await assertStaff();

    const months = Math.min(Math.max(Number(request.nextUrl.searchParams.get('months') ?? 6) || 6, 1), 36);
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const supabase = await createReadOnlyServerSupabase();
    const { data, error } = await supabase
      .from('payments')
      .select(
        'created_at, paid_at, amount, base_amount, discount_amount, method, status, coupon_code, collected_by_name, notes, razorpay_payment_id, plan_snapshot, members(full_name, phone), receipts(receipt_number)',
      )
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const header = [
      'Receipt number',
      'Date',
      'Member',
      'Phone',
      'Plan',
      'Category',
      'Base amount',
      'Discount',
      'Amount',
      'Method',
      'Status',
      'Coupon',
      'Collected by',
      'Reference',
      'Notes',
    ];

    const rows = (data ?? []).map((payment) => {
      const member = (Array.isArray(payment.members) ? payment.members[0] : payment.members) as
        | { full_name: string; phone: string }
        | undefined;
      const receipt = (Array.isArray(payment.receipts) ? payment.receipts[0] : payment.receipts) as
        | { receipt_number: string }
        | undefined;
      const snapshot = payment.plan_snapshot as { plan_name?: string; category_name?: string } | null;

      return [
        receipt?.receipt_number ?? '',
        payment.paid_at ?? payment.created_at,
        member?.full_name ?? '',
        member?.phone ?? '',
        snapshot?.plan_name ?? '',
        snapshot?.category_name ?? '',
        payment.base_amount,
        payment.discount_amount,
        payment.amount,
        PAYMENT_METHOD_LABEL[payment.method] ?? payment.method,
        payment.status,
        payment.coupon_code ?? '',
        payment.collected_by_name ?? '',
        payment.razorpay_payment_id ?? '',
        payment.notes ?? '',
      ];
    });

    // The BOM makes Excel open UTF-8 (and the rupee sign) correctly.
    const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

    const filename = `payments-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('[api] payment export failed', error);
    return Response.json({ error: 'Could not build the export.' }, { status: 500 });
  }
}
