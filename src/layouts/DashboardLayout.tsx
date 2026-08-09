import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Remembers the collapsed nav across reloads. */
const NAV_COLLAPSED_KEY = "tennisai:navCollapsed";
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
  // No /profile entry: the account menu at the bottom of the sidebar owns it,
  // where the avatar already implies "this is you".

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
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Collapsing the nav hands the whole width to the current page. Remembered
  // across reloads so a user who works collapsed isn't re-expanded every visit.
  const [navCollapsed, setNavCollapsed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(NAV_COLLAPSED_KEY) === "true",
  );
  const toggleNav = () => {
    setNavCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* private mode — collapse still works, just isn't remembered */ }
      return next;
    });
  };
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

  // `withSlot` is true for the desktop sidebar only (it owns the collapse
  // button). The desktop sidebar and the mobile drawer render this same markup.
  const renderSidebar = ({ withSlot = false }: { withSlot?: boolean } = {}) => (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-border pl-6 pr-2">
        <span className="text-lg font-bold tracking-tight text-foreground">TennisAI</span>
        <RoleBadge role={role} />
        {isObserver && <ReadOnlyBadge />}
        {withSlot && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleNav}
            title={t("dashboard.nav.collapse")}
            aria-label={t("dashboard.nav.collapse")}
            className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>
      {/* Scrolls rather than clipping: the sidebar column is h-screen, and on a
          short window 12+ items would otherwise be cut off with no way to
          reach them. min-h-0 lets a flex child actually shrink to allow it. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            // NOT `end` for /dashboard: that path immediately redirects to a
            // role dashboard (/dashboard/coach etc.), so an exact match meant
            // NO nav item was ever highlighted on the page users actually land
            // on. Prefix matching keeps Dashboard lit for /dashboard/*.
            end={false}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                // The highlight is each link's OWN background, cross-fading in
                // place: switching pages fades the old row's green out while the
                // new row's fades in, over the same 120ms. Deliberately not a
                // shared element sliding down the column — that made a jump from
                // the first item to the last visibly sweep past every row
                // between them, which reads as travel time, not responsiveness.
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-120",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                {item.icon}
                <span className="flex-1">{t(item.labelKey)}</span>
                {item.to === "/trainings" && unreviewedCount > 0 && (
                  <span
                    className={cn(
                      "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                      // On the active row the pill behind it is already primary,
                      // so a primary badge would vanish into it.
                      isActive ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                    )}
                    aria-label={t("nav.trainings.unreviewedAria", { count: unreviewedCount })}
                  >
                    {t("nav.trainings.unreviewedBadge", { count: formatBadgeCount(unreviewedCount) })}
                  </span>
                )}
                {item.to === "/notifications" && unreadNotificationCount > 0 && (
                  <span
                    className={cn(
                      "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                      isActive ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                    )}
                    aria-label={t("nav.notifications.unreadAria", { count: unreadNotificationCount })}
                  >
                {t("nav.notifications.unreadBadge", { count: formatBadgeCount(unreadNotificationCount) })}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Account menu — the avatar row IS the button. Profile used to be a nav
          item; it now lives behind this, next to the identity it belongs to. */}
      <div className="mt-auto border-t border-border p-3">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent data-[state=open]:bg-accent"
                aria-label={t("dashboard.account.menuAria")}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</span>
                  <span className="block truncate text-xs capitalize text-muted-foreground">{t(`dashboard.role.${role}`)}</span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-[13rem]">
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                {user?.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {role !== "admin" && (
                <DropdownMenuItem onSelect={() => { setMobileMenuOpen(false); navigate("/profile"); }} className="gap-2">
                  <User className="h-4 w-4" /> {t("dashboard.nav.profile")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => { setMobileMenuOpen(false); navigate("/notifications/settings"); }} className="gap-2">
                <Bell className="h-4 w-4" /> {t("dashboard.account.notificationSettings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" /> {t("dashboard.actions.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* First-run, role-based onboarding questionnaire (empty new accounts). */}
      {user && <OnboardingDialog user={user} open={onboardingOpen} onOpenChange={setOnboardingOpen} />}

      {/* Desktop sidebar.
          Collapsed → not rendered at all, so the page gets the full width. */}
      {!navCollapsed && (
        <aside className="hidden h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
          {renderSidebar({ withSlot: true })}
        </aside>
      )}

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col border-r border-border bg-card">
            <Button variant="ghost" size="icon" className="absolute right-2 top-3 z-10" onClick={() => setMobileMenuOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
            {renderSidebar()}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-lg font-bold text-foreground">TennisAI</span>
          <ThemeToggle />
        </div>
        <div className="p-6">
          {/* The only way back once the nav is hidden. Inline (not floating) so
              it can never sit on top of page content. */}
          {navCollapsed && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleNav}
              className="mb-4 hidden gap-2 md:inline-flex"
              aria-label={t("dashboard.nav.expand")}
            >
              <PanelLeftOpen className="h-4 w-4" />
              {t("dashboard.nav.menu")}
            </Button>
          )}
          {/* Keyed on the path so React remounts this wrapper per route and the
              fade replays. Opacity only — no movement, so it can't fight the
              browser's scroll restoration or nudge content under the cursor. */}
          <div key={location.pathname} className="animate-fade-in-soft">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
