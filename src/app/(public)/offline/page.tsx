import type { Metadata } from 'next';
import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';

export const metadata: Metadata = {
  title: 'You are offline',
  robots: { index: false, follow: false },
};

/** Served by the service worker when a navigation fails with no network. */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-md items-center px-4 py-16">
      <Card className="w-full">
        <EmptyState
          icon={<WifiOff aria-hidden />}
          title="No connection"
          description="You are offline, so we cannot load the latest membership details. Your data is safe — try again once you have signal."
          action={
            <Button asChild>
              <Link href="/dashboard">Try again</Link>
            </Button>
          }
        />
      </Card>
    </div>
  );
}
