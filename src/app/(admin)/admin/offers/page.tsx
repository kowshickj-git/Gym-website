import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Plus, Tag } from 'lucide-react';
import { Alert, AlertDescription, EmptyState } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OfferList } from '@/components/admin/offer-list';
import { requireAdmin } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import type { Offer, OfferPlanRule } from '@/types/database';

export const metadata: Metadata = { title: 'Offers' };
export const dynamic = 'force-dynamic';

export default async function AdminOffersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [{ saved }] = await Promise.all([searchParams, requireAdmin()]);
  const supabase = await createReadOnlyServerSupabase();

  const [{ data: offers }, { data: rules }, { data: categories }] = await Promise.all([
    supabase.from('offers').select('*').order('starts_at', { ascending: false }),
    supabase.from('offer_plan_rules').select('*'),
    supabase.from('membership_categories').select('id, name'),
  ]);

  const categoryName = new Map((categories ?? []).map((category) => [category.id, category.name]));

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Offers</h1>
          <p className="text-muted-foreground text-sm">Festival campaigns, coupons and new-member discounts.</p>
        </div>
        <Button asChild>
          <Link href="/admin/offers/new">
            <Plus aria-hidden />
            Create offer
          </Link>
        </Button>
      </header>

      {saved ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertDescription>Offer saved. Live campaigns apply to plan prices immediately.</AlertDescription>
        </Alert>
      ) : null}

      {!offers?.length ? (
        <Card>
          <EmptyState
            icon={<Tag aria-hidden />}
            title="No offers yet"
            description="Create a festival campaign or a coupon and the discount is applied automatically at checkout — online and at the desk."
            action={
              <Button asChild>
                <Link href="/admin/offers/new">Create your first offer</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <OfferList
          offers={offers as Offer[]}
          rules={(rules ?? []) as OfferPlanRule[]}
          categoryNames={Object.fromEntries(categoryName)}
        />
      )}
    </div>
  );
}
