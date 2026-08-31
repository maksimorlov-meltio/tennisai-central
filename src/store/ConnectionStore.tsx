import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from "react";
import { useAuth } from "@/auth/AuthContext";
import { mockConnectionRequests } from "@/mock/data";
import type { ConnectionRequest, RelationshipStatus, ConnectedPlayer, UserRole } from "@/types";
import { DIRECTORY, type DirectoryEntry } from "@/mock/directory";
import { connectionsApi, isMockMode } from "@/api/endpoints/connections";

// ─── Types ───

export type SendResult =
  | { ok: true; request: ConnectionRequest; reason?: undefined }
  | { ok: false; reason: string };

export type ApprovalResult =
  | { ok: true; reason?: undefined }
  | { ok: false; reason: string };

interface ConnectionStore {
  requests: ConnectionRequest[];
  /** Players with active (approved) relationship to the current user */
  connectedPlayers: ConnectedPlayer[];
  /** All active relationships (including non-player connections) */
  activeRelationships: ConnectionRequest[];
  /**
   * Send a new connection request. Rejects duplicates: an existing
   * pending request OR an already-active relationship between the
   * same two users (regardless of direction) blocks creation.
   */
  sendRequest: (entry: DirectoryEntry) => SendResult;
  /**
   * Transition a pending request. Only `pending → active` or
   * `pending → rejected` are valid. Other transitions are no-ops
   * and return `{ ok: false }`.
   */
  updateStatus: (id: string, status: RelationshipStatus) => ApprovalResult;
  /** Revoke an active relationship */
  revokeRelationship: (id: string) => ApprovalResult;
}

const ConnectionContext = createContext<ConnectionStore | null>(null);

/**
 * The players on the other end of this user's active connections.
 *
 * `playerPublicId` is whatever the server sent and nothing else. It used to be
 * assembled from the digits in the counterpart's cuid — a plausible-looking
 * TAI-P-… that belonged to no account — and that string was then shown on the
 * Players page, both dashboards, Teams and Trainings. A coach reading it out so
 * somebody could connect with that player was handing over an id that fails.
 * Empty is honest; invented is not.
 */
export function deriveConnectedPlayers(
  requests: ConnectionRequest[],
  userId: string,
): ConnectedPlayer[] {
  return requests
    .filter((r) => r.status === "active")
    .map((r) => {
      const isFrom = r.fromUserId === userId;
      const otherRole = isFrom ? r.toUserRole : r.fromUserRole;
      if (otherRole !== "player") return null;
      const otherName = isFrom ? r.toUserName : r.fromUserName;
      const [firstName, ...rest] = otherName.split(" ");
      return {
        id: isFrom ? r.toUserId : r.fromUserId,
        playerPublicId: (isFrom ? r.toUserPublicId : r.fromUserPublicId) ?? "",
        firstName,
        lastName: rest.join(" ") || "",
        connectedSince: r.updatedAt,
      } as ConnectedPlayer;
    })
    .filter((p): p is ConnectedPlayer => p !== null)
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
}

// ─── Seed data ───
// Every player ↔ every coach is pre-connected and fully active so that
// whichever demo account logs in (player or coach) sees the full set of
// counterpart relationships already approved on both sides.

function buildSeedRequests(): ConnectionRequest[] {
  const coaches = DIRECTORY.filter((u) => u.role === "coach");
  const players = DIRECTORY.filter((u) => u.role === "player");
  const seedDate = "2025-01-15T00:00:00Z";
  const out: ConnectionRequest[] = [];
  for (const coach of coaches) {
    for (const player of players) {
      out.push({
        id: `seed-cr-${coach.id}-${player.id}`,
        fromUserId: coach.id,
        fromUserName: `${coach.firstName} ${coach.lastName}`,
        fromUserRole: "coach" as UserRole,
        fromUserPublicId: coach.publicId,
        toUserId: player.id,
        toUserName: `${player.firstName} ${player.lastName}`,
        toUserRole: "player" as UserRole,
        toUserPublicId: player.publicId,
        status: "active" as RelationshipStatus,
        createdAt: seedDate,
        updatedAt: seedDate,
      });
    }
  }
  return out;
}

