// ============================================================
// TennisAI — Dashboard destination registry
// ============================================================
//
// The single source of truth for "which routes exist, and which roles may
// open them". It was inlined in DashboardLayout.tsx and rendered only as the
// sidebar; the command palette needs exactly the same list, and a second copy
// of it would be a role-leak waiting to happen (a coach-only route added to
// the sidebar and forgotten here would be offered to players by search).
//
// So it lives here and BOTH consumers read it:
//   • src/layouts/DashboardLayout.tsx — the sidebar / mobile drawer
//   • src/components/search/searchIndex.ts — the command palette
//
// The `roles` on each entry are kept in step with the `allowedRoles` on the
// matching <RouteGuard> in App.tsx. Where they differ today this list is the
// stricter of the two (e.g. /connections has no guard but is not offered to
// admins), which is the safe direction: search can under-offer, never
// over-offer.

import {
  LayoutDashboard,
  Calendar,
  Trophy,
  Users,
  UserPlus,
  Wallet,
  Package,
  Bell,
  Shield,
  Dumbbell,
  Sparkles,
  User,
  Link2,
  AlertTriangle,
  BarChart3,
  ClipboardList,
  ListChecks,
} from "lucide-react";
import type { UserRole } from "@/types";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
  roles: UserRole[];
  readOnly?: boolean;
}

// ─── Role-specific navigation per spec ───

export const navItems: NavItem[] = [
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

/**
 * Destinations that are deliberately absent from the sidebar because the
 * account menu at its foot owns them — but which a user searching for
 * "profile" or "notification settings" plainly expects to find.
 *
 * The role rules mirror that menu exactly: it hides Profile for admins (they
 * have no athlete profile to keep), and shows notification settings to
 * everyone. Neither route carries an `allowedRoles` guard in App.tsx, so this
 * list can only ever be *stricter* than what the router would allow.
 */
export const accountItems: NavItem[] = [
  { to: "/profile", labelKey: "dashboard.nav.profile", icon: <User className="h-4 w-4" />, roles: ["player", "coach", "observer"] },
  { to: "/notifications/settings", labelKey: "dashboard.account.notificationSettings", icon: <Bell className="h-4 w-4" />, roles: ["player", "coach", "observer", "admin"] },
];

/** Every destination the palette may offer, before the role filter. */
export const searchableDestinations: NavItem[] = [...navItems, ...accountItems];

/**
 * Does `role` have a way into `to`?
 *
 * The palette uses this for more than the destination list: whether to search
 * connected players at all is "can this role open /players", asked of the same
 * array the sidebar renders, rather than a second `role === "coach"` written
 * out somewhere it can drift.
 */
export function roleCanAccess(role: UserRole, to: string): boolean {
  return searchableDestinations.some((item) => item.to === to && item.roles.includes(role));
}
