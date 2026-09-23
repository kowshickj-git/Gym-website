import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AdminLoginForm } from './admin-login-form';
import { getGymSettings } from '@/lib/data';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Staff login',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, settings] = await Promise.all([searchParams, getGymSettings()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-4">
        <Link href="/" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-medium">
          <ArrowLeft className="size-4" aria-hidden />
          Back to site
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <span className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-xl">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Staff login</h1>
            <p className="text-muted-foreground text-sm text-pretty">
              {settings.gym_name} management. Members should use the{' '}
              <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
                mobile number login
              </Link>
              .
            </p>
          </div>

          <Card className="py-6">
            <div className="px-5">
              <AdminLoginForm nextPath={next} />
            </div>
          </Card>

          {publicEnv.demoMode ? (
            <p className="text-muted-foreground text-center text-xs text-pretty">
              Demo deployment: the owner account is created by the bootstrap script documented in the README.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
