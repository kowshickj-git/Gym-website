import Link from 'next/link';
import { ArrowRight, Check, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { perMonthPrice, savingsPercent, type Quote } from '@/lib/pricing';
import { cn, formatCurrency } from '@/lib/utils';
import type { PlanWithCategory } from '@/lib/data';
import type { MembershipCategory } from '@/types/database';

interface PlanGridProps {
  categories: MembershipCategory[];
  plans: PlanWithCategory[];
  quotes: Record<string, Quote>;
  /** Where the primary button goes. Receives the plan id. */
  hrefForPlan: (planId: string) => string;
  ctaLabel?: string;
  /** Renders the "already on this plan" marker. */
  currentPlanId?: string | null;
}

/**
 * The pricing grid, grouped by category.
 *
 * One card per duration, each showing base price struck through when a campaign
 * is running, so the saving is visible before the member commits to anything.
 */
export function PlanGrid({
  categories,
  plans,
  quotes,
  hrefForPlan,
  ctaLabel = 'Continue to payment',
  currentPlanId,
}: PlanGridProps) {
  const activeCategories = categories.filter((category) => plans.some((plan) => plan.category_id === category.id));

  if (activeCategories.length === 0) {
    return (
      <EmptyState
        icon={<Tag aria-hidden />}
        title="No plans published yet"
        description="Membership plans will appear here as soon as the gym adds them."
      />
    );
  }

  return (
    <div className="space-y-10">
      {activeCategories.map((category) => {
        const categoryPlans = plans
          .filter((plan) => plan.category_id === category.id)
          .sort((a, b) => a.duration_months - b.duration_months);

        return (
          <section key={category.id} aria-labelledby={`category-${category.id}`} className="space-y-4">
            <div className="space-y-1">
              <h2 id={`category-${category.id}`} className="text-xl font-bold sm:text-2xl">
                {category.name}
              </h2>
              {category.description ? (
                <p className="text-muted-foreground max-w-2xl text-sm text-pretty">{category.description}</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categoryPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  quote={quotes[plan.id]}
                  href={hrefForPlan(plan.id)}
                  ctaLabel={ctaLabel}
                  isCurrent={currentPlanId === plan.id}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function PlanCard({
  plan,
  quote,
  href,
  ctaLabel,
  isCurrent,
}: {
  plan: PlanWithCategory;
  quote: Quote | undefined;
  href: string;
  ctaLabel: string;
  isCurrent?: boolean;
}) {
  const base = Number(plan.base_price);
  const discount = quote?.discount_amount ?? 0;
  const final = quote?.final_amount ?? base;
  const percent = quote ? savingsPercent(quote) : 0;
  const monthly = quote ? perMonthPrice(quote) : base / Math.max(plan.duration_months, 1);

  return (
    <Card
      className={cn(
        'relative gap-4 py-5 transition-shadow hover:shadow-md',
        plan.highlight && 'border-primary/50 ring-primary/15 ring-1',
      )}
    >
      {plan.highlight ? (
        <Badge className="absolute -top-2.5 left-5 shadow-sm">{plan.highlight}</Badge>
      ) : null}

      <div className="space-y-1 px-5">
        <p className="text-base font-semibold">{plan.name}</p>
        <p className="text-muted-foreground text-xs">
          {plan.duration_months} {plan.duration_months === 1 ? 'month' : 'months'}
        </p>
      </div>

      <div className="space-y-1.5 px-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="tnum text-3xl font-bold tracking-tight">{formatCurrency(final)}</span>
          {discount > 0 ? (
            <span className="text-muted-foreground tnum text-sm line-through">{formatCurrency(base)}</span>
          ) : null}
        </div>

        {discount > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="success" className="gap-1">
              <Tag className="size-3" aria-hidden />
              Save {formatCurrency(discount)}
              {percent > 0 ? ` · ${percent}%` : ''}
            </Badge>
          </div>
        ) : null}

        {plan.duration_months > 1 ? (
          <p className="text-muted-foreground tnum text-xs">{formatCurrency(monthly)} per month</p>
        ) : null}

        {quote?.offer ? <p className="text-primary text-xs font-medium">{quote.offer.name} applied</p> : null}
      </div>

      {plan.description ? (
        <p className="text-muted-foreground px-5 text-sm text-pretty">{plan.description}</p>
      ) : null}

      <div className="mt-auto px-5">
        {isCurrent ? (
          <Button variant="secondary" className="w-full" disabled>
            <Check aria-hidden />
            Your current plan
          </Button>
        ) : (
          <Button asChild className="w-full">
            <Link href={href}>
              {ctaLabel}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
