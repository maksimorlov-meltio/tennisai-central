// Notifications — Full inbox with read/unread, filters via React Query
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/api/queries";
import { useT } from "@/lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCheck, ChevronRight, Inbox, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard";

/**
 * `linkTo` comes from the server, so only in-app paths are followed — never an
 * absolute or protocol-relative URL.
 */
function internalPath(linkTo: string | undefined): string | null {
  if (!linkTo) return null;
  if (!linkTo.startsWith("/") || linkTo.startsWith("//")) return null;
  return linkTo;
}

export default function NotificationsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? "";
  const { data: notifications = [], isLoading, error } = useNotifications(userId);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [showPrefs, setShowPrefs] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.read);
    return notifications;
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (isLoading) return <LoadingState message="Loading notifications…" />;
  if (error) return <ErrorState message="Failed to load notifications" onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground">{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "You're all caught up."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => markAllRead.mutate(userId)} disabled={markAllRead.isPending}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPrefs((v) => !v)}>
            <Settings2 className="h-3.5 w-3.5" /> {showPrefs ? "Hide settings" : "Notification settings"}
          </Button>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="unread">Unread {unreadCount > 0 && `(${unreadCount})`}</TabsTrigger></TabsList>
          </Tabs>
        </div>
      </div>

      {showPrefs && <NotificationPreferencesCard />}

      {filtered.length === 0 ? (
        filter === "unread" ? (
          <EmptyState icon={<Inbox className="h-6 w-6 text-muted-foreground" />} title={t("empty.notifications.unread.title")} description={t("empty.notifications.unread.description")} />
        ) : (
          // First run: the inbox has never had anything in it. The one useful
          // thing to do here is decide what should arrive — the settings card.
          <EmptyState
            icon={<Inbox className="h-6 w-6 text-muted-foreground" />}
            title={t("empty.notifications.title")}
            description={t("empty.notifications.description")}
            action={!showPrefs ? <Button variant="outline" className="gap-1.5" onClick={() => setShowPrefs(true)}><Settings2 className="h-4 w-4" /> {t("empty.notifications.action")}</Button> : undefined}
          />
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const target = internalPath(n.linkTo);
            return (
              <button
                key={n.id}
                type="button"
                aria-label={target ? `${n.title}. ${n.message}. Open related page.` : `${n.title}. ${n.message}.`}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (target) navigate(target);
                }}
                className={`group flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition-all hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${target ? "cursor-pointer hover:border-primary/40" : ""} ${!n.read ? "bg-primary/5 border-primary/20" : "bg-card"}`}
              >
                <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${n.read ? "bg-muted" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.read ? "text-muted-foreground" : "font-medium text-foreground"}`}>{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{format(new Date(n.createdAt), "MMM d, h:mm a")}</span>
                {target && (
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
