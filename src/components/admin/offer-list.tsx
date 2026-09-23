'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/misc';
import { deleteOffer, setOfferActive } from '@/app/(admin)/admin/offers/actions';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Offer, OfferPlanRule } from '@/types/database';

type Lifecycle = 'LIVE' | 'SCHEDULED' | 'ENDED' | 'PAUSED';

function lifecycleOf(offer: Offer, now: Date): Lifecycle {
  if (!offer.is_active) return 'PAUSED';
  if (new Date(offer.starts_at) > now) return 'SCHEDULED';
  if (new Date(offer.ends_at) < now) return 'ENDED';
  return 'LIVE';
}

const LIFECYCLE_BADGE: Record<Lifecycle, { variant: 'success' | 'secondary' | 'muted'; label: string }> = {
  LIVE: { variant: 'success', label: 'Live now' },
  SCHEDULED: { variant: 'secondary', label: 'Scheduled' },
  ENDED: { variant: 'muted', label: 'Finished' },
  PAUSED: { variant: 'muted', label: 'Paused' },
};

export function OfferList({
  offers,
  rules,
  categoryNames,
}: {
  offers: Offer[];
  rules: OfferPlanRule[];
  categoryNames: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const now = new Date();

  function toggle(offer: Offer) {
    startTransition(async () => {
      const result = await setOfferActive(offer.id, !offer.is_active);
      if (result.error) toast.error(result.error);
      else toast.success(offer.is_active ? `${offer.name} paused.` : `${offer.name} is live.`);
    });
  }

  function remove(offer: Offer) {
    startTransition(async () => {
      const result = await deleteOffer(offer.id);
      if (result.error) toast.error(result.error, { duration: 8000 });
      else toast.success('Offer deleted.');
    });
  }

  return (
    <ul className="space-y-3">
      {offers.map((offer) => {
        const lifecycle = lifecycleOf(offer, now);
        const badge = LIFECYCLE_BADGE[lifecycle];
        const offerRules = rules.filter((rule) => rule.offer_id === offer.id);

        const scope =
          offerRules.length === 0
            ? 'Every plan'
            : offerRules
                .map((rule) =>
                  [
                    rule.category_id ? categoryNames[rule.category_id] : null,
                    rule.duration_months ? `${rule.duration_months} months` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                )
                .join(', ');

        return (
          <li key={offer.id}>
            <Card className="gap-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold">{offer.name}</h2>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {offer.coupon_code ? (
                      <Badge variant="outline" className="font-mono">
                        {offer.coupon_code}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Auto</Badge>
                    )}
                  </div>

                  <p className="text-sm font-semibold">
                    {offer.discount_type === 'PERCENTAGE'
                      ? `${Number(offer.discount_value)}% off`
                      : `${formatCurrency(Number(offer.discount_value))} off`}
                    {offer.max_discount_amount
                      ? ` · up to ${formatCurrency(Number(offer.max_discount_amount))}`
                      : ''}
                    {Number(offer.min_purchase_amount) > 0
                      ? ` · min ${formatCurrency(Number(offer.min_purchase_amount))}`
                      : ''}
                  </p>

                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {formatDate(offer.starts_at)} → {formatDate(offer.ends_at)}
                  </p>

                  <p className="text-muted-foreground text-xs">
                    Applies to: {scope}
                    {offer.used_count > 0 ? ` · redeemed ${offer.used_count}×` : ''}
                    {offer.usage_limit ? ` of ${offer.usage_limit}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={offer.is_active}
                    onCheckedChange={() => toggle(offer)}
                    disabled={pending}
                    aria-label={`${offer.is_active ? 'Pause' : 'Activate'} ${offer.name}`}
                  />
                  <Button asChild variant="ghost" size="icon-sm" aria-label={`Edit ${offer.name}`}>
                    <Link href={`/admin/offers/${offer.id}`}>
                      <Pencil aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    aria-label={`Delete ${offer.name}`}
                    disabled={pending}
                    onClick={() => remove(offer)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>

              {offer.description ? (
                <p className="text-muted-foreground px-5 text-sm text-pretty">{offer.description}</p>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
