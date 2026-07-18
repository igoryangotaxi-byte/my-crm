import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function SalesOperationLoading() {
  return (
    <div data-module="sales-operation" className="crm-page">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-5 shadow-[var(--so-shadow-sm)]">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-64 w-full rounded-[12px]" />
      </div>
    </div>
  );
}
