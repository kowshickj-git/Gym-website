import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OfferForm } from '@/components/admin/offer-form';
import { requireAdmin } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getCategories } from '@/lib/data';

export const metadata: Metadata = { title: 'Edit offer' };
export const dynamic = 'force-dynamic';

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireAdmin()]);
  const supabase = await createReadOnlyServerSupabase();

  const [{ data: offer }, { data: rules }, categories] = await Promise.all([
    supabase.from('offers').select('*').eq('id', id).maybeSingle(),
    supabase.from('offer_plan_rules').select('*').eq('offer_id', id),
    getCategories(true),
  ]);

  if (!offer) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/offers">
          <ArrowLeft aria-hidden />
          Offers
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{offer.name}</h1>
        <p className="text-muted-foreground text-sm">
          Changes take effect straight away for anyone who has not already paid.
        </p>
      </header>

      <Card className="py-5">
        <div className="px-5">
          <OfferForm offer={offer} rules={rules ?? []} categories={categories} />
        </div>
      </Card>
    </div>
  );
}
