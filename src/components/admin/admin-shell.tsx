import Link from 'next/link';
import {
  BadgeIndianRupee,
  BarChart3,
  CalendarClock,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Settings,
  Tag,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/misc';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AdminNavLink } from './admin-nav-link';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/database';

export const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', Icon: LayoutDashboard, exact: true },
  { href: '/admin/members', label: 'Members', Icon: Users },
  { href: '/admin/expiring', label: 'Expiring soon', Icon: CalendarClock },
  { href: '/admin/expired', label: 'Expired', Icon: XCircle },
  { href: '/admin/payments', label: 'Payments', Icon: CreditCard },
  { href: '/admin/payments/upi', label: 'UPI confirmations', Icon: BadgeIndianRupee },
  { href: '/admin/plans', label: 'Plans & pricing', Icon: Dumbbell, adminOnly: true },
  { href: '/admin/offers', label: 'Offers', Icon: Tag, adminOnly: true },
  { href: '/admin/reports', label: 'Reports', Icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', Icon: Settings, adminOnly: true },
] as const;

/** The four destinations a phone gets in the bottom bar; the rest live in "More". */
const MOBILE_PRIMARY = ['/admin', '/admin/members', '/admin/expiring', '/admin/payments'] as const;

export function AdminShell({
  children,
  gymName,
  role,
  displayName,
}: {
  children: React.ReactNode;
  gymName: string;
  role: UserRole;
  displayName: string;
}) {
  const visible = ADMIN_NAV.filter((item) => !('adminOnly' in item && item.adminOnly) || role === 'ADMIN');
  const primary = visible.filter((item) => (MOBILE_PRIMARY as readonly string[]).includes(item.href));
  const overflow = visible.filter((item) => !(MOBILE_PRIMARY as readonly string[]).includes(item.href));

  return (
    <div className="flex min-h-dvh">
      {/* ------------------------------------------------- Desktop sidebar */}
      <aside className="bg-sidebar hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-16 items-center gap-2.5 px-4">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Dumbbell className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{gymName}</p>
            <p className="text-muted-foreground text-xs">{role === 'ADMIN' ? 'Owner' : 'Staff'}</p>
          </div>
        </div>

        <Separator />

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {visible.map((item) => (
            <AdminNavLink key={item.href} href={item.href} exact={'exact' in item ? item.exact : false}>
              <item.Icon className="size-4" aria-hidden />
              {item.label}
            </AdminNavLink>
          ))}
        </nav>

        <Separator />

        <div className="space-y-2 p-3">
          <p className="text-muted-foreground truncate px-2 text-xs">{displayName}</p>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground w-full justify-start">
              <LogOut aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* ----------------------------------------------------------- Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8">{children}</main>

        {/* ------------------------------------------------ Mobile bottom nav */}
        <nav
          aria-label="Admin"
          className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <ul className="flex items-stretch">
            {primary.map((item) => (
              <li key={item.href} className="flex-1">
                <AdminNavLink
                  href={item.href}
                  exact={'exact' in item ? item.exact : false}
                  variant="bottom"
                  className="h-16"
                >
                  <item.Icon className="size-5" aria-hidden />
                  <span className="text-[10px]">{item.label.split(' ')[0]}</span>
                </AdminNavLink>
              </li>
            ))}

            <li className="flex-1">
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'text-muted-foreground hover:text-foreground flex h-16 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium',
                    )}
                  >
                    <MoreHorizontal className="size-5" aria-hidden />
                    More
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                  <SheetHeader>
                    <SheetTitle>More</SheetTitle>
                  </SheetHeader>
                  <nav className="grid grid-cols-2 gap-2 px-5">
                    {overflow.map((item) => (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className="hover:bg-accent flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-medium"
                        >
                          <item.Icon className="size-5" aria-hidden />
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </nav>
                  <div className="px-5 pt-2">
                    <form action="/api/auth/signout" method="post">
                      <Button type="submit" variant="outline" className="text-destructive w-full">
                        <LogOut aria-hidden />
                        Sign out
                      </Button>
                    </form>
                  </div>
                </SheetContent>
              </Sheet>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
