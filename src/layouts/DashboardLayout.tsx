import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleBadge, ReadOnlyBadge } from "@/components/ui/shared";
import {
  LayoutDashboard,
  Calendar,
  Trophy,
  Users,
  UserPlus,
  Wallet,
  Package,
  Bell,
  Brain,
  LogOut,
  Shield,
  Dumbbell,
  Sparkles,
  User,
  Link2,
  AlertTriangle,
  BarChart3,
  ClipboardList,
  ListChecks,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types";
import { useState, useMemo, useEffect } from "react";
import { useNotifications, useTrainings } from "@/hooks/api/queries";
import { isBefore } from "date-fns";
import { t, formatBadgeCount } from "@/lib/i18n";

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
  roles: UserRole[];
  readOnly?: boolean;
}

// ─── Role-specific navigation per spec ───

const navItems: NavItem[] = [
  // All roles
  { to: "/dashboard", labelKey: "dashboard.nav.dashboard", icon: <LayoutDashboard className="h-4 w-4" />, roles: ["player", "coach", "observer", "admin"] },
  { to: "/profile", labelKey: "dashboard.nav.profile", icon: <User className="h-4 w-4" />, roles: ["player", "coach", "observer"] },

  // Player nav
  { to: "/calendar", labelKey: "dashboard.nav.calendar", icon: <Calendar className="h-4 w-4" />, roles: ["player", "coach", "observer"] },
  { to: "/tournaments", labelKey: "dashboard.nav.tournaments", icon: <Trophy className="h-4 w-4" />, roles: ["player", "coach", "observer", "admin"] },
  { to: "/matches", labelKey: "dashboard.nav.matches", icon: <ClipboardList className="h-4 w-4" />, roles: ["player"] },
  { to: "/stats", labelKey: "dashboard.nav.stats", icon: <BarChart3 className="h-4 w-4" />, roles: ["player"] },
  { to: "/equipment", labelKey: "dashboard.nav.equipment", icon: <Package className="h-4 w-4" />, roles: ["player"] },
  { to: "/finance", labelKey: "dashboard.nav.finance", icon: <Wallet className="h-4 w-4" />, roles: ["player", "observer"] },

  // Coach nav
  { to: "/players", labelKey: "dashboard.nav.players", icon: <Users className="h-4 w-4" />, roles: ["coach"] },
  { to: "/teams", labelKey: "dashboard.nav.teams", icon: <Shield className="h-4 w-4" />, roles: ["coach"] },
  { to: "/trainings", labelKey: "dashboard.nav.trainings", icon: <Dumbbell className="h-4 w-4" />, roles: ["coach", "player"] },
  { to: "/training-plans", labelKey: "dashboard.nav.trainingPlans", icon: <ListChecks className="h-4 w-4" />, roles: ["coach", "player"] },
  { to: "/session-builder", labelKey: "dashboard.nav.sessionBuilder", icon: <Sparkles className="h-4 w-4" />, roles: ["coach"] },
  // The player side of training requests exists too — without the role here it
  // was reachable only by typing the URL.
  { to: "/training-requests", labelKey: "dashboard.nav.trainingRequests", icon: <UserPlus className="h-4 w-4" />, roles: ["coach", "player"] },

  // Shared — a coach lives in Connections (that's how players get attached).
  { to: "/connections", labelKey: "dashboard.nav.connections", icon: <Link2 className="h-4 w-4" />, roles: ["player", "coach", "observer"] },
  { to: "/ai-insights", labelKey: "dashboard.nav.aiInsights", icon: <Brain className="h-4 w-4" />, roles: ["player", "coach"] },
  { to: "/notifications", labelKey: "dashboard.nav.notifications", icon: <Bell className="h-4 w-4" />, roles: ["player", "coach", "observer", "admin"] },

  // Admin nav
  { to: "/admin/users", labelKey: "dashboard.nav.adminUsers", icon: <Users className="h-4 w-4" />, roles: ["admin"] },
  { to: "/admin/relationships", labelKey: "dashboard.nav.adminRelationships", icon: <Link2 className="h-4 w-4" />, roles: ["admin"] },
  { to: "/admin/alerts", labelKey: "dashboard.nav.adminAlerts", icon: <AlertTriangle className="h-4 w-4" />, roles: ["admin"] },

  // No Settings entry: the page is a stub for every role. The settings that do
  // exist live where they are used — account details in Profile, alert
  // preferences in Notifications, theme in the switch below.
];

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Auto-open the first-run onboarding questionnaire for accounts that haven't done it.
  useEffect(() => {
    if (user && !user.onboardingCompletedAt) setOnboardingOpen(true);
  }, [user]);
  const role = user?.role ?? "player";
  const isObserver = role === "observer";

  const { data: trainings = [] } = useTrainings();
  const unreviewedCount = useMemo(() => {
    if (role !== "coach") return 0;
    const now = new Date();
    return trainings.filter((t) => isBefore(new Date(t.endDate), now) && !t.review).length;
  }, [trainings, role]);

  // Same badge treatment as unreviewed trainings, so an unread alert is
  // visible from anywhere in the app.
  const { data: notifications = [] } = useNotifications(user?.id ?? "");
  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-border px-6">
        <span className="text-lg font-bold tracking-tight text-foreground">TennisAI</span>
        <RoleBadge role={role} />
        {isObserver && <ReadOnlyBadge className="ml-auto" />}
      </div>
      <nav className="flex flex-col gap-1 p-4">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            {item.icon}
            <span className="flex-1">{t(item.labelKey)}</span>
            {item.to === "/trainings" && unreviewedCount > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
                aria-label={t("nav.trainings.unreviewedAria", { count: unreviewedCount })}
              >
                {t("nav.trainings.unreviewedBadge", { count: formatBadgeCount(unreviewedCount) })}
              </span>
            )}
            {item.to === "/notifications" && unreadNotificationCount > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
                aria-label={t("nav.notifications.unreadAria", { count: unreadNotificationCount })}
              >
                {t("nav.notifications.unreadBadge", { count: formatBadgeCount(unreadNotificationCount) })}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-border p-4">
        <div className="mb-3 flex items-center gap-3 px-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{t(`dashboard.role.${role}`)}</p>
          </div>
          <ThemeToggle />
        </div>
        <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> {t("dashboard.actions.logout")}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* First-run, role-based onboarding questionnaire (empty new accounts). */}
      {user && <OnboardingDialog user={user} open={onboardingOpen} onOpenChange={setOnboardingOpen} />}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col border-r border-border bg-card">
            <Button variant="ghost" size="icon" className="absolute right-2 top-3 z-10" onClick={() => setMobileMenuOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-lg font-bold text-foreground">TennisAI</span>
          <ThemeToggle />
        </div>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
