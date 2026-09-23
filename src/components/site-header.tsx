import Link from 'next/link';
import { Dumbbell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { getGymSettings } from '@/lib/data';
import { getCurrentUser } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/guards';

const NAV = [
  { href: '/plans', label: 'Plans' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export async function SiteHeader() {
  const [settings, user] = await Promise.all([getGymSettings(), getCurrentUser().catch(() => null)]);

  const accountHref = user ? (isStaffRole(user.role) ? '/admin' : '/dashboard') : '/login';
  const accountLabel = user ? (isStaffRole(user.role) ? 'Dashboard' : 'My membership') : 'Log in';

  return (
    <header
      data-app-header
      className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 font-bold">
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Dumbbell className="size-4.5" aria-hidden />
          </span>
          <span className="truncate text-base tracking-tight">{settings.gym_name}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="sm">
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href={accountHref}>{accountLabel}</Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="Open menu">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[80vw] max-w-xs">
              <SheetHeader>
                <SheetTitle>{settings.gym_name}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-3">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className="hover:bg-accent flex h-12 items-center rounded-lg px-3 text-base font-medium"
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto space-y-2 p-5">
                <SheetClose asChild>
                  <Button asChild className="w-full" size="lg">
                    <Link href={accountHref}>{accountLabel}</Link>
                  </Button>
                </SheetClose>
                {!user ? (
                  <SheetClose asChild>
                    <Button asChild variant="outline" className="w-full" size="lg">
                      <Link href="/admin/login">Staff login</Link>
                    </Button>
                  </SheetClose>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
