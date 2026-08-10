// The switch that decides whether connections talk to the real backend.
//
// This is the one module that used to carry a hardcoded mock default, so the
// rule is pinned here rather than left to inspection: a deployed build (an API
// base configured, no override) MUST hit the network. A regression here is
// invisible in the UI — the app looks like it works and silently keeps every
// connection in browser memory.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { connectionsApi, isMockMode } from "@/api/endpoints/connections";

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isMockMode", () => {
  it("is REAL when an API base is configured and nothing overrides it", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api");
    vi.stubEnv("VITE_USE_MOCK_CONNECTIONS", "");
    expect(isMockMode()).toBe(false);
  });

  it("is mock when no API base is configured (local dev)", () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_USE_MOCK_CONNECTIONS", "");
    expect(isMockMode()).toBe(true);
  });

  it("can be forced to mock even with an API base — for local dev and tests", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api");
    vi.stubEnv("VITE_USE_MOCK_CONNECTIONS", "true");
    expect(isMockMode()).toBe(true);
  });

  it("can be forced to real even with no API base", () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_USE_MOCK_CONNECTIONS", "false");
    expect(isMockMode()).toBe(false);
  });

  it("ignores a value that is neither 'true' nor 'false'", () => {
    // A typo in a deploy dashboard must not silently mock production.
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api");
    vi.stubEnv("VITE_USE_MOCK_CONNECTIONS", "yes");
    expect(isMockMode()).toBe(false);
  });
});

describe("connectionsApi in production configuration", () => {
  /** Every method, so none can be left short-circuiting on its own. */
  it("sends a real request for list, send, updateStatus and revoke", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api");
    vi.stubEnv("VITE_USE_MOCK_CONNECTIONS", "");

    // Args are declared so `mock.calls` is typed — an argless `vi.fn` infers
    // an empty tuple and indexing it fails to compile.
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await connectionsApi.list();
    await connectionsApi.send({ toUserId: "u1", toPublicId: "TAI-P-001" });
    await connectionsApi.updateStatus("c1", { status: "active" });
    await connectionsApi.revoke("c1");

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    const methods = fetchSpy.mock.calls.map((c) => (c[1] as RequestInit).method);
    expect(methods).toEqual(["GET", "POST", "PATCH", "DELETE"]);

    // Only the path after the base is asserted. `apiClient` reads
    // VITE_API_BASE_URL once at module load, so stubbing it here cannot change
    // the prefix — which is exactly why that variable has to be set at BUILD
    // time, not flipped on a already-built deployment.
    const paths = fetchSpy.mock.calls.map((c) => String(c[0]).replace(/^.*?(?=\/connections)/, ""));
    // These must line up with server/src/connections/routes.ts.
    expect(paths).toEqual(["/connections", "/connections", "/connections/c1", "/connections/c1"]);
  });

  it("makes NO request when mock mode is forced on", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api");
    vi.stubEnv("VITE_USE_MOCK_CONNECTIONS", "true");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await connectionsApi.list();
    await connectionsApi.revoke("c1");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
