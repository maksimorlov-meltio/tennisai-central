import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { GetStartedCard, type GetStartedItem } from "@/components/dashboard/GetStartedCard";
import { IncomingRequestsCard } from "@/components/dashboard/IncomingRequestsCard";
import { StatisticsSummaryCard } from "@/components/dashboard/StatisticsSummaryCard";
import { statCardClass, statLinkClass } from "@/components/dashboard/statLinkStyles";
import { StatusBadge, LoadingState, ErrorState } from "@/components/ui/shared";
import {
  Calendar,
  Trophy,
  Wallet,
  Package,
  Brain,
  Bell,
  ArrowRight,
  Clock,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import {
  useCalendarEvents,
  usePlayerTournaments,
  useNotifications,
  useFinanceSummary,
  useEquipment,
} from "@/hooks/api/queries";
import { useMatchStats } from "@/hooks/api/matches";
import { isBefore } from "date-fns";
import { useT, formatDate as formatDateIntl } from "@/lib/i18n";

function formatDate(iso: string) {
  return formatDateIntl(iso, { month: "short", day: "numeric" });
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

export default function PlayerDashboard() {
  const { t } = useT();
  const { user } = useAuth();
  // Incoming pending requests are rendered by <IncomingRequestsCard />, which
  // reads the same store and hides itself when the inbox is empty.
  const { activeRelationships } = useConnections();

  const uid = user?.id ?? "";
  const { data: calendarEvents = [], isLoading: loadingEvents, error: errorEvents } = useCalendarEvents();
  const { data: playerTournaments = [], isLoading: loadingPT, error: errorPT } = usePlayerTournaments();
  const { data: notifications = [], isLoading: loadingNotif, error: errorNotif } = useNotifications(uid);
  const { data: financeSummary, isLoading: loadingFinance, error: errorFinance } = useFinanceSummary(uid);
  const { data: equipment = [], isLoading: loadingEquip, error: errorEquip } = useEquipment(uid);
  // Same query key as the Statistics card, so this is a shared cache read, not
  // a second request. Used only to derive the "Get started" ticks.
  const { data: matchStats, isLoading: loadingMatchStats, error: errorMatchStats } = useMatchStats();

  const isLoading = loadingEvents || loadingPT || loadingNotif || loadingFinance || loadingEquip;
  const hasError = errorEvents || errorPT || errorNotif || errorFinance || errorEquip;

  const now = new Date();
  const upcomingEvents = [...calendarEvents]
    .filter((e) => !isBefore(new Date(e.startDate), now))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 4);
  const unreadNotifications = notifications.filter((n) => !n.read);
  const finance = {
    totalTraining: financeSummary?.totalTraining ?? 0,
    totalTravel: financeSummary?.totalTravel ?? 0,
    totalTournament: financeSummary?.totalTournament ?? 0,
    totalEquipment: financeSummary?.totalEquipment ?? 0,
  };

  // First-run checklist. Every tick comes from data already on this page —
  // nothing is assumed done.
  const getStartedItems: GetStartedItem[] = [
    {
      id: "connect-coach",
      label: t("dashboard.player.getStarted.connectCoach.label"),
      description: t("dashboard.player.getStarted.connectCoach.description"),
      to: "/connections",
      actionLabel: t("dashboard.player.getStarted.connectCoach.action"),
      done: activeRelationships.length > 0,
    },
    {
      id: "log-match",
      label: t("dashboard.player.getStarted.logMatch.label"),
      description: t("dashboard.player.getStarted.logMatch.description"),
      to: "/matches",
      actionLabel: t("dashboard.player.getStarted.logMatch.action"),
      done: (matchStats?.matchesPlayed ?? 0) > 0,
    },
    {
      id: "add-tournament",
      label: t("dashboard.player.getStarted.addTournament.label"),
      description: t("dashboard.player.getStarted.addTournament.description"),
      to: "/tournaments",
      actionLabel: t("dashboard.player.getStarted.addTournament.action"),
      done: playerTournaments.length > 0,
    },
  ];

  if (isLoading) return <LoadingState message={t("dashboard.player.loading")} />;
  if (hasError) return <ErrorState message={t("dashboard.common.loadError")} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("dashboard.player.header.title", { name: user?.firstName ?? "" })}
        </h1>
        <p className="text-muted-foreground">{t("dashboard.player.header.subtitle")}</p>
      </div>

      {/* Anything waiting on a decision comes first. */}
      <IncomingRequestsCard />

      {/* Rendered only once the match count is known, so no tick can be wrong. */}
      {!loadingMatchStats && !errorMatchStats && (
        <GetStartedCard storageKey={`player:${uid}`} items={getStartedItems} />
      )}

      {/* Top stats row — every figure links to the page that owns it. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/calendar" className={statLinkClass}>
          <StatCard
            label={t("dashboard.common.upcomingEvents")}
            value={upcomingEvents.length}
            icon={<Calendar className="h-4 w-4" />}
            className={statCardClass}
          />
        </Link>
        <Link to="/tournaments" className={statLinkClass}>
          <StatCard
            label={t("dashboard.player.stats.tournaments")}
            value={playerTournaments.length}
            icon={<Trophy className="h-4 w-4" />}
            trend={
              playerTournaments.length
                ? t("dashboard.player.stats.registeredTrend", {
                    count: playerTournaments.filter((pt) => pt.status === "registered").length,
                  })
                : undefined
            }
            className={statCardClass}
          />
        </Link>
        <Link to="/notifications" className={statLinkClass}>
          <StatCard
            label={t("dashboard.common.unreadNotifications")}
            value={unreadNotifications.length}
            icon={<Bell className="h-4 w-4" />}
            className={statCardClass}
          />
        </Link>
      </div>

      {/* Calendar + Tournaments row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title={t("dashboard.player.schedule.title")}
          description={t("dashboard.player.schedule.description")}
          icon={<Calendar className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/calendar">{t("dashboard.common.fullCalendar")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {upcomingEvents.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.common.noUpcomingEvents")}</p>
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
          title={t("dashboard.player.myTournaments.title")}
          description={t("dashboard.player.myTournaments.description")}
          icon={<Trophy className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tournaments">{t("dashboard.common.explore")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {playerTournaments.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.common.noTournamentsYet")}</p>
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

      {/* Stats + Finance + Equipment row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <StatisticsSummaryCard />

        <DashboardCard
          title={t("dashboard.common.finance")}
          description={t("dashboard.common.financeDescription")}
          icon={<Wallet className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/finance">{t("dashboard.common.details")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {[
              { label: t("dashboard.common.financeTraining"), amount: finance.totalTraining },
              { label: t("dashboard.common.financeTravel"), amount: finance.totalTravel },
              { label: t("dashboard.common.financeTournaments"), amount: finance.totalTournament },
              { label: t("dashboard.common.financeEquipment"), amount: finance.totalEquipment },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="text-sm font-semibold text-foreground">${item.amount.toLocaleString()}</p>
              </div>
            ))}
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{t("dashboard.common.financeTotal")}</p>
                <p className="text-sm font-bold text-foreground">
                  ${(finance.totalTraining + finance.totalTravel + finance.totalTournament + finance.totalEquipment).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          title={t("dashboard.player.equipment.title")}
          description={t("dashboard.player.equipment.itemsTracked", { count: equipment.length })}
          icon={<Package className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/equipment">{t("dashboard.common.manage")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {equipment.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.player.equipment.empty")}</p>
            )}
            {equipment.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{item.category}</p>
                </div>
                {item.condition && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {item.condition}
                  </span>
                )}
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>

      {/* AI Insights + Notifications row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Match prep now lives on the tournament itself, where the surface,
            ball and weather actually are — rather than asking the player to
            retype all of it into a separate page. */}
        <DashboardCard
          title={t("dashboard.player.matchConditions.title")}
          description={t("dashboard.player.matchConditions.description")}
          icon={<Brain className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tournaments">{t("dashboard.common.open")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground">{t("dashboard.player.matchConditions.cardTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dashboard.player.matchConditions.cardBody")}
            </p>
            <Button size="sm" variant="outline" className="mt-3" asChild>
              <Link to="/tournaments">{t("dashboard.player.matchConditions.browse")}</Link>
            </Button>
          </div>
        </DashboardCard>

        <DashboardCard
          title={t("dashboard.common.recentNotifications")}
          description={t("dashboard.common.unreadCount", { count: unreadNotifications.length })}
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
              <Link to="/notifications">{t("dashboard.common.viewAll")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {notifications.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.common.noNotificationsYet")}</p>
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
