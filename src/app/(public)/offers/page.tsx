import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarDays, PartyPopper, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { MemberBottomNav } from '@/components/member/bottom-nav';
import { getCategories, getGymSettings, getOffersWithRules } from '@/lib/data';
import { getCurrentUser } from '@/lib/auth/session';
import { formatCurrency, formatDate, daysUntil, pluralise } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getGymSettings();
  return {
    title: 'Current offers and festival discounts',
    description: `Running membership offers at ${settings.gym_name} — festival campaigns, coupon codes and new-member discounts.`,
    alternates: { canonical: '/offers' },
  };
}

export default async function OffersPage() {
  const [user, offers, categories] = await Promise.all([
    getCurrentUser().catch(() => null),
    getOffersWithRules(),
    getCategories(),
  ]);

  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const isMember = Boolean(user?.member);

  return (
    <div className={isMember ? 'pb-safe-nav' : undefined}>
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:py-12">
        <header className="space-y-2">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">Offers</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">What is running right now</h1>
          <p className="text-muted-foreground max-w-2xl text-pretty">
            Automatic offers are applied to the price you see on the plans page. Coupon offers need the code entering at
            checkout.
          </p>
        </header>

        {offers.length === 0 ? (
          <Card>
            <EmptyState
              icon={<PartyPopper aria-hidden />}
              title="No offers running today"
              description="Festival campaigns go up here as soon as the gym announces them. Plan prices are always shown with any discount already applied."
              action={
                <Button asChild>
                  <Link href="/plans">
                    See plans
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {offers.map((offer) => {
              const endsIn = daysUntil(offer.ends_at);
              const scopes = offer.rules.map((rule) => {
                const parts: string[] = [];
                if (rule.category_id) parts.push(categoryName.get(rule.category_id) ?? 'a category');
                if (rule.duration_months) parts.push(`${rule.duration_months}-month plans`);
                return parts.join(' · ');
              });

              return (
                <Card key={offer.id} className="gap-3">
                  <div className="space-y-2 px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="success" className="gap-1">
                        <Tag className="size-3" aria-hidden />
                        {offer.discount_type === 'PERCENTAGE'
                          ? `${Number(offer.discount_value)}% off`
                          : `${formatCurrency(Number(offer.discount_value))} off`}
                      </Badge>
                      {offer.coupon_code ? (
                        <Badge variant="outline" className="font-mono">
                          {offer.coupon_code}
                        </Badge>
                      ) : (
                        <Badge variant="muted">Applied automatically</Badge>
                      )}
                    </div>

                    <h2 className="text-lg font-bold">{offer.name}</h2>
                    {offer.description ? (
                      <p className="text-muted-foreground text-sm text-pretty">{offer.description}</p>
                    ) : null}
                  </div>

                  <dl className="text-muted-foreground space-y-1.5 px-5 text-sm">
                    <div className="flex items-start gap-2">
                      <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <dd>
                        Until {formatDate(offer.ends_at)}
                        {endsIn !== null && endsIn >= 0 ? (
                          <span className="text-foreground font-medium"> · {pluralise(endsIn, 'day')} left</span>
                        ) : null}
                      </dd>
                    </div>
                    {Number(offer.min_purchase_amount) > 0 ? (
                      <div>
                        <dd>Minimum purchase {formatCurrency(Number(offer.min_purchase_amount))}</dd>
                      </div>
                    ) : null}
                    {offer.max_discount_amount ? (
                      <div>
                        <dd>Maximum discount {formatCurrency(Number(offer.max_discount_amount))}</dd>
                      </div>
                    ) : null}
                    {scopes.length > 0 ? (
                      <div>
                        <dd>Applies to: {scopes.join(', ')}</dd>
                      </div>
                    ) : (
                      <div>
                        <dd>Applies to every plan</dd>
                      </div>
                    )}
                  </dl>

                  <div className="px-5">
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/plans">
                        Use this offer
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {isMember ? <MemberBottomNav active="plans" /> : null}
    </div>
  );
}
