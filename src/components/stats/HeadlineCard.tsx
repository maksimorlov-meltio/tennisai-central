// A single headline figure. A missing value is muted, never dressed up as 0.
import { NO_VALUE } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

export interface HeadlineCardProps {
  label: string;
  value: string;
  caption: string;
}

export function HeadlineCard({ label, value, caption }: HeadlineCardProps) {
  const missing = value === NO_VALUE;
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", missing ? "text-muted-foreground" : "text-foreground")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
