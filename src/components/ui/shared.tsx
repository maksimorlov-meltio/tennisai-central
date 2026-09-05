// ============================================================
// Reusable UI Components — Role, Status, State indicators
// ============================================================

import { cn } from "@/lib/utils";
import type { UserRole, RelationshipStatus } from "@/types";
import { Eye, Lock, AlertTriangle, Loader2, Inbox, ShieldX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─── RoleBadge ───

const ROLE_LABELS: Record<UserRole, string> = {
  player: "Player",
  coach: "Coach",
  observer: "Parent",
  admin: "Admin",
};

const ROLE_STYLES: Record<UserRole, string> = {
  player: "bg-muted text-foreground dark:text-foreground",
  coach: "bg-muted text-foreground dark:text-foreground",
  observer: "bg-primary/10 text-primary dark:text-primary",
  admin: "bg-muted text-foreground dark:text-foreground",
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", ROLE_STYLES[role], className)}>
      {ROLE_LABELS[role]}
    </span>
  );
}

// ─── StatusBadge (relationship + tournament statuses) ───

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-primary/10 text-primary dark:text-primary",
  active: "bg-primary/10 text-primary",
  accepted: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
  revoked: "bg-muted text-muted-foreground",
  planned: "bg-muted text-foreground dark:text-foreground",
  registered: "bg-primary/10 text-primary",
  maybe: "bg-primary/10 text-primary dark:text-primary",
  withdrawn: "bg-muted text-muted-foreground",
  played: "bg-primary/10 text-primary",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLES[status] || "bg-muted text-muted-foreground", className)}>
      {status}
    </span>
  );
}

// ─── ReadOnlyBadge ───

export function ReadOnlyBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary dark:text-primary", className)}>
      <Eye className="h-3 w-3" />
      Read-only
    </span>
  );
}

// ─── ReadOnlyBanner ───

export function ReadOnlyBanner({ message, className }: { message?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-4 py-2.5", className)}>
      <Lock className="h-4 w-4 shrink-0 text-primary dark:text-primary" />
      <p className="text-sm text-primary dark:text-primary">
        {message ?? <>You have <strong>read-only</strong> access. You can view but not edit any data.</>}
      </p>
    </div>
  );
}

// ─── AccessDeniedState ───

export function AccessDeniedState({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 py-20 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <ShieldX className="h-7 w-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    </div>
  );
}

// ─── EmptyState ───

/**
 * The canonical empty state (`components/dashboard/EmptyState` re-exports it).
 *
 * Every list page renders this when there is nothing to show. `title` says
 * what is missing, `description` says what the page is for in one sentence,
 * and `action` is the single next step — a real route or a real dialog, never
 * a decorative button. Callers that already pass their button as `children`
 * keep working; new callers should prefer `action`.
 */
export function EmptyState({ icon, title, description, action, children, className }: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** The one next action (a Button / Link). Rendered after the copy. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center", className)}>
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</div>
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="max-w-md">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center justify-center gap-2">{action}</div>}
      {children}
    </div>
  );
}

// ─── LoadingState ───

/**
 * Loading placeholder.
 *
 * Defaults to skeleton bars rather than a centred spinner: a spinner tells you
 * nothing except "wait", while placeholders show the shape of what's coming and
 * stop the layout jumping when it arrives. `variant="spinner"` is kept for the
 * few places that sit inside a control too small for bars (e.g. a button).
 */
export function LoadingState({
  message,
  className,
  variant = "skeleton",
  rows = 3,
}: {
  message?: string;
  className?: string;
  variant?: "skeleton" | "spinner";
  rows?: number;
}) {
  if (variant === "spinner") {
    return (
      <div className={cn("flex flex-col items-center gap-3 py-20", className)} aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 py-6", className)} aria-busy="true" aria-live="polite">
      {/* The message stays announced even though it isn't drawn — the bars carry
          the meaning visually. */}
      <span className="sr-only">{message ?? "Loading…"}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-11"
          // Slight width taper so it reads as content, not a stack of identical bars.
          style={{ width: `${100 - i * 7}%` }}
        />
      ))}
    </div>
  );
}

// ─── ErrorState ───

/**
 * Error state with a retry affordance.
 *
 * Pass `onRetry` — normally a React Query `refetch` — so recovering from one
 * failed request costs one request. Only when no callback is given does the
 * button fall back to a full page reload, which throws away the SPA and the
 * whole query cache.
 */
export function ErrorState({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  const retry = onRetry ?? (() => window.location.reload());
  return (
    <div className={cn("flex flex-col items-center gap-4 py-20 text-center", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <p className="font-medium text-foreground">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">{message ?? "An unexpected error occurred. Please try again."}</p>
      </div>
      <button onClick={retry} className="text-sm font-medium text-primary hover:underline">
        Try again
      </button>
    </div>
  );
}
