import type { ConnectionRequest } from "@/types";

/**
 * Does this user have an ACTIVE relationship whose other side is a coach?
 *
 * "Any active link" is not enough: a player linked only to a parent still has
 * nobody to plan sessions with. Shared by the first-run checklist and by the
 * empty states that offer "connect a coach" as the next step.
 */
export function hasCoachCounterpart(relationships: ConnectionRequest[], userId: string): boolean {
  return relationships.some((r) => {
    if (r.status !== "active") return false;
    const otherRole = r.fromUserId === userId ? r.toUserRole : r.fromUserRole;
    return otherRole === "coach";
  });
}
