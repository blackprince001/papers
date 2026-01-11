import { Skeleton } from "@/components/ui/skeleton";

export function PaperCardSkeleton() {
  return (
    <div className="bg-grayscale-8 border border-blue-21 rounded-md p-4 sm:p-6 h-full flex flex-col">
      {/* Title */}
      <div className="flex justify-between items-start gap-2 mb-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Authors */}
      <Skeleton className="h-4 w-1/2 mb-2" />

      {/* Tags */}
      <div className="flex gap-2 mt-auto pt-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-5 rounded" />
      </div>
      <Skeleton className="h-9 w-16 mb-1" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

export function ChartCardSkeleton() {
  return (
    <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
      <Skeleton className="h-6 w-48 mb-4" />
      <div className="flex items-center justify-center h-[268px]">
        <Skeleton className="h-40 w-40 rounded-full" />
      </div>
    </div>
  );
}

export function GroupCardSkeleton() {
  return (
    <div className="bg-grayscale-8 border border-blue-21 rounded-md p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

export function AnnotationSkeleton() {
  return (
    <div className="bg-grayscale-8 border border-blue-21 rounded-md p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-5 w-5 rounded" />
        <div className="flex-1">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-16 w-full mb-2" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
}
