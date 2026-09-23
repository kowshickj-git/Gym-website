'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MembershipCategory } from '@/types/database';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING_SOON', label: 'Expiring' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NONE', label: 'No plan' },
] as const;

const PAYMENT_FILTERS = [
  { value: 'ALL', label: 'Any payment' },
  { value: 'PAID', label: 'Paid' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'CASH', label: 'Paid cash' },
  { value: 'ONLINE', label: 'Paid online' },
] as const;

/**
 * Search and filters for the member list.
 *
 * Filters live in the URL, so a staff member can bookmark "expiring, unpaid" or
 * send it to a colleague, and the back button behaves. Search is debounced so a
 * name typed on a phone does not fire a query per keystroke.
 */
export function MemberFilters({ categories }: { categories: MembershipCategory[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentQuery = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? 'ALL';
  const payment = searchParams.get('payment') ?? 'ALL';
  const category = searchParams.get('category') ?? '';

  const [query, setQuery] = useState(currentQuery);
  const firstRender = useRef(true);

  const push = useMemo(
    () => (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value || value === 'ALL' || value === '') params.delete(key);
        else params.set(key, value);
      }
      // Any filter change resets to the first page.
      params.delete('page');
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (query !== currentQuery) push({ q: query.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, currentQuery, push]);

  const hasFilters = status !== 'ALL' || payment !== 'ALL' || Boolean(category) || Boolean(currentQuery);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or mobile number"
          className="pl-9"
          aria-label="Search members"
        />
        {pending ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" aria-hidden />
        ) : null}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {STATUS_FILTERS.map((filter) => (
          <Chip
            key={filter.value}
            active={status === filter.value}
            onClick={() => push({ status: filter.value })}
            label={filter.label}
          />
        ))}

        <span className="bg-border mx-1 w-px shrink-0" aria-hidden />

        {categories.map((item) => (
          <Chip
            key={item.id}
            active={category === item.id}
            onClick={() => push({ category: category === item.id ? null : item.id })}
            label={item.name.replace(' Training', '')}
          />
        ))}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {PAYMENT_FILTERS.map((filter) => (
          <Chip
            key={filter.value}
            active={payment === filter.value}
            onClick={() => push({ payment: filter.value })}
            label={filter.label}
          />
        ))}

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground shrink-0"
            onClick={() => {
              setQuery('');
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background hover:bg-accent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
