'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Keeps the current filters in the URL while moving between pages. */
export function Pagination({ page, total, pageSize }: { page: number; total: number; pageSize: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  const hrefFor = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (target <= 1) params.delete('page');
    else params.set('page', String(target));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-muted-foreground tnum text-sm">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page - 1)} rel="prev">
              <ChevronLeft aria-hidden />
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden />
            Previous
          </Button>
        )}

        {page < lastPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page + 1)} rel="next">
              Next
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </nav>
  );
}
