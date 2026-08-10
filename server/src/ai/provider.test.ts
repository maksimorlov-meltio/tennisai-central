import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// env is stubbed rather than read from process.env so these tests can flip the
// feature on and off without a real key ever existing anywhere.
const fakeEnv = { aiProvider: undefined as string | undefined, aiApiKey: undefined as string | undefined, aiModel: undefined as string | undefined };
vi.mock("../env", () => ({ env: fakeEnv }));

const { aiConfig, isAiConfigured, completeText, AiProviderError } = await import("./provider");

/** Captures the outgoing request instead of performing it. */
function stubFetch(response: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(typeof response === "string" ? response : JSON.stringify(response)),
    } as Response);
  });
  return calls;
}

beforeEach(() => {
  fakeEnv.aiProvider = undefined;
  fakeEnv.aiApiKey = undefined;
  fakeEnv.aiModel = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("aiConfig", () => {
  it("is off when nothing is configured", () => {
    expect(aiConfig()).toBeNull();
    expect(isAiConfigured()).toBe(false);
  });

  it("treats a half-configured server as OFF, not as broken", () => {
    fakeEnv.aiProvider = "anthropic";
    expect(aiConfig()).toBeNull(); // key missing
    fakeEnv.aiProvider = undefined;
    fakeEnv.aiApiKey = "sk-test";
    expect(aiConfig()).toBeNull(); // provider missing
  });

  it("falls back to a pinned default model", () => {
    fakeEnv.aiProvider = "anthropic";
    fakeEnv.aiApiKey = "sk-test";
    expect(aiConfig()?.model).toBe("claude-sonnet-5");
    fakeEnv.aiModel = "claude-opus-5";
    expect(aiConfig()?.model).toBe("claude-opus-5");
  });
});

describe("completeText", () => {
  it("refuses to call out when no provider is configured", async () => {
    await expect(completeText({ system: "s", user: "u" })).rejects.toThrow(AiProviderError);
  });

  it("builds an Anthropic request and reads its envelope", async () => {
    fakeEnv.aiProvider = "anthropic";
    fakeEnv.aiApiKey = "sk-secret";
    const calls = stubFetch({ content: [{ type: "text", text: '{"ok":true}' }] });

    const out = await completeText({ system: "sys", user: "usr" });

    expect(out.text).toBe('{"ok":true}');
    expect(out.provider).toBe("anthropic");
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "usr" }]);
  });

  it("builds an OpenAI request and reads its envelope", async () => {
    fakeEnv.aiProvider = "openai";
    fakeEnv.aiApiKey = "sk-secret";
    const calls = stubFetch({ choices: [{ message: { content: '{"ok":true}' } }] });

    const out = await completeText({ system: "sys", user: "usr" });

    expect(out.text).toBe('{"ok":true}');
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer sk-secret");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
  });

  it("marks 429 and 5xx as retryable, and a 400 as not", async () => {
    fakeEnv.aiProvider = "anthropic";
    fakeEnv.aiApiKey = "sk-test";

    stubFetch("rate limited", 429);
    await expect(completeText({ system: "s", user: "u" })).rejects.toMatchObject({ retryable: true });

    vi.unstubAllGlobals();
    stubFetch("bad request", 400);
    await expect(completeText({ system: "s", user: "u" })).rejects.toMatchObject({ retryable: false });
  });

  it("treats an empty completion as a failure rather than valid output", async () => {
    fakeEnv.aiProvider = "anthropic";
    fakeEnv.aiApiKey = "sk-test";
    stubFetch({ content: [] });
    await expect(completeText({ system: "s", user: "u" })).rejects.toThrow(/empty/i);
  });
});
