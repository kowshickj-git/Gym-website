import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { CheckoutClient } from './checkout-client';
import { requireMember } from '@/lib/auth/guards';
import { quoteFromDatabase, PricingError } from '@/lib/payments';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getGymSettings } from '@/lib/data';
import { isRazorpayConfigured } from '@/lib/env';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; coupon?: string }>;
}) {
  const { plan: planId, coupon } = await searchParams;
  const { member } = await requireMember();

  if (!planId) redirect('/plans');

  const settings = await getGymSettings();

  let quoted;
  try {
    quoted = await quoteFromDatabase(planId, { couponCode: coupon ?? null, memberId: member.id });
  } catch (error) {
    if (error instanceof PricingError) {
      return (
        <div className="mx-auto max-w-lg px-4 py-8">
          <Card>
            <EmptyState
              title="That plan is not available"
              description={error.message}
              action={
                <Button asChild>
                  <Link href="/plans">Back to plans</Link>
                </Button>
              }
            />
          </Card>
        </div>
      );
    }
    throw error;
  }

  // Where the new term would actually begin, so the summary can be honest about
  // renewals stacking rather than overwriting.
  const supabase = await createReadOnlyServerSupabase();
  const { data: startDate } = await supabase.rpc('fn_next_start_date', { p_member_id: member.id });

  return (
    <div className="mx-auto max-w-lg px-4 py-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/plans">
          <ArrowLeft aria-hidden />
          Back to plans
        </Link>
      </Button>

      <h1 className="mb-1 text-2xl font-bold tracking-tight">Checkout</h1>
      <p className="text-muted-foreground mb-5 text-sm">Review your plan, then pay securely.</p>

      <CheckoutClient
        plan={quoted.plan}
        initialQuote={quoted.quote}
        member={{ name: member.full_name, phone: member.phone, email: member.email }}
        gymName={settings.gym_name}
        gymPhone={settings.contact_phone}
        razorpayKeyId={publicEnv.razorpayKeyId}
        razorpayConfigured={isRazorpayConfigured()}
        upiEnabled={Boolean(settings.upi_enabled && settings.upi_vpa)}
        startDate={(startDate as unknown as string) ?? null}
      />
    </div>
  );
}
