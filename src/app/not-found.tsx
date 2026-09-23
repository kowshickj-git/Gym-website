import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <span className="bg-muted text-muted-foreground mx-auto flex size-14 items-center justify-center rounded-2xl">
          <Compass className="size-7" aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Page not found</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            That link does not lead anywhere. It may have been removed, or the address may be mistyped.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href="/">Go to the home page</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">My membership</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
