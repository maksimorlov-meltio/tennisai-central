import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading placeholder.
 *
 * Shown while a lazily-loaded page chunk downloads, in place of a centred
 * spinner. It traces the shape every page shares — title, subtitle, a row of
 * cards, a body block — so the layout doesn't jump when the real content
 * lands, and the wait reads as "arriving" rather than "hung".
 */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={className} aria-busy="true" aria-live="polite">
      {/* Screen readers get a word; sighted users get the shapes. */}
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
