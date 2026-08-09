import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function DashboardCard({
  title,
  description,
  icon,
  badge,
  action,
  children,
  className,
  noPadding,
}: DashboardCardProps) {
  return (
    <div className={cn("border border-border bg-card", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              {badge}
            </div>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </div>
  );
}
