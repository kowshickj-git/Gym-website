'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] unhandled error', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <span className="bg-destructive/10 text-destructive mx-auto flex size-14 items-center justify-center rounded-2xl">
          <AlertTriangle className="size-7" aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            The page could not load. Nothing you have done has been lost — try again, and if it keeps happening call the
            gym.
          </p>
        </div>
        <Button onClick={reset} size="lg" className="w-full">
          <RotateCw aria-hidden />
          Try again
        </Button>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">Reference: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
