import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { GetStartedCard } from "@/components/dashboard/GetStartedCard";
import { coachItems } from "@/components/dashboard/firstRunItems";
import { IncomingRequestsCard } from "@/components/dashboard/IncomingRequestsCard";
import { statCardClass, statLinkClass } from "@/components/dashboard/statLinkStyles";
import { StatusBadge, LoadingState, ErrorState } from "@/components/ui/shared";
import {
  Users,
  UserPlus,
  Calendar,
  Trophy,
  Dumbbell,
  ArrowRight,
  Clock,
  Plus,
  Shield,
  Brain,
  AlertCircle,
  Star,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { useTrainings, useTeams, useCalendarEvents, usePlayerTournaments, useTrainingPlans } from "@/hooks/api/queries";
import { PlayerActionsMenu, TeamActionsMenu } from "@/components/coach/EntityActionsMenu";
import { PlayerStatsDrawer } from "@/components/players/PlayerStatsDrawer";
import { PlayerEquipmentDrawer } from "@/components/equipment/PlayerEquipmentDrawer";
import type { ConnectedPlayer } from "@/types";
import { isBefore } from "date-fns";
import { useT, formatDate as formatDateIntl } from "@/lib/i18n";

function formatDate(iso: string) {
  return formatDateIntl(iso, { month: "short", day: "numeric" });
}

const eventTypeColor: Record<string, string> = {
  training: "bg-foreground",
  tournament: "bg-primary",
  match: "bg-primary",
  travel: "bg-foreground",
  recovery: "bg-muted-foreground",
};

export default function CoachDashboard() {
  const { t } = useT();
  const { user } = useAuth();
  const { connectedPlayers, requests } = useConnections();
  // Drawers opened from the player menus below; one of each for the page.
  const [statsPlayer, setStatsPlayer] = useState<ConnectedPlayer | null>(null);
  const [equipmentPlayer, setEquipmentPlayer] = useState<ConnectedPlayer | null>(null);
  const { data: trainings = [], isLoading: loadingTrainings, error: errorTrainings } = useTrainings();
  const { data: teams = [], isLoading: loadingTeams, error: errorTeams } = useTeams();
  const { data: calendarEvents = [], isLoading: loadingEvents, error: errorEvents } = useCalendarEvents();
  const { data: playerTournaments = [], isLoading: loadingPT, error: errorPT } = usePlayerTournaments();
  // Only used to derive the "built a session" tick — a failure here must not
  // take the dashboard down, so it stays out of the loading/error gate.
  const { data: trainingPlans = [], isLoading: loadingPlans } = useTrainingPlans();

  const isLoading = loadingTrainings || loadingTeams || loadingEvents || loadingPT;
  const hasError = errorTrainings || errorTeams || errorEvents || errorPT;

  const now = new Date();
  const unreviewedSessions = trainings
    .filter((t) => isBefore(new Date(t.endDate), now) && !t.review)
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
    .slice(0, 5);

  const pendingRequests = requests.filter(
    (r) => r.status === "pending" && r.fromUserId === user?.id
  );
  const upcomingEvents = [...calendarEvents]
    .filter((e) => !isBefore(new Date(e.startDate), now))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 4);

  // First-run checklist. Every tick is derived from data this page already
  // queried — nothing is assumed done on the coach's behalf. Builders live in
  // firstRunItems.ts.
  const getStartedItems = coachItems(t, {
    playerCount: connectedPlayers.length,
    planCount: trainingPlans.length,
    teamCount: teams.length,
  });

  if (isLoading) return <LoadingState message={t("dashboard.coach.loading")} />;
  if (hasError) return <ErrorState message={t("dashboard.common.loadError")} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t("dashboard.coach.header.title", { lastName: user?.lastName ?? "" })}
          </h1>
          <p className="text-muted-foreground">{t("dashboard.coach.header.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link to="/teams"><Plus className="mr-1.5 h-3.5 w-3.5" /> {t("dashboard.coach.createTeam")}</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/trainings"><Plus className="mr-1.5 h-3.5 w-3.5" /> {t("dashboard.coach.newTraining")}</Link>
          </Button>
        </div>
      </div>

      {/* Anything waiting on a decision comes first. */}
      <IncomingRequestsCard />

      {/* Rendered once the plan list has resolved, so no tick can be wrong. */}
      {!loadingPlans && <GetStartedCard storageKey={`coach:${user?.id ?? ""}`} items={getStartedItems} />}

      {/* Top stats — every figure links to the page that owns it. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/players" className={statLinkClass}>
          <StatCard label={t("dashboard.coach.stats.connectedPlayers")} value={connectedPlayers.length} icon={<Users className="h-4 w-4" />} className={statCardClass} />
        </Link>
        <Link to="/connections" className={statLinkClass}>
          <StatCard label={t("dashboard.coach.stats.pendingRequests")} value={pendingRequests.length} icon={<UserPlus className="h-4 w-4" />} className={statCardClass} />
        </Link>
        <Link to="/teams" className={statLinkClass}>
          <StatCard label={t("dashboard.coach.stats.teams")} value={teams.length} icon={<Shield className="h-4 w-4" />} className={statCardClass} />
        </Link>
        <Link to="/calendar" className={statLinkClass}>
          <StatCard label={t("dashboard.common.upcomingEvents")} value={upcomingEvents.length} icon={<Calendar className="h-4 w-4" />} className={statCardClass} />
        </Link>
      </div>

      {/* Connected Players + Pending Requests */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title={t("dashboard.coach.connectedPlayers.title")}
          description={t("dashboard.coach.connectedPlayers.description", { count: connectedPlayers.length })}
          icon={<Users className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/players">{t("dashboard.common.manage")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          {connectedPlayers.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.coach.connectedPlayers.empty")}</p>
              <Button size="sm" variant="outline" className="mt-3" asChild>
                <Link to="/connections"><UserPlus className="mr-1.5 h-3.5 w-3.5" /> {t("dashboard.coach.connectedPlayers.connectPlayer")}</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {connectedPlayers.slice(0, 5).map((player) => (
                <div key={player.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {player.firstName[0]}{player.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{player.firstName} {player.lastName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{player.playerPublicId}</p>
                  </div>
                  {/* ?player=<id> opens that player's stats drawer on /players. */}
                  <Button size="sm" variant="ghost" className="text-xs" asChild>
                    <Link to={`/players?player=${encodeURIComponent(player.id)}`}>
                      {t("dashboard.coach.connectedPlayers.view")} <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <PlayerStatsDrawer player={statsPlayer} open={!!statsPlayer} onOpenChange={(o) => { if (!o) setStatsPlayer(null); }} />
        <PlayerEquipmentDrawer player={equipmentPlayer} open={!!equipmentPlayer} onOpenChange={(o) => { if (!o) setEquipmentPlayer(null); }} />

        <DashboardCard
          title={t("dashboard.coach.pendingRequests.title")}
          description={t("dashboard.coach.pendingRequests.description")}
          icon={<UserPlus className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/connections">{t("dashboard.common.viewAll")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          {pendingRequests.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.coach.pendingRequests.empty")}</p>
              <Button size="sm" variant="outline" className="mt-3" asChild>
                <Link to="/connections"><UserPlus className="mr-1.5 h-3.5 w-3.5" /> {t("dashboard.coach.pendingRequests.sendRequest")}</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.slice(0, 4).map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{req.toUserName}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.coach.pendingRequests.sentOn", { date: formatDate(req.createdAt) })}</p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>

      {/* Teams */}
      <DashboardCard
        title={t("dashboard.coach.teamsCard.title")}
        description={t("dashboard.coach.teamsCard.description", { count: teams.length })}
        icon={<Shield className="h-4 w-4" />}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/teams">{t("dashboard.common.manage")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <div key={team.id} className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="min-w-0 truncate text-sm font-semibold text-foreground">{team.name}</h4>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {team.players.length} players
                  </span>
                  {/* No onManage here: the menu navigates to /teams?team=<id>. */}
                  <TeamActionsMenu team={team} compact />
                </div>
              </div>
              <div className="flex -space-x-2">
                {team.players.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-[10px] font-bold text-primary"
                    title={`${p.firstName} ${p.lastName}`}
                  >
                    {p.firstName[0]}{p.lastName[0]}
                  </div>
                ))}
                {team.players.length > 5 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
                    +{team.players.length - 5}
                  </div>
                )}
              </div>
            </div>
          ))}
          <Link
            to="/teams"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">{t("dashboard.coach.teamsCard.createNew")}</span>
          </Link>
        </div>
      </DashboardCard>

      {/* Unreviewed Training Sessions */}
      <DashboardCard
        title={t("dashboard.coach.needsReview.title")}
        description={t("dashboard.coach.needsReview.description", { count: unreviewedSessions.length })}
        icon={<AlertCircle className="h-4 w-4" />}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/trainings?filter=past">{t("dashboard.coach.needsReview.pastSessions")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        }
      >
        {unreviewedSessions.length === 0 ? (
          <div className="py-4 text-center">
            <Star className="mx-auto mb-2 h-8 w-8 text-primary/30" />
            <p className="text-sm font-medium text-foreground">{t("dashboard.coach.needsReview.allCaughtUp")}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.coach.needsReview.allReviewed")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {unreviewedSessions.map((session) => (
              <div key={session.id} className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(session.endDate)}
                    {session.location && <span>· {session.location}</span>}
                  </div>
                </div>
                {/*
                  /trainings defaults to the Upcoming tab, which filters a past
                  session out. Carry the intent: show the past list and open the
                  review for this session.
                */}
                <Button size="sm" variant="outline" className="shrink-0 text-xs" asChild>
                  <Link to={`/trainings?filter=past&review=${encodeURIComponent(session.id)}`}>{t("dashboard.coach.needsReview.review")}</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {/* Calendar + Tournament Visibility + AI Insights */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title={t("dashboard.coach.schedule.title")}
          description={t("dashboard.coach.schedule.description")}
          icon={<Calendar className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/calendar">{t("dashboard.common.fullCalendar")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {upcomingEvents.length === 0 && (
              <div className="py-4 text-center">
                <p className="text-sm text-muted-foreground">{t("dashboard.common.noUpcomingEvents")}</p>
                <Button size="sm" variant="outline" className="mt-3" asChild>
                  <Link to="/trainings"><Plus className="mr-1.5 h-3.5 w-3.5" /> {t("dashboard.coach.schedule.scheduleTraining")}</Link>
                </Button>
              </div>
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
          title={t("dashboard.common.playerTournamentsTitle")}
          description={t("dashboard.coach.playerTournaments.description")}
          icon={<Trophy className="h-4 w-4" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tournaments">{t("dashboard.common.explore")} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          }
        >
          {playerTournaments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.coach.playerTournaments.empty")}</p>
          ) : (
            <div className="space-y-3">
              {playerTournaments.map((pt) => (
                <div key={pt.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{pt.tournament.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pt.tournament.city}, {pt.tournament.country} · {pt.tournament.surface}
                    </p>
                  </div>
                  <StatusBadge status={pt.status} />
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>

      {/* Quick actions */}
      <DashboardCard
        title={t("dashboard.coach.quickActions.title")}
        icon={<Dumbbell className="h-4 w-4" />}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
            <Link to="/connections">
              <UserPlus className="h-5 w-5 text-primary" />
              <span className="text-sm">{t("dashboard.coach.quickActions.connectPlayer")}</span>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
            <Link to="/teams">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm">{t("dashboard.coach.quickActions.manageTeams")}</span>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
            <Link to="/trainings">
              <Dumbbell className="h-5 w-5 text-primary" />
              <span className="text-sm">{t("dashboard.coach.quickActions.scheduleTraining")}</span>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
            {/* Match prep moved onto the tournament itself — open a tournament
                to see its surface, ball, weather and how it will play. */}
            <Link to="/tournaments">
              <Brain className="h-5 w-5 text-primary" />
              <span className="text-sm">{t("dashboard.coach.quickActions.matchConditions")}</span>
            </Link>
          </Button>
        </div>
      </DashboardCard>
    </div>
  );
}
