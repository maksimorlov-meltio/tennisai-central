import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/motion/useCountUp";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: string;
  className?: string;
}

/**
 * Counts plain whole numbers up on mount; anything else is printed verbatim.
 *
 * Deliberately conservative about what counts as "a number". These cards also
 * carry values like "—" (no data yet) and "68%", and animating those would
 * either render NaN or drop the unit — both worse than not animating.
 */
function StatValue({ value }: { value: string | number }) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  const animated = useCountUp(numeric ?? 0);

  if (numeric === null) return <>{value}</>;
  return <>{Math.round(animated)}</>;
}

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "border border-border bg-card p-5 transition-colors hover:border-foreground/25",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        {/* tabular-nums stops the card width twitching as digits change. */}
        <StatValue value={value} />
      </p>
      {trend && <p className="mt-1 text-xs text-primary">{trend}</p>}
    </div>
  );
}
