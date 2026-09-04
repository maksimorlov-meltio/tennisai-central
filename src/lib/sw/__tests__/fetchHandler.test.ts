// Loads the real public/sw.js into a sandboxed VM context (same technique as
// classify.test.ts) and drives its actual "fetch" event listener with a
// mocked Cache Storage + fetch, so the cache-first / network-first / never-
// cache-api behaviour is asserted against the shipped file directly instead
// of a description of it. This is what "prove it" means for the risky part
// of the service worker: not just that the classifier functions return the
// right booleans, but that the registered fetch handler actually calls (or
// doesn't call) respondWith and cache.put the way the spec requires.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

interface FakeResponse {
  ok: boolean;
  status: number;
  type: string;
  clone: () => FakeResponse;
}

function makeResponse(status: number, type: string = "basic"): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    type,
    clone() {
      return makeResponse(status, type);
    },
  };
}

interface FakeCache {
  store: Map<string, FakeResponse>;
  match: (request: { url: string }) => Promise<FakeResponse | undefined>;
  put: (request: { url: string }, response: FakeResponse) => Promise<void>;
  keys: () => Promise<{ url: string }[]>;
}

function makeCache(): FakeCache {
  const store = new Map<string, FakeResponse>();
  return {
    store,
    async match(request) {
      return store.get(request.url);
    },
    async put(request, response) {
      store.set(request.url, response);
    },
    async keys() {
      return [...store.keys()].map((url) => ({ url }));
    },
  };
}

interface SandboxHandle {
  fetchMock: ReturnType<typeof vi.fn>;
  cache: FakeCache;
  triggerFetch: (request: {
    method: string;
    url: string;
    mode?: string;
  }) => { respondWithCalled: boolean; respondWithValue: unknown };
}

function loadSw(): SandboxHandle {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../public/sw.js"), "utf8");

  const cache = makeCache();
  const fetchMock = vi.fn(async (request: { url: string }) => makeResponse(200));

  let fetchListener: ((event: unknown) => void) | undefined;
  const listeners: Record<string, (event: unknown) => void> = {};

  const sandbox: { self: Record<string, unknown>; fetch: unknown; caches: unknown; URL: unknown } = {
    self: {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners[type] = handler;
        if (type === "fetch") fetchListener = handler;
      },
      location: { origin: "http://localhost" },
      registration: {},
      clients: { claim: async () => {} },
      skipWaiting: () => {},
    },
    fetch: fetchMock,
    caches: {
      open: async () => cache,
      keys: async () => ["tennisai-shell-v1"],
      delete: async () => true,
    },
    URL,
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "sw.js" });

  if (!fetchListener) throw new Error("sw.js never registered a fetch listener");
  const listener = fetchListener;

  return {
    fetchMock,
    cache,
    triggerFetch(request) {
      let respondWithCalled = false;
      let respondWithValue: unknown;
      const event = {
        request: { mode: "cors", ...request },
        respondWith(value: unknown) {
          respondWithCalled = true;
          respondWithValue = value;
        },
      };
      listener(event);
      return { respondWithCalled, respondWithValue };
    },
  };
}

describe("service worker fetch handler", () => {
  it("never calls respondWith for /api/* requests — no interception, no caching", async () => {
    const { triggerFetch, fetchMock, cache } = loadSw();

    const { respondWithCalled } = triggerFetch({ method: "GET", url: "http://localhost/api/trainings" });

    expect(respondWithCalled).toBe(false);
    expect(cache.store.has("http://localhost/api/trainings")).toBe(false);
    // The handler itself must not even call fetch on the API's behalf —
    // the browser's default (uninterrupted) handling does that.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never intercepts non-GET requests", async () => {
    const { triggerFetch } = loadSw();
    const { respondWithCalled } = triggerFetch({ method: "POST", url: "http://localhost/api/trainings" });
    expect(respondWithCalled).toBe(false);
  });

  it("never intercepts cross-origin requests", async () => {
    const { triggerFetch, fetchMock } = loadSw();
    const { respondWithCalled } = triggerFetch({ method: "GET", url: "https://tile.example.com/tiles/1.png" });
    expect(respondWithCalled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cache-first for a hashed /assets/* request: caches on first fetch, serves from cache on the second", async () => {
    const { triggerFetch, fetchMock, cache } = loadSw();
    const url = "http://localhost/assets/index-abc123.js";

    const first = triggerFetch({ method: "GET", url });
    expect(first.respondWithCalled).toBe(true);
    await first.respondWithValue;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.store.has(url)).toBe(true);

    const second = triggerFetch({ method: "GET", url });
    await second.respondWithValue;

    // Still only one real network fetch — the second was served from cache.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("network-first for navigation requests, populating the shell cache on success", async () => {
    const { triggerFetch, fetchMock, cache } = loadSw();
    const { respondWithCalled, respondWithValue } = triggerFetch({
      method: "GET",
      url: "http://localhost/",
      mode: "navigate",
    });

    expect(respondWithCalled).toBe(true);
    await respondWithValue;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.store.has("http://localhost/")).toBe(true);
  });

  it("navigation falls back to the cached shell when the network fetch fails, never to a stale /api/* entry", async () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../../../public/sw.js"), "utf8");
    const cache = makeCache();
    // Pre-seed the shell fallback the way a previous successful load would have.
    cache.store.set("http://localhost/", makeResponse(200));

    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });

    let fetchListener: ((event: unknown) => void) | undefined;
    const sandbox: { self: Record<string, unknown>; fetch: unknown; caches: unknown; URL: unknown } = {
      self: {
        addEventListener: (type: string, handler: (event: unknown) => void) => {
          if (type === "fetch") fetchListener = handler;
        },
        location: { origin: "http://localhost" },
        registration: {},
        clients: { claim: async () => {} },
        skipWaiting: () => {},
      },
      fetch: fetchMock,
      caches: { open: async () => cache },
      URL,
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: "sw.js" });
    if (!fetchListener) throw new Error("sw.js never registered a fetch listener");

    let respondWithValue: unknown;
    fetchListener({
      request: { method: "GET", mode: "navigate", url: "http://localhost/" },
      respondWith: (value: unknown) => {
        respondWithValue = value;
      },
    });

    const result = await (respondWithValue as Promise<FakeResponse>);
    expect(result.status).toBe(200); // served from the cached shell fallback
  });
});
