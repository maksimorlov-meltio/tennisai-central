import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge, ReadOnlyBadge, ReadOnlyBanner, EmptyState, LoadingState, ErrorState } from "@/components/ui/shared";
import {
  Users,
  Calendar,
  Trophy,
  Wallet,
  Bell,
  ArrowRight,
  Clock,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { useCalendarEvents, usePlayerTournaments, useNotifications } from "@/hooks/api/queries";
import { isBefore } from "date-fns";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateRange(start: string, end: string) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

const eventTypeColor: Record<string, string> = {
  training: "bg-foreground",
  tournament: "bg-primary",
  match: "bg-primary",
  travel: "bg-foreground",
  recovery: "bg-muted-foreground",
};

export default function ObserverDashboard() {
  const { user } = useAuth();
  const { connectedPlayers, requests } = useConnections();

  const pendingRequests = requests.filter(
    (r) => r.status === "pending" && r.fromUserId === user?.id
  );
  const { data: calendarEvents = [], isLoading: loadingEvents, error: errorEvents } = useCalendarEvents();
  const { data: playerTournaments = [], isLoading: loadingPT, error: errorPT } = usePlayerTournaments();
  const { data: notifications = [], isLoading: loadingNotif, error: errorNotif } = useNotifications(user?.id ?? "");

  const isLoading = loadingEvents || loadingPT || loadingNotif;
  const hasError = errorEvents || errorPT || errorNotif;

  const now = new Date();
  const upcomingEvents = [...calendarEvents]
    .filter((e) => !isBefore(new Date(e.startDate), now))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 4);
  const unreadNotifications = notifications.filter((n) => !n.read);

  if (isLoading) return <LoadingState message="Loading dashboard…" />;
  if (hasError) return <ErrorState message="Failed to load dashboard data" onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome, {user?.firstName}
            </h1>
            <p className="text-muted-foreground">Viewing connected player's progress.</p>
          </div>
          <ReadOnlyBadge />
        </div>
      </div>

      <ReadOnlyBanner />

      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Connected Players"
          value={connectedPlayers.length}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Pending Requests"
          value={pendingRequests.length}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Upcoming Events"
          value={upcomingEvents.length}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatCard
          label="Unread Notifications"
          value={unreadNotifications.length}
          icon={<Bell className="h-4 w-4" />}
        />
      </div>

      {/* Connected Players Summary */}
      <DashboardCard
        title="Connected Players"
        description={`${connectedPlayers.length} player${connectedPlayers.length !== 1 ? "s" : ""} you follow`}
        icon={<Users className="h-4 w-4" />}
        badge={<ReadOnlyBadge />}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/connections">Manage <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        }
      >
        {connectedPlayers.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">No connected players yet. Send a request to start following a player.</p>
            <Button size="sm" variant="outline" className="mt-3" asChild>
              <Link to="/connections">Send Request</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {connectedPlayers.map((player) => (
              <div key={player.id} className="flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {player.firstName[0]}{player.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-foreground">
                    {player.firstName} {player.lastName}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{player.playerPublicId}</p>
                  <p className="text-xs text-muted-foreground">Connected since {formatDate(player.connectedSince)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {/* Calendar + Tournaments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title="Player Schedule"
          description="Upcoming events on the player's calendar"
          icon={<Calendar className="h-4 w-4" />}
          badge={<ReadOnlyBadge />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/calendar">Full calendar <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {upcomingEvents.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No upcoming events yet.</p>
            )}
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 flex flex-col items-center">
                  <div className={`h-2.5 w-2.5 rounded-full ${eventTypeColor[event.type] || "bg-muted"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(event.startDate)}
                    {event.location && <span>· {event.location}</span>}
                  </div>
                </div>
                <span className="mt-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                  {event.type}
                </span>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Player Tournaments"
          description="Planned and registered tournaments"
          icon={<Trophy className="h-4 w-4" />}
          badge={<ReadOnlyBadge />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tournaments">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {playerTournaments.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No tournaments yet.</p>
            )}
            {playerTournaments.map((pt) => (
              <div key={pt.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{pt.tournament.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pt.tournament.city}, {pt.tournament.country} · {pt.tournament.surface}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateRange(pt.tournament.startDate, pt.tournament.endDate)}
                  </p>
                </div>
                <StatusBadge status={pt.status} />
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>

      {/* Finance + Notifications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title="Player Finance"
          description="Season cost breakdown"
          icon={<Wallet className="h-4 w-4" />}
          badge={<ReadOnlyBadge />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/finance">Details <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          {connectedPlayers.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-6 w-6 text-muted-foreground" />}
              title="No connected players"
              description="Connect with a player to view their season cost breakdown."
            />
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">Select a connected player on the Finance page to view their cost breakdown.</p>
              <Button size="sm" variant="outline" className="mt-3" asChild>
                <Link to="/finance">Open Finance</Link>
              </Button>
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Recent Notifications"
          description={`${unreadNotifications.length} unread`}
          icon={<Bell className="h-4 w-4" />}
          badge={
            unreadNotifications.length > 0 ? (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {unreadNotifications.length}
              </span>
            ) : undefined
          }
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notifications">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {notifications.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
            )}
            {notifications.slice(0, 3).map((notif) => (
              <div key={notif.id} className="flex items-start gap-3">
                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notif.read ? "bg-muted" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${notif.read ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                    {notif.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{notif.message}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(notif.createdAt)}</span>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
