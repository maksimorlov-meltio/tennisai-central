// ============================================================
// First-run checklist — item builders (pure)
//
// One builder per role. Each takes the facts a dashboard already knows and
// returns the checklist items with `done` DERIVED from those facts. Nothing
// here reads storage: a tick is true because the data says so, or it is
// false. The one exception is the parent's consent step — no data that could
// prove it ever reaches the client (guardianship consent lives server-side
// and is not sent to the guardian's account), so the item is flagged
// `manual` with that reason rather than quietly pretending.
// ============================================================

import type { ConnectionRequest, UserRole } from "@/types";
import { questionsForRole } from "@/lib/onboarding/questions";
import type { GetStartedItem } from "@/components/dashboard/GetStartedCard";

/** The translator handed out by `useT()`. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type OnboardingAnswers = Record<string, string | string[]> | null | undefined;

/**
 * Every REQUIRED onboarding question for the role has an answer. This is
 * deliberately stricter than `user.onboardingCompletedAt`, which "Skip for now"
 * also sets — a skipped questionnaire is not a complete profile.
 */
export function isProfileComplete(role: UserRole, answers: OnboardingAnswers): boolean {
  const required = questionsForRole(role).filter((q) => !q.optional);
  if (required.length === 0) return false;
  return required.every((q) => {
    const answer = answers?.[q.id];
    return Array.isArray(answer) ? answer.length > 0 : Boolean(answer && String(answer).trim());
  });
}

/**
 * An ACTIVE relationship whose other side is a coach. "Any active link" is not
 * enough: a player linked only to a parent still has nobody to plan with.
 */
export function hasCoachCounterpart(relationships: ConnectionRequest[], userId: string): boolean {
  return relationships.some((r) => {
    if (r.status !== "active") return false;
    const otherRole = r.fromUserId === userId ? r.toUserRole : r.fromUserRole;
    return otherRole === "coach";
  });
}

export const MANUAL_CONSENT_REASON =
  "Guardianship consent is recorded server-side on the junior's account and never sent to the parent's session, so nothing on the client can prove this step.";

export interface PlayerFacts {
  profileComplete: boolean;
  hasCoach: boolean;
  tournamentCount: number;
}

export function playerItems(t: Translate, f: PlayerFacts): GetStartedItem[] {
  return [
    {
      id: "complete-profile",
      label: t("firstRun.player.completeProfile.label"),
      description: t("firstRun.player.completeProfile.description"),
      to: "/profile",
      actionLabel: t("firstRun.player.completeProfile.action"),
      done: f.profileComplete,
    },
    {
      id: "connect-coach",
      label: t("firstRun.player.connectCoach.label"),
      description: t("firstRun.player.connectCoach.description"),
      to: "/connections",
      actionLabel: t("firstRun.player.connectCoach.action"),
      done: f.hasCoach,
    },
    {
      id: "add-tournament",
      label: t("firstRun.player.addTournament.label"),
      description: t("firstRun.player.addTournament.description"),
      to: "/tournaments",
      actionLabel: t("firstRun.player.addTournament.action"),
      done: f.tournamentCount > 0,
    },
  ];
}

export interface CoachFacts {
  playerCount: number;
  planCount: number;
  teamCount: number;
}

export function coachItems(t: Translate, f: CoachFacts): GetStartedItem[] {
  return [
    {
      id: "add-player",
      label: t("firstRun.coach.addPlayer.label"),
      description: t("firstRun.coach.addPlayer.description"),
      to: "/connections",
      actionLabel: t("firstRun.coach.addPlayer.action"),
      done: f.playerCount > 0,
    },
    {
      id: "plan-session",
      label: t("firstRun.coach.planSession.label"),
      description: t("firstRun.coach.planSession.description"),
      to: "/session-builder",
      actionLabel: t("firstRun.coach.planSession.action"),
      done: f.planCount > 0,
    },
    {
      id: "create-team",
      label: t("firstRun.coach.createTeam.label"),
      description: t("firstRun.coach.createTeam.description"),
      to: "/teams",
      actionLabel: t("firstRun.coach.createTeam.action"),
      done: f.teamCount > 0,
    },
  ];
}

export interface ObserverFacts {
  linkedPlayerCount: number;
  eventCount: number;
}

export function observerItems(t: Translate, f: ObserverFacts): GetStartedItem[] {
  return [
    {
      id: "link-child",
      label: t("firstRun.observer.linkChild.label"),
      description: t("firstRun.observer.linkChild.description"),
      to: "/connections",
      actionLabel: t("firstRun.observer.linkChild.action"),
      done: f.linkedPlayerCount > 0,
    },
    {
      id: "review-consent",
      label: t("firstRun.observer.reviewConsent.label"),
      description: t("firstRun.observer.reviewConsent.description"),
      to: "/privacy",
      actionLabel: t("firstRun.observer.reviewConsent.action"),
      done: false,
      manual: { reason: MANUAL_CONSENT_REASON },
    },
    {
      id: "see-week",
      label: t("firstRun.observer.seeWeek.label"),
      description: t("firstRun.observer.seeWeek.description"),
      to: "/calendar",
      actionLabel: t("firstRun.observer.seeWeek.action"),
      done: f.eventCount > 0,
    },
  ];
}

export interface AdminFacts {
  profileComplete: boolean;
}

/**
 * One item, on purpose. "Create an academy" and "assign coaches" have no UI
 * and no client-readable data yet (the admin's /connections is scoped to their
 * own rows), and a checklist step that can never be completed — or that links
 * nowhere — is worse than no step.
 */
export function adminItems(t: Translate, f: AdminFacts): GetStartedItem[] {
  return [
    {
      id: "set-up-academy",
      label: t("firstRun.admin.setUpAcademy.label"),
      description: t("firstRun.admin.setUpAcademy.description"),
      to: "/profile",
      actionLabel: t("firstRun.admin.setUpAcademy.action"),
      done: f.profileComplete,
    },
  ];
}
