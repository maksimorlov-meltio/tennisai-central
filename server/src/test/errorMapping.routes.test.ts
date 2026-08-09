// ============================================================================
// HTTP route tests — data-layer failures must map to sane status codes
//
// With a mocked database we cannot trigger a REAL unique-constraint violation,
// but we CAN reject with the real `Prisma.PrismaClientKnownRequestError` class
// that a real database would produce, and then assert what the route + the
// shared `errorHandler` turn it into. That is an honest test of the wiring
// (asyncHandler → next(err) → errorHandler), not of the mock.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { env } from "../env";
import { calendarRouter } from "../calendar/routes";
import { bearer, createTestApp, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/calendar", calendarRouter]]);

const USER = "user-1";
const EVENT = "ev-1";

const validBody = {
  title: "Morning session",
  type: "training",
  startDate: "2026-06-01T09:00:00.000Z",
  endDate: "2026-06-01T10:00:00.000Z",
};

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("db said no", {
    code,
    clientVersion: "5.22.0",
  });
}

/** Silence (and observe) the errorHandler's server-side log for the 500 cases. */
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorLog.mockRestore();
});

describe("known Prisma errors are mapped, not leaked", () => {
  it("maps a unique-constraint violation (P2002) to 409", async () => {
    db.calendarEvent.create.mockRejectedValue(prismaError("P2002"));

    const res = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(USER))
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("That record already exists");
  });

  it("maps a missing-record error (P2025) to 404", async () => {
    db.calendarEvent.findUnique.mockResolvedValue({ createdBy: USER, playerId: null });
    db.calendarEvent.delete.mockRejectedValue(prismaError("P2025"));

    const res = await request(app)
      .delete(`/api/calendar/events/${EVENT}`)
      .set("Authorization", bearer(USER));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Not found");
  });
});

describe("unexpected data-layer failures", () => {
  it("becomes a 500 with a JSON body — the request never hangs and never 200s", async () => {
    db.calendarEvent.create.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const res = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(USER))
      .send(validBody);

    expect(res.status).toBe(500);
    expect(typeof res.body.message).toBe("string");
    // Internals are only ever echoed in explicit local development.
    if (env.nodeEnv !== "development") {
      expect(res.body.message).toBe("Internal server error");
      expect(res.body.message).not.toContain("ECONNREFUSED");
    }
    // The real cause is logged server-side rather than swallowed.
    expect(errorLog).toHaveBeenCalled();
  });

  it("a rejected read on the list route also surfaces as 500, not a crash", async () => {
    db.calendarEvent.findMany.mockRejectedValue(new Error("pool timeout"));

    const res = await request(app).get("/api/calendar/events").set("Authorization", bearer(USER));

    expect(res.status).toBe(500);
    expect(typeof res.body.message).toBe("string");
  });
});
