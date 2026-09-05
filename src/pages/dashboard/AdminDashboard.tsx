import { useState } from "react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { GetStartedCard } from "@/components/dashboard/GetStartedCard";
import { adminItems, isProfileComplete } from "@/components/dashboard/firstRunItems";
import { useOnboarding } from "@/hooks/api/onboarding";
import { RoleBadge, StatusBadge } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  UserPlus,
  Trophy,
  AlertTriangle,
  Shield,
  Search,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  Link2,
  Info,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { useT, formatDate as formatDateIntl } from "@/lib/i18n";
import type { UserRole } from "@/types";

// ── Mock admin data ──

const mockUserCounts = {
  total: 1248,
  players: 876,
  coaches: 214,
  observers: 134,
  admins: 24,
};

interface RecentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "pending" | "suspended";
  registeredAt: string;
}

const mockRecentUsers: RecentUser[] = [
  { id: "u1", name: "Alex Rivera", email: "alex.r@email.com", role: "player", status: "active", registeredAt: "2026-03-08T09:00:00Z" },
  { id: "u2", name: "Sara Kim", email: "sara.k@email.com", role: "coach", status: "active", registeredAt: "2026-03-07T14:30:00Z" },
  { id: "u3", name: "James Patel", email: "james.p@email.com", role: "player", status: "pending", registeredAt: "2026-03-07T11:15:00Z" },
  { id: "u4", name: "Maria Santos", email: "maria.s@email.com", role: "observer", status: "active", registeredAt: "2026-03-06T16:45:00Z" },
  { id: "u5", name: "Tom Wilson", email: "tom.w@email.com", role: "player", status: "suspended", registeredAt: "2026-03-06T08:20:00Z" },
  { id: "u6", name: "Yuki Tanaka", email: "yuki.t@email.com", role: "coach", status: "active", registeredAt: "2026-03-05T13:00:00Z" },
  { id: "u7", name: "Emma Clark", email: "emma.c@email.com", role: "player", status: "pending", registeredAt: "2026-03-05T10:30:00Z" },
];

interface AdminTournament {
  id: string;
  name: string;
  city: string;
  country: string;
  startDate: string;
  status: string;
  participants: number;
}

const mockAdminTournaments: AdminTournament[] = [
  { id: "t1", name: "City Open 2026", city: "Madrid", country: "Spain", startDate: "2026-04-10", status: "upcoming", participants: 64 },
  { id: "t2", name: "Indoor Masters", city: "London", country: "UK", startDate: "2026-05-01", status: "upcoming", participants: 32 },
  { id: "t3", name: "Junior Championship", city: "Paris", country: "France", startDate: "2026-06-01", status: "upcoming", participants: 128 },
  { id: "t4", name: "Spring Classic", city: "Melbourne", country: "Australia", startDate: "2026-02-15", status: "completed", participants: 48 },
  { id: "t5", name: "Regional Cup", city: "Berlin", country: "Germany", startDate: "2026-01-20", status: "cancelled", participants: 16 },
];

