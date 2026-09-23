'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AdminNavLink({
  href,
  exact = false,
  variant = 'sidebar',
  className,
  children,
}: {
  href: string;
  exact?: boolean;
  variant?: 'sidebar' | 'bottom';
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        variant === 'sidebar'
          ? 'flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors'
          : 'flex w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
        isActive
          ? variant === 'sidebar'
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60',
        variant === 'bottom' && 'hover:bg-transparent',
        className,
      )}
    >
      {children}
    </Link>
  );
}
