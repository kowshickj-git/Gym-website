import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OfferForm } from '@/components/admin/offer-form';
import { requireAdmin } from '@/lib/auth/guards';
import { getCategories } from '@/lib/data';

export const metadata: Metadata = { title: 'Create an offer' };
export const dynamic = 'force-dynamic';

export default async function NewOfferPage() {
  await requireAdmin();
  const categories = await getCategories(true);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/offers">
          <ArrowLeft aria-hidden />
          Offers
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Create an offer</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Set the discount and the dates. The price members see updates the moment the campaign starts, and goes back to
          normal the moment it ends.
        </p>
      </header>

      <Card className="py-5">
        <div className="px-5">
          <OfferForm categories={categories} />
        </div>
      </Card>
    </div>
  );
}
