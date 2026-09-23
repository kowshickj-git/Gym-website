import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { PlanManager } from '@/components/admin/plan-manager';
import { requireAdmin } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Plans and pricing' };
export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  await requireAdmin();
  const supabase = await createReadOnlyServerSupabase();

  const [{ data: categories }, { data: plans }] = await Promise.all([
    supabase.from('membership_categories').select('*').order('sort_order'),
    supabase.from('membership_plans').select('*').order('duration_months'),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-6 md:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Plans and pricing</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Everything members can buy. Change a price here and it takes effect immediately on the public plans page.
        </p>
      </header>

      <Alert variant="info">
        <Info aria-hidden />
        <AlertDescription>
          Changing a price never alters a membership someone has already bought — those keep the amount recorded on
          their receipt.
        </AlertDescription>
      </Alert>

      <PlanManager categories={categories ?? []} plans={plans ?? []} />
    </div>
  );
}
