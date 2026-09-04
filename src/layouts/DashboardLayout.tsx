import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { AmbientCourt } from "@/components/motion/AmbientCourt";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleBadge, ReadOnlyBadge } from "@/components/ui/shared";
import {
  Bell,
  LogOut,
  User,
  Menu,
  X,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
// The nav array moved to the search registry so the sidebar and the command
// palette read one list. Everything below renders it exactly as before.
import { navItems } from "@/components/search/navRegistry";
import { CommandPalette } from "@/components/search/CommandPalette";
import { SearchTrigger, SearchTriggerIcon } from "@/components/search/SearchTrigger";

/** Remembers the collapsed nav across reloads. */
const NAV_COLLAPSED_KEY = "tennisai:navCollapsed";

/** Display-name key per supported locale, for the account-menu language switcher. */
const LOCALE_LABEL_KEY: Record<Locale, string> = {
  en: "language.english",
  es: "language.spanish",
};
import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect, useRef } from "react";
import { useNotifications, useTrainings } from "@/hooks/api/queries";
import { isBefore } from "date-fns";
import { useT, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

export function DashboardLayout() {
  const { t, formatBadgeCount, locale, setLocale } = useT();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Collapsing the nav hands the whole width to the current page. Remembered
  // across reloads so a user who works collapsed isn't re-expanded every visit.
  const [navCollapsed, setNavCollapsed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(NAV_COLLAPSED_KEY) === "true",
  );
  const applyNavCollapsed = (next: boolean) => {
    setNavCollapsed(next);
    try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* private mode — collapse still works, just isn't remembered */ }
  };

  // The nav opens and closes only when asked. It used to hide itself as soon as
  // a destination was chosen, to hand the page the full width — but that turned
  // a deliberate setting into one you had to keep restoring, so navigating now
  // leaves the sidebar exactly as it was found.
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusToMenu = useRef(false);
  const toggleNav = () => {
    // Collapsing unmounts the sidebar, and the button doing it lives inside.
    // Without this a keyboard user is dumped on <body> with no way back, so
    // focus follows the control over to its expanded counterpart.
    if (!navCollapsed) returnFocusToMenu.current = true;
    applyNavCollapsed(!navCollapsed);
  };
  useEffect(() => {
    if (navCollapsed && returnFocusToMenu.current) {
      returnFocusToMenu.current = false;
      expandButtonRef.current?.focus();
    }
  }, [navCollapsed]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Global search. Opening it also dismisses the mobile drawer: the drawer's
  // own Escape handler is a document listener, so with both open one Escape
  // would close the palette AND the drawer, dumping the user two levels back.
  const [searchOpen, setSearchOpen] = useState(false);
  const handleSearchOpenChange = (next: boolean) => {
    setSearchOpen(next);
    if (next) setMobileMenuOpen(false);
  };
  const openSearch = () => handleSearchOpenChange(true);

  // The mobile drawer is a hand-rolled overlay, not a Radix dialog, so the two
  // behaviours users expect from one have to be wired by hand:
  //   • Escape closes it (and a hardware keyboard on a tablet is common).
  //   • The page underneath stops scrolling. Without this a swipe on the
  //     drawer's backdrop scrolled the page behind it, so dismissing the menu
  //     also silently moved the content the user was coming back to.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The account menu lives INSIDE the drawer. Radix closes it on Escape
      // without calling preventDefault, so a bare handler here would dismiss
      // the menu and the whole drawer on one keypress — the user loses their
      // place instead of stepping back one level.
      const target = event.target as Element | null;
      if (target?.closest?.('[role="menu"]')) return;
      setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    // Locked on <html>, not just <body>. `document.body.style.overflow` alone
    // was measured NOT to hold here (a wheel over the backdrop still scrolled
    // the page 400px): the viewport's scroller is the documentElement, and
    // body's overflow only propagates to it under conditions this layout
    // doesn't meet. Both are set, and both restored.
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileMenuOpen]);

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
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border pl-6 pr-2">
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
            className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground coarse:min-h-11 coarse:min-w-11"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>
      {/* The discoverable half of the palette. Above the nav rather than in it,
          because it reaches everything below and more — and shrink-0 so it
          can't be squeezed out when the nav underneath starts scrolling. */}
      <div className="shrink-0 px-4 pt-4">
        <SearchTrigger onClick={openSearch} />
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
            // The mobile drawer is an overlay sitting on top of the page, so
            // choosing a destination has to dismiss it to reveal what was
            // chosen. The desktop sidebar is a column beside the content and
            // stays exactly where it is.
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                // The highlight is each link's OWN background, cross-fading in
                // place: switching pages fades the old row's green out while the
                // new row's fades in, over the same 120ms. Deliberately not a
                // shared element sliding down the column — that made a jump from
                // the first item to the last visibly sweep past every row
                // between them, which reads as travel time, not responsiveness.
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-120 touch-manipulation coarse:min-h-11",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* The icon reacts once, on becoming active, then settles. The
                    class is only present while the route matches, so React
                    adding it is what starts the animation — no state, no timer,
                    and nothing left running behind a page the user is reading. */}
                <span className={cn("inline-flex shrink-0", isActive && "icon-activate")}>
                  {item.icon}
                </span>
                <span className="flex-1">{t(item.labelKey)}</span>
                {item.to === "/trainings" && unreviewedCount > 0 && (
                  <span
                    className={cn(
                      "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                      // Genuinely live: a real count of things waiting. It stops
                      // when the count does, because the badge unmounts at zero.
                      "badge-live",
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
                      // Genuinely live: a real count of things waiting. It stops
                      // when the count does, because the badge unmounts at zero.
                      "badge-live",
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
      <div className="mt-auto shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors touch-manipulation hover:bg-accent data-[state=open]:bg-accent coarse:min-h-11"
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
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Globe className="h-4 w-4" /> {t("dashboard.account.language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={locale} onValueChange={(next) => setLocale(next as Locale)}>
                    {SUPPORTED_LOCALES.map((code) => (
                      <DropdownMenuRadioItem key={code} value={code}>
                        {t(LOCALE_LABEL_KEY[code])}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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
    // `isolate` is required, not decorative: AmbientCourt sits at -z-10, and
    // without a stacking context here it drops behind the opaque page
    // background and is never seen.
    <div className="relative isolate flex min-h-screen bg-background">
      {/* The moving background. Sibling of the shell rather than a child of
          `main`, because `main` is a scroll container above `md` and an
          absolutely-positioned child would scroll away with the content. */}
      <AmbientCourt />

      {/* First-run, role-based onboarding questionnaire (empty new accounts). */}
      {user && <OnboardingDialog user={user} open={onboardingOpen} onOpenChange={setOnboardingOpen} />}

      {/* Global search. Mounted here so Ctrl/⌘+K works on every dashboard page;
          its data hooks live inside the dialog and only run once it's open. */}
      <CommandPalette open={searchOpen} onOpenChange={handleSearchOpenChange} />

      {/* Desktop sidebar.
          Collapsed → not rendered at all, so the page gets the full width. */}
      {!navCollapsed && (
        <aside className="hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
          {renderSidebar({ withSlot: true })}
        </aside>
      )}

      {/* Mobile drawer. A real dialog: Escape closes it, the page behind it
          can't be scrolled away underneath, and the panel is sized in dvh so
          iOS Safari's collapsing URL bar can't hide the account row. */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("dashboard.nav.menu")}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          {/* Was a flat w-64 (256px) — 68% of a 375px phone, which left an
              awkward 119px strip of page. Capped at 82vw so the strip stays a
              clearly tappable "close" area on every phone width. */}
          <aside
            className="relative flex h-dvh w-[min(17rem,82vw)] flex-col border-r border-border bg-card pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)]"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-[calc(0.25rem+env(safe-area-inset-top))] z-10"
              onClick={() => setMobileMenuOpen(false)}
              aria-label={t("dashboard.nav.close")}
            >
              <X className="h-5 w-5" />
            </Button>
            {renderSidebar()}
          </aside>
        </div>
      )}

      {/* Main content.
          `overflow-y-auto` is md-and-up only. On a phone this element is the
          ancestor of the header below, and an `overflow: auto` ancestor
          silently disables `position: sticky` on everything inside it — the
          header would scroll away and the only route to the nav with it. */}
      <main className="min-w-0 flex-1 md:overflow-y-auto">
        {/* Sticky so the way back to the nav is always one thumb-reach away,
            however far down a long list the user has scrolled. */}
        <div className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-border bg-background/95 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("dashboard.nav.menu")}
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-lg font-bold text-foreground">TennisAI</span>
          {/* Search sits in the header, not only in the drawer: on a phone the
              drawer is the thing search exists to save you from opening. */}
          <div className="flex items-center">
            <SearchTriggerIcon onClick={openSearch} />
            <ThemeToggle />
          </div>
        </div>
        {/* 24px of gutter either side costs a phone 13% of its width. 16px
            below sm, the original 24 from sm up. The bottom pad clears the
            home indicator on a notched device. */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:p-6">
          {/* The only way back once the nav is hidden. Inline (not floating) so
              it can never sit on top of page content, and focus lands here the
              moment the sidebar it replaces unmounts. */}
          {navCollapsed && (
            // Search rides alongside it: collapsing the sidebar takes the
            // search row with it, and the header's icon is phone-only, so
            // without this the only way to search is to un-collapse the nav
            // the user deliberately collapsed.
            <div className="mb-4 hidden items-center gap-2 md:flex">
              <Button
                ref={expandButtonRef}
                variant="outline"
                size="sm"
                onClick={toggleNav}
                className="gap-2"
                aria-label={t("dashboard.nav.expand")}
              >
                <PanelLeftOpen className="h-4 w-4" />
                {t("dashboard.nav.menu")}
              </Button>
              <SearchTriggerIcon onClick={openSearch} />
            </div>
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