interface SystemAlert {
  id: string;
  type: "warning" | "error" | "info";
  title: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

const mockAlerts: SystemAlert[] = [
  { id: "a1", type: "warning", title: "High API Latency", message: "Average response time exceeded 2s in the last hour.", timestamp: "2026-03-08T08:45:00Z", resolved: false },
  { id: "a2", type: "error", title: "Failed Email Delivery", message: "12 verification emails bounced in the last 24 hours.", timestamp: "2026-03-07T22:10:00Z", resolved: false },
  { id: "a3", type: "info", title: "Scheduled Maintenance", message: "Database maintenance planned for March 12, 02:00–04:00 UTC.", timestamp: "2026-03-07T10:00:00Z", resolved: false },
  { id: "a4", type: "warning", title: "Unusual Signup Spike", message: "50% increase in registrations detected from a single IP range.", timestamp: "2026-03-06T15:30:00Z", resolved: true },
];

// ── Helpers ──

function formatDate(iso: string) {
  return formatDateIntl(iso, { month: "short", day: "numeric" });
}

function formatDateTime(iso: string) {
  return formatDateIntl(iso, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const userStatusStyles: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  pending: "bg-primary/10 text-primary dark:text-primary",
  suspended: "bg-destructive/10 text-destructive",
};

const tournamentStatusStyles: Record<string, string> = {
  upcoming: "bg-muted text-foreground dark:text-foreground",
  active: "bg-primary/10 text-primary",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

const alertIcons: Record<string, React.ReactNode> = {
  warning: <AlertTriangle className="h-4 w-4 text-primary dark:text-primary" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
  info: <Clock className="h-4 w-4 text-foreground dark:text-foreground" />,
};

const alertBorders: Record<string, string> = {
  warning: "border-primary/25",
  error: "border-destructive/20",
  info: "border-border",
};

// ── Component ──

export default function AdminDashboard() {
  const { t } = useT();
  const { user } = useAuth();
  const { requests } = useConnections();
  const [userSearch, setUserSearch] = useState("");
  // The one first-run step an admin can complete today (academy questionnaire).
  // Not part of any loading gate: this dashboard has none, and a failure here
  // simply hides the checklist.
  const { data: onboarding, isLoading: loadingOnboarding, error: errorOnboarding } = useOnboarding(!!user);

  const filteredUsers = mockRecentUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.role.includes(userSearch.toLowerCase())
  );

  const unresolvedAlerts = mockAlerts.filter((a) => !a.resolved);
  const pendingRelationships = requests.filter((r) => r.status === "pending");
  const activeRelationships = requests.filter((r) => r.status === "active");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard.admin.header.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.admin.header.subtitle")}</p>
      </div>

      {/* Preview banner — this dashboard is not wired to real data yet */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-4 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{t("dashboard.admin.previewBanner.strong")}</strong> {t("dashboard.admin.previewBanner.text")}
        </p>
      </div>

      {/* First-run checklist — rendered once the answers are known so no tick can be wrong. */}
      {!loadingOnboarding && !errorOnboarding && (
        <GetStartedCard
          storageKey={`admin:${user?.id ?? ""}`}
          items={adminItems(t, { profileComplete: isProfileComplete("admin", onboarding?.answers) })}
        />
      )}

      {/* User count cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("dashboard.admin.userCounts.total")} value={mockUserCounts.total.toLocaleString()} icon={<Users className="h-4 w-4" />} trend={t("dashboard.admin.userCounts.totalTrend", { count: 32 })} />
        <StatCard label={t("dashboard.admin.userCounts.players")} value={mockUserCounts.players.toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <StatCard label={t("dashboard.admin.userCounts.coaches")} value={mockUserCounts.coaches.toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <StatCard label={t("dashboard.admin.userCounts.observers")} value={mockUserCounts.observers.toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <StatCard label={t("dashboard.admin.userCounts.admins")} value={mockUserCounts.admins} icon={<Shield className="h-4 w-4" />} />
      </div>

      {/* Relationship overview + System Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title={t("dashboard.admin.relationships.title")}
          description={t("dashboard.admin.relationships.description")}
          icon={<Link2 className="h-4 w-4" />}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{activeRelationships.length}</p>
              <p className="text-xs text-muted-foreground">{t("dashboard.admin.relationships.active")}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{pendingRelationships.length}</p>
              <p className="text-xs text-muted-foreground">{t("dashboard.admin.relationships.pending")}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{requests.filter((r) => r.status === "rejected").length}</p>
              <p className="text-xs text-muted-foreground">{t("dashboard.admin.relationships.rejected")}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{requests.filter((r) => r.status === "revoked").length}</p>
              <p className="text-xs text-muted-foreground">{t("dashboard.admin.relationships.revoked")}</p>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          title={t("dashboard.admin.systemAlerts.title")}
          description={t("dashboard.admin.systemAlerts.unresolved", { count: unresolvedAlerts.length })}
          icon={<AlertTriangle className="h-4 w-4" />}
          badge={
            unresolvedAlerts.length > 0 ? (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                {unresolvedAlerts.length}
              </span>
            ) : undefined
          }
        >
          <div className="space-y-3">
            {mockAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 rounded-lg border bg-card p-3 ${alert.resolved ? "border-border opacity-60" : alertBorders[alert.type]}`}
              >
                <div className="mt-0.5 shrink-0">{alertIcons[alert.type]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${alert.resolved ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {alert.title}
                    </p>
                    {alert.resolved && (
                      <span className="flex items-center gap-1 text-[10px] text-primary">
                        <CheckCircle className="h-3 w-3" /> {t("dashboard.admin.systemAlerts.resolved")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(alert.timestamp)}</p>
                </div>
                {!alert.resolved && (
                  <Button variant="ghost" size="sm" className="shrink-0 text-xs">
                    {t("dashboard.admin.systemAlerts.resolve")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>

      {/* User Management Table */}
      <DashboardCard
        title={t("dashboard.admin.recentRegistrations.title")}
        description={t("dashboard.admin.recentRegistrations.description")}
        icon={<UserPlus className="h-4 w-4" />}
        action={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("dashboard.admin.recentRegistrations.searchPlaceholder")}
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.recentRegistrations.columnUser")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.recentRegistrations.columnRole")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.recentRegistrations.columnStatus")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.recentRegistrations.columnRegistered")}</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.recentRegistrations.columnActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-secondary/20">
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${userStatusStyles[u.status]}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatDate(u.registeredAt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    {t("dashboard.admin.recentRegistrations.noResults", { query: userSearch })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      {/* Tournament Management */}
      <DashboardCard
        title={t("dashboard.admin.tournamentManagement.title")}
        description={t("dashboard.admin.tournamentManagement.description", { count: mockAdminTournaments.length })}
        icon={<Trophy className="h-4 w-4" />}
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.tournamentManagement.columnTournament")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.tournamentManagement.columnLocation")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.tournamentManagement.columnDate")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.tournamentManagement.columnParticipants")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.tournamentManagement.columnStatus")}</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.admin.tournamentManagement.columnActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockAdminTournaments.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-secondary/20">
                  <td className="px-5 py-3 font-medium text-foreground">{t.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{t.city}, {t.country}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(t.startDate)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{t.participants}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${tournamentStatusStyles[t.status]}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>
  );
}
