import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/auth/AuthContext";
import { ConnectionProvider } from "@/store/ConnectionStore";
import { RouteGuard, GuestGuard } from "@/auth/RouteGuard";
import { DevHmrBanner } from "@/components/DevHmrBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BodyPointerEventsGuard } from "@/components/BodyPointerEventsGuard";
import { LoadingState } from "@/components/ui/shared";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

// ── Eager: what a cold visitor almost always needs for first paint ──────────
// The landing page, the login screen and their two thin layouts stay in the
// entry chunk so the first render needs no extra round-trip. Everything else is
// code-split below — a visitor who only wants to sign in never downloads the
// dashboard, admin, charting or map code.
import { PublicLayout } from "@/layouts/PublicLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import Index from "./pages/Index";
import LoginPage from "./pages/auth/LoginPage";

// ── Lazy: everything behind a click ────────────────────────────────────────
const DashboardLayout = lazy(() =>
  import("@/layouts/DashboardLayout").then((m) => ({ default: m.DashboardLayout }))
);

// Public / legal
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicyPage = lazy(() => import("./pages/legal/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/legal/TermsPage"));

// Auth
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage"));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const GuardianConsentPage = lazy(() => import("./pages/auth/GuardianConsentPage"));

// Dashboards
const DashboardRedirect = lazy(() => import("./pages/DashboardRedirect"));
const PlayerDashboard = lazy(() => import("./pages/dashboard/PlayerDashboard"));
const CoachDashboard = lazy(() => import("./pages/dashboard/CoachDashboard"));
const ObserverDashboard = lazy(() => import("./pages/dashboard/ObserverDashboard"));
const AdminDashboard = lazy(() => import("./pages/dashboard/AdminDashboard"));

