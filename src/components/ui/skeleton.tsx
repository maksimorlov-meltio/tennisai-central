import { cn } from "@/lib/utils";

/**
 * Placeholder block shown while real content loads.
 *
 * A left-to-right sheen rather than `animate-pulse`: a pulse reads as "this is
 * broken/disabled", a sheen reads as "this is arriving". The sheen is an
 * ::after overlay driven by `animate-shimmer`, and `overflow-hidden` keeps it
 * inside the block's own bounds.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.07] after:to-transparent",
        // Reduced motion: keep the shape, drop the travelling sheen.
        "motion-reduce:after:hidden",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
