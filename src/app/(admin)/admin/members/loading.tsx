import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';

export default function MembersLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>

      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-20 rounded-full" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="gap-3 py-4">
            <div className="flex items-start justify-between gap-3 px-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-3 px-4">
              {Array.from({ length: 4 }).map((__, inner) => (
                <div key={inner} className="space-y-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
