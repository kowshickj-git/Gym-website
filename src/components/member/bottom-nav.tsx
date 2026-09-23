import Link from 'next/link';
import { CreditCard, Home, Tag, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { key: 'home', href: '/dashboard', label: 'Home', Icon: Home },
  { key: 'plans', href: '/plans', label: 'Plans', Icon: Tag },
  { key: 'payments', href: '/payments', label: 'Payments', Icon: CreditCard },
  { key: 'profile', href: '/profile', label: 'Profile', Icon: User },
] as const;

export type MemberNavKey = (typeof ITEMS)[number]['key'];

/**
 * Fixed bottom navigation for member screens — thumb-reachable on a phone,
 * and hidden above the tablet breakpoint where a normal header is better.
 */
export function MemberBottomNav({ active }: { active: MemberNavKey }) {
  return (
    <nav
      aria-label="Main"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {ITEMS.map(({ key, href, label, Icon }) => {
          const isActive = key === active;
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('size-5', isActive && 'stroke-[2.5]')} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
