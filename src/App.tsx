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

// Layouts
import { PublicLayout } from "@/layouts/PublicLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";

// Public pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PrivacyPolicyPage from "./pages/legal/PrivacyPolicyPage";
import TermsPage from "./pages/legal/TermsPage";

// Auth pages
import LoginPage from "./pages/auth/LoginPage";
import SignUpPage from "./pages/auth/SignUpPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";

// Dashboard pages
import DashboardRedirect from "./pages/DashboardRedirect";
import PlayerDashboard from "./pages/dashboard/PlayerDashboard";
import CoachDashboard from "./pages/dashboard/CoachDashboard";
import ObserverDashboard from "./pages/dashboard/ObserverDashboard";
import AdminDashboard from "./pages/dashboard/AdminDashboard";

// Feature pages
import CalendarPage from "./pages/CalendarPage";
import TournamentsPage from "./pages/TournamentsPage";
import TournamentDetailPage from "./pages/TournamentDetailPage";
import ConnectionsPage from "./pages/ConnectionsPage";
import TeamsPage from "./pages/TeamsPage";
import FinancePage from "./pages/FinancePage";
import EquipmentPage from "./pages/EquipmentPage";
import AIInsightsPage from "./pages/AIInsightsPage";
import NotificationsPage from "./pages/NotificationsPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import PlayersPage from "./pages/PlayersPage";
import TrainingsPage from "./pages/TrainingsPage";
import SessionBuilderPage from "./pages/SessionBuilderPage";
import TrainingRequestsPage from "./pages/TrainingRequestsPage";
import StatsPage from "./pages/StatsPage";
import MatchesPage from "./pages/matches/MatchesPage";

const queryClient = new QueryClient();

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
            <Routes>
              {/* Public routes */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
              </Route>

              {/* Auth routes (guest only) */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
                <Route path="/signup" element={<GuestGuard><SignUpPage /></GuestGuard>} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/forgot-password" element={<GuestGuard><ForgotPasswordPage /></GuestGuard>} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>

              {/* Protected dashboard routes */}
              <Route element={<RouteGuard><DashboardLayout /></RouteGuard>}>
                <Route path="/dashboard" element={<DashboardRedirect />} />
                <Route path="/dashboard/player" element={<RouteGuard allowedRoles={["player"]} showDenied><PlayerDashboard /></RouteGuard>} />
                <Route path="/dashboard/coach" element={<RouteGuard allowedRoles={["coach"]} showDenied><CoachDashboard /></RouteGuard>} />
                <Route path="/dashboard/observer" element={<RouteGuard allowedRoles={["observer"]} showDenied><ObserverDashboard /></RouteGuard>} />
                <Route path="/dashboard/admin" element={<RouteGuard allowedRoles={["admin"]} showDenied><AdminDashboard /></RouteGuard>} />

                {/* Shared */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/calendar" element={<RouteGuard allowedRoles={["player", "coach", "observer"]} showDenied><CalendarPage /></RouteGuard>} />
                <Route path="/tournaments" element={<TournamentsPage />} />
                <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
                <Route path="/connections" element={<ConnectionsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/notifications/settings" element={<NotificationSettingsPage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Player only */}
                <Route path="/stats" element={<RouteGuard allowedRoles={["player"]} showDenied><StatsPage /></RouteGuard>} />
                <Route path="/matches" element={<RouteGuard allowedRoles={["player"]} showDenied><MatchesPage /></RouteGuard>} />
                <Route path="/equipment" element={<RouteGuard allowedRoles={["player"]} showDenied><EquipmentPage /></RouteGuard>} />
                <Route path="/finance" element={<RouteGuard allowedRoles={["player", "observer"]} showDenied><FinancePage /></RouteGuard>} />

                {/* Coach only */}
                <Route path="/players" element={<RouteGuard allowedRoles={["coach"]} showDenied><PlayersPage /></RouteGuard>} />
                <Route path="/teams" element={<RouteGuard allowedRoles={["coach"]} showDenied><TeamsPage /></RouteGuard>} />
                <Route path="/trainings" element={<RouteGuard allowedRoles={["coach", "player"]} showDenied><TrainingsPage /></RouteGuard>} />
                <Route path="/session-builder" element={<RouteGuard allowedRoles={["coach"]} showDenied><SessionBuilderPage /></RouteGuard>} />

                {/* Player + Coach — Training Requests */}
                <Route path="/training-requests" element={<RouteGuard allowedRoles={["player", "coach"]} showDenied><TrainingRequestsPage /></RouteGuard>} />

                {/* Coach + Player */}
                <Route path="/ai-insights" element={<RouteGuard allowedRoles={["player", "coach"]} showDenied><AIInsightsPage /></RouteGuard>} />

                {/* Admin */}
                <Route path="/admin" element={<RouteGuard allowedRoles={["admin"]} showDenied><AdminPage /></RouteGuard>} />
                <Route path="/admin/users" element={<RouteGuard allowedRoles={["admin"]} showDenied><AdminPage /></RouteGuard>} />
                <Route path="/admin/relationships" element={<RouteGuard allowedRoles={["admin"]} showDenied><AdminPage /></RouteGuard>} />
                <Route path="/admin/alerts" element={<RouteGuard allowedRoles={["admin"]} showDenied><AdminPage /></RouteGuard>} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </ErrorBoundary>
          </BrowserRouter>
          </TooltipProvider>
        </ConnectionProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
