import type { Metadata } from 'next';
import Link from 'next/link';
import { Info, Tag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { PlanGrid } from '@/components/plan-grid';
import { MemberBottomNav } from '@/components/member/bottom-nav';
import {
  getCategories,
  getCurrentMembership,
  getGymSettings,
  getMemberOfferUsage,
  getOffersWithRules,
  getPlans,
  toPricingPlan,
} from '@/lib/data';
import { getCurrentUser } from '@/lib/auth/session';
import { quotePlans } from '@/lib/pricing';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getGymSettings();
  return {
    title: 'Membership plans and prices',
    description: `Monthly, 3-month, 6-month and annual gym memberships at ${settings.gym_name}. Cardio + weight training or weight training only.`,
    alternates: { canonical: '/plans' },
  };
}

export default async function PlansPage() {
  const user = await getCurrentUser().catch(() => null);
  const member = user?.member ?? null;

  const [categories, plans, offers, memberUsage, currentMembership] = await Promise.all([
    getCategories(),
    getPlans(),
    getOffersWithRules(),
    member ? getMemberOfferUsage(member.id) : Promise.resolve({}),
    member ? getCurrentMembership(member.id) : Promise.resolve(null),
  ]);

  const quotes = quotePlans(plans.map(toPricingPlan), offers, { memberUsage });
  const couponOnlyOffers = offers.filter((offer) => !offer.auto_apply && offer.coupon_code);

  return (
    <div className={member ? 'pb-safe-nav' : undefined}>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-12">
        <header className="space-y-2">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">Membership</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Plans and prices</h1>
          <p className="text-muted-foreground max-w-2xl text-pretty">
            Prices already include any festival discount running today. Pick a plan and pay by UPI, card or netbanking —
            or pay cash at the desk and we will record it for you.
          </p>
        </header>

        {currentMembership ? (
          <Alert variant="info">
            <Info aria-hidden />
            <AlertTitle>You are on the {currentMembership.plan_name} plan</AlertTitle>
            <AlertDescription>
              Valid until {formatDate(currentMembership.expiry_date)}. Renewing early does not cost you days — a new term
              starts the day after your current one ends.
            </AlertDescription>
          </Alert>
        ) : null}

        {couponOnlyOffers.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">Have a coupon?</span>
            {couponOnlyOffers.map((offer) => (
              <Badge key={offer.id} variant="outline" className="gap-1 px-2.5 py-1 font-mono text-xs">
                <Tag className="size-3" aria-hidden />
                {offer.coupon_code}
              </Badge>
            ))}
            <span className="text-muted-foreground text-sm">Enter it at checkout.</span>
          </div>
        ) : null}

        <PlanGrid
          categories={categories}
          plans={plans}
          quotes={quotes}
          hrefForPlan={(planId) => `/checkout?plan=${planId}`}
          ctaLabel={member ? 'Continue to payment' : 'Join now'}
        />

        <p className="text-muted-foreground text-sm">
          Questions about which plan fits?{' '}
          <Link href="/contact" className="text-foreground font-medium underline underline-offset-4">
            Talk to the front desk
          </Link>
          .
        </p>
      </div>

      {member ? <MemberBottomNav active="plans" /> : null}
    </div>
  );
}