// ─── Provider ───

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  // Mock mode seeds an in-memory graph; real mode loads from the API.
  const [requests, setRequests] = useState<ConnectionRequest[]>(() =>
    isMockMode() ? [...buildSeedRequests(), ...mockConnectionRequests] : [],
  );

  // Real mode: the server is authoritative. Load on mount and after every
  // mutation to reconcile ids/status. No-op in mock mode (tests unaffected).
  const refetch = useCallback(() => {
    if (isMockMode()) return;
    connectionsApi
      .list()
      .then((res) => setRequests(res.data ?? []))
      .catch(() => {
        /* leave current state; a later action will retry */
      });
  }, []);

  useEffect(() => {
    if (isMockMode() || !user) return;
    refetch();
  }, [user, refetch]);

  const sendRequest = useCallback(
    (entry: DirectoryEntry): SendResult => {
      if (!user) return { ok: false, reason: "You must be signed in." };
      if (entry.id === userId) {
        return { ok: false, reason: "You cannot connect with yourself." };
      }
      // Duplicate guard — any active or pending request between the
      // same two users (either direction) blocks a new one.
      const between = (a: string, b: string) => (r: ConnectionRequest) =>
        (r.fromUserId === a && r.toUserId === b) ||
        (r.fromUserId === b && r.toUserId === a);
      const existing = requests.find(between(userId, entry.id));
      if (existing?.status === "active") {
        return { ok: false, reason: "You're already connected with this user." };
      }
      if (existing?.status === "pending") {
        return { ok: false, reason: "A pending request already exists between you." };
      }
      const now = new Date().toISOString();
      const newReq: ConnectionRequest = {
        id: `cr-${Date.now()}`,
        fromUserId: userId,
        fromUserName: `${user.firstName} ${user.lastName}`,
        fromUserRole: user.role,
        // Carried on the optimistic row so the id shown before the refetch
        // lands is the same real one the server will send back.
        fromUserPublicId: user.publicId,
        toUserId: entry.id,
        toUserName: `${entry.firstName} ${entry.lastName}`,
        toUserRole: entry.role,
        toUserPublicId: entry.publicId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      setRequests((prev) => [newReq, ...prev]);
      // Fire-and-forget: notify backend. In mock mode this resolves to a
      // synthetic success; in real mode the request is observable in tests.
      void connectionsApi
        .send({ toUserId: entry.id, toPublicId: entry.publicId })
        .then(() => refetch())
        .catch(() => {
          /* Local state remains authoritative for the mock build. */
        });
      return { ok: true, request: newReq };
    },
    [user, userId, requests, refetch]
  );

  const updateStatus = useCallback(
    (id: string, status: RelationshipStatus): ApprovalResult => {
      const target = requests.find((r) => r.id === id);
      if (!target) return { ok: false, reason: "Request not found." };
      // Only the recipient may approve/reject.
      if (target.toUserId !== userId) {
        return { ok: false, reason: "Only the recipient can act on this request." };
      }
      if (target.status !== "pending") {
        return { ok: false, reason: `Request is already ${target.status}.` };
      }
      if (status !== "active" && status !== "rejected") {
        return { ok: false, reason: "Invalid status transition." };
      }
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r
        )
      );
      void connectionsApi
        .updateStatus(id, { status: status as "active" | "rejected" })
        .then(() => refetch())
        .catch(() => {
          /* ignore — local state is authoritative in mock mode */
        });
      return { ok: true };
    },
    [requests, userId, refetch]
  );

  const revokeRelationship = useCallback(
    (id: string): ApprovalResult => {
      const target = requests.find((r) => r.id === id);
      if (!target) return { ok: false, reason: "Relationship not found." };
      if (target.status !== "active") {
        return { ok: false, reason: "Only active relationships can be revoked." };
      }
      if (target.fromUserId !== userId && target.toUserId !== userId) {
        return { ok: false, reason: "You are not part of this relationship." };
      }
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: "revoked" as RelationshipStatus, updatedAt: new Date().toISOString() }
            : r
        )
      );
      void connectionsApi
        .revoke(id)
        .then(() => refetch())
        .catch(() => {
          /* ignore — local state is authoritative in mock mode */
        });
      return { ok: true };
    },
    [requests, userId, refetch]
  );

  // Active relationships involving current user
  const activeRelationships = useMemo(
    () => requests.filter((r) => r.status === "active" && (r.fromUserId === userId || r.toUserId === userId)),
    [requests, userId]
  );

  const connectedPlayers = useMemo<ConnectedPlayer[]>(
    () => deriveConnectedPlayers(requests, userId),
    [requests, userId],
  );

  const value = useMemo<ConnectionStore>(
    () => ({ requests, connectedPlayers, activeRelationships, sendRequest, updateStatus, revokeRelationship }),
    [requests, connectedPlayers, activeRelationships, sendRequest, updateStatus, revokeRelationship]
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnections() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnections must be used within ConnectionProvider");
  return ctx;
}
