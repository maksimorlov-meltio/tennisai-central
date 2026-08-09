// ============================================================
// Resolving the people on a plan.
//
// The API returns `playerId` / `createdById` only — no names. Names are looked
// up in the connection store (active relationships already carry both parties'
// display names), and when a name genuinely cannot be resolved the UI says so
// rather than inventing one.
// ============================================================

import { useMemo } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";

export interface ResolvedPerson {
  /** What to render. */
  label: string;
  /** True when this id is the signed-in user. */
  isYou: boolean;
  /** False when no name could be resolved — the label is a placeholder. */
  resolved: boolean;
}

export interface PlanPeople {
  userId: string | undefined;
  nameFor: (id: string) => ResolvedPerson;
}

export function usePlanPeople(): PlanPeople {
  const { user } = useAuth();
  const { activeRelationships } = useConnections();

  const byId = useMemo(() => {
    const map = new Map<string, string>();
    for (const rel of activeRelationships) {
      if (rel.fromUserName) map.set(rel.fromUserId, rel.fromUserName);
      if (rel.toUserName) map.set(rel.toUserId, rel.toUserName);
    }
    return map;
  }, [activeRelationships]);

  const userId = user?.id;

  const nameFor = (id: string): ResolvedPerson => {
    if (userId && id === userId) return { label: "You", isYou: true, resolved: true };
    const name = byId.get(id);
    if (name) return { label: name, isYou: false, resolved: true };
    return { label: "Name unavailable", isYou: false, resolved: false };
  };

  return { userId, nameFor };
}