// Feature pages
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const TournamentsPage = lazy(() => import("./pages/TournamentsPage"));
const TournamentDetailPage = lazy(() => import("./pages/TournamentDetailPage"));
const ConnectionsPage = lazy(() => import("./pages/ConnectionsPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const FinancePage = lazy(() => import("./pages/FinancePage"));
const EquipmentPage = lazy(() => import("./pages/EquipmentPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const NotificationSettingsPage = lazy(() => import("./pages/NotificationSettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const PlayersPage = lazy(() => import("./pages/PlayersPage"));
const TrainingsPage = lazy(() => import("./pages/TrainingsPage"));
const SessionBuilderPage = lazy(() => import("./pages/SessionBuilderPage"));
const TrainingRequestsPage = lazy(() => import("./pages/TrainingRequestsPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const MatchesPage = lazy(() => import("./pages/matches/MatchesPage"));
const TrainingPlansPage = lazy(() => import("./pages/trainingPlans/TrainingPlansPage"));

/**
 * Per-route suspense boundary. Placed *inside* the layout route element so a
 * pending page chunk shows its placeholder in the content area while the
 * sidebar / top bar stay mounted, instead of blanking the whole shell.
 */
function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays "fresh" for half a minute: navigating back to a page you just
      // left re-renders from cache instead of replaying a full-screen spinner.
      staleTime: 30_000,
      // Keep unused caches for the length of a typical courtside session, so
      // going Calendar → Trainings → Calendar is instant.
      gcTime: 30 * 60_000,
      // One retry survives a flaky mobile connection without turning a 401/500
      // into three requests and a three-times-longer error state.
      retry: 1,
      // Coaches switch apps constantly on a phone; refetching on every refocus
      // would hammer the API and flash loading states. Pages that need live data
      // refetch explicitly.
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <ConnectionProvider>
          <TooltipProvider>
          <Toaster />
          <Sonner />
          <BodyPointerEventsGuard />
          <DevHmrBanner />
          <BrowserRouter>
            <ErrorBoundary>
            {/* Outer boundary: covers the lazily-loaded layouts themselves. */}
            <Suspense fallback={<LoadingState className="py-32" />}>
            <Routes>
              {/* Public routes */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/privacy" element={<Page><PrivacyPolicyPage /></Page>} />
                <Route path="/terms" element={<Page><TermsPage /></Page>} />
              </Route>

              {/* Auth routes (guest only) */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
                <Route path="/signup" element={<GuestGuard><Page><SignUpPage /></Page></GuestGuard>} />
                <Route path="/verify-email" element={<Page><VerifyEmailPage /></Page>} />
                <Route path="/forgot-password" element={<GuestGuard><Page><ForgotPasswordPage /></Page></GuestGuard>} />
                <Route path="/reset-password" element={<Page><ResetPasswordPage /></Page>} />
                {/* Reached from an email by a PARENT, who may well already be
                    signed in as a coach here — so no GuestGuard, same as
                    /verify-email. */}
                <Route path="/guardian-consent" element={<Page><GuardianConsentPage /></Page>} />
              </Route>

              {/* Protected dashboard routes */}
              <Route element={<RouteGuard><DashboardLayout /></RouteGuard>}>
                <Route path="/dashboard" element={<Page><DashboardRedirect /></Page>} />
                <Route path="/dashboard/player" element={<RouteGuard allowedRoles={["player"]} showDenied><Page><PlayerDashboard /></Page></RouteGuard>} />
                <Route path="/dashboard/coach" element={<RouteGuard allowedRoles={["coach"]} showDenied><Page><CoachDashboard /></Page></RouteGuard>} />
                <Route path="/dashboard/observer" element={<RouteGuard allowedRoles={["observer"]} showDenied><Page><ObserverDashboard /></Page></RouteGuard>} />
                <Route path="/dashboard/admin" element={<RouteGuard allowedRoles={["admin"]} showDenied><Page><AdminDashboard /></Page></RouteGuard>} />

                {/* Shared */}
                <Route path="/profile" element={<Page><ProfilePage /></Page>} />
                <Route path="/calendar" element={<RouteGuard allowedRoles={["player", "coach", "observer"]} showDenied><Page><CalendarPage /></Page></RouteGuard>} />
                <Route path="/tournaments" element={<Page><TournamentsPage /></Page>} />
                <Route path="/tournaments/:id" element={<Page><TournamentDetailPage /></Page>} />
                <Route path="/connections" element={<Page><ConnectionsPage /></Page>} />
                <Route path="/notifications" element={<Page><NotificationsPage /></Page>} />
                <Route path="/notifications/settings" element={<Page><NotificationSettingsPage /></Page>} />
                {/* No /settings route: the page was an empty "coming soon" stub in every
                    role's nav. Account details live in Profile, alert preferences in
                    Notifications, and the theme switch is in the sidebar. */}

                {/* Player only */}
                <Route path="/stats" element={<RouteGuard allowedRoles={["player"]} showDenied><Page><StatsPage /></Page></RouteGuard>} />
                <Route path="/matches" element={<RouteGuard allowedRoles={["player"]} showDenied><Page><MatchesPage /></Page></RouteGuard>} />
                <Route path="/equipment" element={<RouteGuard allowedRoles={["player"]} showDenied><Page><EquipmentPage /></Page></RouteGuard>} />
                <Route path="/finance" element={<RouteGuard allowedRoles={["player", "observer"]} showDenied><Page><FinancePage /></Page></RouteGuard>} />

                {/* Coach only */}
                <Route path="/players" element={<RouteGuard allowedRoles={["coach"]} showDenied><Page><PlayersPage /></Page></RouteGuard>} />
                <Route path="/teams" element={<RouteGuard allowedRoles={["coach"]} showDenied><Page><TeamsPage /></Page></RouteGuard>} />
                <Route path="/trainings" element={<RouteGuard allowedRoles={["coach", "player"]} showDenied><Page><TrainingsPage /></Page></RouteGuard>} />
                <Route path="/session-builder" element={<RouteGuard allowedRoles={["coach"]} showDenied><Page><SessionBuilderPage /></Page></RouteGuard>} />
                {/* Saved Session-Builder plans, readable by the coach who created them
                    and the player they were assigned to (the API scopes it). */}
                <Route path="/training-plans" element={<RouteGuard allowedRoles={["coach", "player"]} showDenied><Page><TrainingPlansPage /></Page></RouteGuard>} />

                {/* Player + Coach — Training Requests */}
                <Route path="/training-requests" element={<RouteGuard allowedRoles={["player", "coach"]} showDenied><Page><TrainingRequestsPage /></Page></RouteGuard>} />

                {/* Coach + Player */}

                {/* Admin */}
                <Route path="/admin" element={<RouteGuard allowedRoles={["admin"]} showDenied><Page><AdminPage /></Page></RouteGuard>} />
                <Route path="/admin/users" element={<RouteGuard allowedRoles={["admin"]} showDenied><Page><AdminPage /></Page></RouteGuard>} />
                <Route path="/admin/relationships" element={<RouteGuard allowedRoles={["admin"]} showDenied><Page><AdminPage /></Page></RouteGuard>} />
                <Route path="/admin/alerts" element={<RouteGuard allowedRoles={["admin"]} showDenied><Page><AdminPage /></Page></RouteGuard>} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Page><NotFound /></Page>} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
          </TooltipProvider>
        </ConnectionProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
