import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  /** Number of body rows to render. Defaults to 2. */
  rows?: number;
  /** Render the header with a small icon placeholder. */
  withIcon?: boolean;
  className?: string;
}

export function SkeletonCard({
  rows = 2,
  withIcon = false,
  className,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm",
        className
      )}
      aria-hidden
    >
      <div className="flex items-center gap-3">
        {withIcon && (
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-muted" />
        )}
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: `${80 - i * 10}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonCardGrid({
  count = 3,
  withIcon = false,
  className,
}: {
  count?: number;
  withIcon?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} withIcon={withIcon} />
      ))}
    </div>
  );
}
