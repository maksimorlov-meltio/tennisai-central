// ============================================================================
// The public id a coach sees for a connected player.
//
// This used to be built from the digits in the player's cuid
// (`TAI-P-${otherId.replace(/\D/g, "").padStart(3, "0")}`), producing an id
// that looked right and belonged to nobody. It was shown on the Players page,
// the coach and observer dashboards, Teams and Trainings — so a coach reading
// it out so someone could connect with that player handed over an id that
// cannot be found.
//
// The server now sends the real one on every connection, and nothing here is
// allowed to invent a replacement.
// ============================================================================

import { describe, it, expect } from "vitest";
import { deriveConnectedPlayers } from "../ConnectionStore";
import type { ConnectionRequest } from "@/types";

const COACH = "cmthfv5nt0000y5xwi5ctar56";
const PLAYER = "cmthfv6kx0001y5xw9rxjelsb";

function conn(overrides: Partial<ConnectionRequest> = {}): ConnectionRequest {
  return {
    id: "cr-1",
    fromUserId: COACH,
    fromUserName: "Aleksandr Kalinin",
    fromUserRole: "coach",
    fromUserPublicId: "TAI-C-1ETTXB",
    toUserId: PLAYER,
    toUserName: "Anna Sokolova",
    toUserRole: "player",
    toUserPublicId: "TAI-P-HXDRRB",
    status: "active",
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:05:00.000Z",
    ...overrides,
  };
}

describe("deriveConnectedPlayers", () => {
  it("shows the server's public id, not one derived from the cuid", () => {
    const [player] = deriveConnectedPlayers([conn()], COACH);

    expect(player.playerPublicId).toBe("TAI-P-HXDRRB");
    // The old bug produced this from the digits in the cuid. Naming it keeps
    // the regression obvious if the derivation ever creeps back.
    expect(player.playerPublicId).not.toBe("TAI-P-6000159");
    expect(player.id).toBe(PLAYER);
  });

  it("reads the right side when the PLAYER sent the request", () => {
    const [player] = deriveConnectedPlayers(
      [conn({ fromUserId: PLAYER, fromUserName: "Anna Sokolova", fromUserRole: "player",
              fromUserPublicId: "TAI-P-HXDRRB", toUserId: COACH, toUserName: "Aleksandr Kalinin",
              toUserRole: "coach", toUserPublicId: "TAI-C-1ETTXB" })],
      COACH,
    );

    expect(player.playerPublicId).toBe("TAI-P-HXDRRB");
    expect(player.firstName).toBe("Anna");
  });

  it("leaves the id empty rather than inventing one when the server sent none", () => {
    const [player] = deriveConnectedPlayers([conn({ toUserPublicId: undefined })], COACH);

    expect(player.playerPublicId).toBe("");
  });

  it("only counts active connections", () => {
    expect(deriveConnectedPlayers([conn({ status: "pending" })], COACH)).toHaveLength(0);
    expect(deriveConnectedPlayers([conn({ status: "rejected" })], COACH)).toHaveLength(0);
  });

  it("ignores connections whose other side is not a player", () => {
    const coachToCoach = conn({ toUserRole: "coach", toUserName: "Other Coach" });
    expect(deriveConnectedPlayers([coachToCoach], COACH)).toHaveLength(0);
  });

  it("lists each player once, even with several connections to them", () => {
    const players = deriveConnectedPlayers([conn(), conn({ id: "cr-2" })], COACH);
    expect(players).toHaveLength(1);
  });

  it("splits the name into first and last", () => {
    const [player] = deriveConnectedPlayers([conn()], COACH);
    expect(player.firstName).toBe("Anna");
    expect(player.lastName).toBe("Sokolova");
  });
});
