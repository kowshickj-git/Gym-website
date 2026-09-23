import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';

/** Matches the real dashboard's shape so nothing jumps when the data lands. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-40" />
      </div>

      <Card className="gap-4">
        <div className="flex items-start justify-between gap-3 px-5">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <div className="px-5">
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4 px-5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="px-5">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </Card>

      <Skeleton className="h-5 w-32" />
      <Card className="gap-0 py-0">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-b p-4 last:border-0">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>
    </div>
  );
}
