// Loads the real public/sw.js into a sandboxed VM context (not a hand
// maintained mirror) and asserts on its actual URL-classification
// functions, so this test fails the moment the shipped service worker's
// classification logic changes.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

interface SwClassify {
  isApiRequest: (url: URL) => boolean;
  isNavigation: (request: { mode?: string }) => boolean;
  isShellAsset: (url: URL) => boolean;
}

function loadSwClassify(): SwClassify {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../public/sw.js"), "utf8");

  const sandbox: { self: Record<string, unknown> } = {
    self: {
      addEventListener: () => {},
      location: { origin: "http://localhost" },
      registration: {},
      clients: { claim: async () => {} },
      skipWaiting: () => {},
    },
  };
  // sw.js references `caches` as a bare global (service worker scope) —
  // stub it as unused-but-present so `vm` doesn't throw a ReferenceError
  // while evaluating the module (the classifier functions never call it).
  (sandbox as unknown as { caches: unknown }).caches = {};

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "sw.js" });

  const classify = sandbox.self.__tennisaiSwClassify as SwClassify | undefined;
  if (!classify) throw new Error("sw.js did not expose self.__tennisaiSwClassify");
  return classify;
}

describe("service worker URL classification", () => {
  const { isApiRequest, isNavigation, isShellAsset } = loadSwClassify();

  describe("isApiRequest", () => {
    it("is true for /api/* paths", () => {
      expect(isApiRequest(new URL("http://localhost/api/trainings"))).toBe(true);
      expect(isApiRequest(new URL("http://localhost/api/"))).toBe(true);
    });

    it("is false for non-api paths", () => {
      expect(isApiRequest(new URL("http://localhost/assets/index-abc123.js"))).toBe(false);
      expect(isApiRequest(new URL("http://localhost/"))).toBe(false);
    });
  });

  describe("isNavigation", () => {
    it("is true only for navigate-mode requests", () => {
      expect(isNavigation({ mode: "navigate" })).toBe(true);
      expect(isNavigation({ mode: "cors" })).toBe(false);
      expect(isNavigation({ mode: "no-cors" })).toBe(false);
      expect(isNavigation({})).toBe(false);
    });
  });

  describe("isShellAsset", () => {
    it("is true for hashed /assets/* build output", () => {
      expect(isShellAsset(new URL("http://localhost/assets/index-abc123.js"))).toBe(true);
      expect(isShellAsset(new URL("http://localhost/assets/index-abc123.css"))).toBe(true);
    });

    it("is true for the known shell static paths", () => {
      expect(isShellAsset(new URL("http://localhost/manifest.webmanifest"))).toBe(true);
      expect(isShellAsset(new URL("http://localhost/icon-192.png"))).toBe(true);
      expect(isShellAsset(new URL("http://localhost/"))).toBe(true);
    });

    it("is false for API and other non-shell paths", () => {
      expect(isShellAsset(new URL("http://localhost/api/trainings"))).toBe(false);
      expect(isShellAsset(new URL("http://localhost/some-random-page"))).toBe(false);
    });
  });

  it("never classifies an /api/* URL as a shell asset or navigation target", () => {
    const apiUrl = new URL("http://localhost/api/trainings/123");
    expect(isApiRequest(apiUrl)).toBe(true);
    expect(isShellAsset(apiUrl)).toBe(false);
  });
});
