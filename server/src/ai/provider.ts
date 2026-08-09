// ============================================================
// TennisAI — LLM provider seam
//
// One narrow transport: text in, text out. Everything above this file
// (prompt building, output validation, quotas, audit) is provider-agnostic,
// so swapping vendors is a config change, not a rewrite.
//
// The API key lives ONLY here, server-side. It is never returned by any
// endpoint and never reaches the browser.
// ============================================================

import { env } from "../env";

export type AiProviderName = "anthropic" | "openai";

/**
 * Used when AI_MODEL is not set. Pinned rather than "latest" aliases so a
 * silent vendor-side model swap can't change advice quality overnight.
 */
const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o-mini",
};

/** A provider call failed. `retryable` distinguishes 429/5xx from a bad request. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiConfig {
  provider: AiProviderName;
  model: string;
  apiKey: string;
}

/**
 * The active configuration, or null when the feature is switched off.
 *
 * Both AI_PROVIDER and AI_API_KEY must be present. A half-configured server
 * counts as OFF: callers get an explicit "not configured" response instead of
 * a runtime failure at the moment a coach asks for advice.
 */
export function aiConfig(): AiConfig | null {
  if (!env.aiProvider || !env.aiApiKey) return null;
  return {
    provider: env.aiProvider,
    model: env.aiModel || DEFAULT_MODELS[env.aiProvider],
    apiKey: env.aiApiKey,
  };
}

export function isAiConfigured(): boolean {
  return aiConfig() !== null;
}

export interface CompletionResult {
  text: string;
  model: string;
  provider: AiProviderName;
  latencyMs: number;
}

/** How long we wait on the provider before giving up. */
const TIMEOUT_MS = 45_000;

/**
 * Sends one prompt and returns the raw text response.
 *
 * Deliberately does NOT parse or validate — the caller owns the output
 * contract, because "what a valid answer looks like" is a property of the
 * feature, not of the transport.
 */
export async function completeText(args: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<CompletionResult> {
  const cfg = aiConfig();
  if (!cfg) throw new AiProviderError("No AI provider is configured on this server.");

  const startedAt = Date.now();
  const maxTokens = args.maxTokens ?? 2000;

  let res: Response;
  try {
    res =
      cfg.provider === "anthropic"
        ? await callAnthropic(cfg, args.system, args.user, maxTokens)
        : await callOpenAi(cfg, args.system, args.user, maxTokens);
  } catch (err) {
    // Network failure, DNS, or the abort timeout above — all worth retrying.
    const reason = err instanceof Error ? err.message : String(err);
    throw new AiProviderError(`Could not reach the ${cfg.provider} API: ${reason}`, true);
  }

  if (!res.ok) {
    // The body can contain the key back in an echoed request on some gateways,
    // so only the status and a short, truncated reason are surfaced upward.
    const body = await res.text().catch(() => "");
    throw new AiProviderError(
      `${cfg.provider} API returned ${res.status}: ${body.slice(0, 200)}`,
      res.status === 429 || res.status >= 500,
    );
  }

  const json = (await res.json()) as unknown;
  const text = extractText(cfg.provider, json);
  if (!text) throw new AiProviderError(`${cfg.provider} returned an empty response.`, true);

  return { text, model: cfg.model, provider: cfg.provider, latencyMs: Date.now() - startedAt };
}

function callAnthropic(cfg: AiConfig, system: string, user: string, maxTokens: number) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function callOpenAi(cfg: AiConfig, system: string, user: string, maxTokens: number) {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_completion_tokens: maxTokens,
      // Asks the API itself to guarantee syntactically valid JSON. The shape is
      // still validated by us — this only removes the "it wrapped it in prose"
      // failure mode.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Pulls the assistant text out of each vendor's response envelope. */
function extractText(provider: AiProviderName, json: unknown): string {
  const root = json as Record<string, unknown>;
  if (provider === "anthropic") {
    const blocks = root.content as Array<{ type?: string; text?: string }> | undefined;
    return (blocks ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();
  }
  const choices = root.choices as Array<{ message?: { content?: string } }> | undefined;
  return (choices?.[0]?.message?.content ?? "").trim();
}
