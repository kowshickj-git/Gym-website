import Link from 'next/link';
import { CreditCard, Dumbbell, Home, LogOut, Tag, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { Member } from '@/types/database';

const LINKS = [
  { href: '/dashboard', label: 'Home', Icon: Home },
  { href: '/plans', label: 'Plans', Icon: Tag },
  { href: '/payments', label: 'Payments', Icon: CreditCard },
  { href: '/profile', label: 'Profile', Icon: User },
];

/**
 * Header for member screens. On a phone it is a slim title bar (navigation
 * lives in the bottom bar); from tablet width up it carries the full nav.
 */
export function MemberHeader({ gymName, member }: { gymName: string; member: Member }) {
  return (
    <header
      data-app-header
      className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 border-b backdrop-blur"
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-bold">
          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
            <Dumbbell className="size-4" aria-hidden />
          </span>
          <span className="truncate text-sm tracking-tight">{gymName}</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map(({ href, label, Icon }) => (
            <Button key={href} asChild variant="ghost" size="sm">
              <Link href={href}>
                <Icon aria-hidden />
                {label}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
                aria-label="Account menu"
              >
                <Avatar className="size-9">
                  {member.photo_url ? <AvatarImage src={member.photo_url} alt="" /> : null}
                  <AvatarFallback>{initials(member.full_name)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-semibold normal-case opacity-100">{member.full_name}</span>
                <span className="text-muted-foreground block text-xs font-normal normal-case">
                  {formatPhone(member.phone)}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User aria-hidden />
                  My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/payments">
                  <CreditCard aria-hidden />
                  Payments and receipts
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild variant="destructive">
                <form action="/api/auth/signout" method="post" className="w-full">
                  <button type="submit" className="flex w-full items-center gap-2">
                    <LogOut aria-hidden />
                    Sign out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
