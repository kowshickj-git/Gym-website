import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-5 md:px-6 md:py-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-36" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[70px] rounded-lg" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="gap-2 py-4">
            <div className="space-y-2 px-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="py-5">
        <div className="space-y-3 px-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-[220px] w-full rounded-lg" />
        </div>
      </Card>
    </div>
  );
}
