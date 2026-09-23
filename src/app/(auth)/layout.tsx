import Link from 'next/link';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { getGymSettings } from '@/lib/data';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getGymSettings();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-medium">
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
            <Dumbbell className="size-4" aria-hidden />
          </span>
          <span className="max-w-[45vw] truncate text-sm">{settings.gym_name}</span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
