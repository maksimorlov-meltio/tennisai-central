// ============================================================
// Incoming connection requests — dashboard surface
//
// The dashboards already computed the pending-inbound list but never showed
// it, so an approval could only be found by navigating to /connections. This
// card renders it in place with the same approve/reject calls the Connections
// page uses (ConnectionStore.updateStatus), and renders nothing at all when
// there is no request waiting.
// ============================================================

import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowRight, Check, Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { RoleBadge } from "@/components/ui/shared";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import type { ConnectionRequest } from "@/types";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function RequestRow({
  request,
  onApprove,
  onReject,
}: {
  request: ConnectionRequest;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {initials(request.fromUserName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{request.fromUserName}</p>
          <RoleBadge role={request.fromUserRole} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowDownLeft className="h-3 w-3" />
          Received {format(new Date(request.createdAt), "MMM d, yyyy")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => onApprove(request.id)}
        >
          <Check className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={() => onReject(request.id)}
        >
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
      </div>
    </div>
  );
}

/**
 * Pending requests addressed to the signed-in user. Returns `null` when the
 * inbox is empty so it never occupies dashboard space without content.
 */
export function IncomingRequestsCard({ max = 4 }: { max?: number }) {
  const { user } = useAuth();
  const { requests, updateStatus } = useConnections();
  const userId = user?.id ?? "";

  const incoming = requests.filter((r) => r.status === "pending" && r.toUserId === userId);
  if (incoming.length === 0) return null;

  const decide = (id: string, next: "active" | "rejected") => {
    const res = updateStatus(id, next);
    if (res.ok) {
      toast({ title: next === "active" ? "Connection approved" : "Request rejected" });
    } else {
      toast({
        title: next === "active" ? "Could not approve" : "Could not reject",
        description: res.reason,
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardCard
      title="Incoming requests"
      description={`${incoming.length} request${incoming.length !== 1 ? "s" : ""} waiting for your decision`}
      icon={<Inbox className="h-4 w-4" />}
      badge={
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
          {incoming.length}
        </span>
      }
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/connections">
            All connections <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-3">
        {incoming.slice(0, max).map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            onApprove={(id) => decide(id, "active")}
            onReject={(id) => decide(id, "rejected")}
          />
        ))}
        {incoming.length > max && (
          <p className="text-xs text-muted-foreground">
            +{incoming.length - max} more on the{" "}
            <Link to="/connections" className="font-medium text-primary hover:underline">
              Connections
            </Link>{" "}
            page.
          </p>
        )}
      </div>
    </DashboardCard>
  );
}
