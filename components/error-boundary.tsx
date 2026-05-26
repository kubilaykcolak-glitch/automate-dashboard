"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ErrorBoundaryProps {
  /** The error that was thrown — provided by Next.js error.tsx contracts. */
  error: Error & { digest?: string };
  /** Reset handler that re-renders the segment that errored. */
  reset: () => void;
  /** Override the friendly message. */
  title?: string;
  /** Override the longer copy. */
  description?: string;
}

/**
 * Renders a friendly "Something went wrong" panel with a retry button.
 *
 * Pair with Next.js `error.tsx` files at any segment, which already act as
 * an error boundary for the descendants of that segment.
 */
export function ErrorBoundary({
  error,
  reset,
  title = "Something went wrong",
  description = "An unexpected error occurred. You can try again — if the problem keeps happening, refresh the page.",
}: ErrorBoundaryProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {error?.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
            {error.message}
            {error.digest && (
              <span className="block mt-2 opacity-60">
                digest: {error.digest}
              </span>
            )}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
