// ============================================================
// TennisAI — AI routes
//
//   GET  /api/ai/status            is the feature switched on?
//   POST /api/ai/training-advice   advise the next session(s)
//
// Coach-only. Every generation is recorded in `ai_generations` and counted
// against a monthly cap, so cost and behaviour are both auditable after the
// fact rather than invisible.
// ============================================================

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { requireRole, assertCanActOnPlayer } from "../authz";
import { aiConfig, completeText, AiProviderError } from "./provider";
import {
  buildEvidence,
  buildUserPrompt,
  evidenceHash,
  loadTrainingRows,
  parseAdvice,
  parseModelJson,
  restoreNames,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  THIN_EVIDENCE_BELOW,
} from "./trainingAdvice";
import {
  buildUserPrompt as buildMatchPrepPrompt,
  matchPrepSchema,
  PROMPT_VERSION as MATCH_PREP_PROMPT_VERSION,
  SYSTEM_PROMPT as MATCH_PREP_SYSTEM_PROMPT,
} from "./matchPrep";
import { loadConditions } from "../conditions/service";

export const aiRouter = Router();

aiRouter.use(requireAuth);

/** Generations per coach per calendar month. Deliberately conservative. */
const MONTHLY_LIMIT = 100;

const requestSchema = z
  .object({
    playerIds: z.array(z.string().min(1)).max(12).default([]),
    teamId: z.string().min(1).optional(),
  })
  .refine((v) => v.playerIds.length > 0 || v.teamId, {
    message: "Choose at least one player, or a team.",
  });

/**
 * Whether the server can generate advice at all.
 *
 * Returns only a boolean and the provider name — never the key, never the
 * model string, since neither is the browser's business.
 */
aiRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const cfg = aiConfig();
    ok(res, { configured: cfg !== null, provider: cfg?.provider ?? null });
  }),
);

aiRouter.post(
  "/training-advice",
  requireRole("coach", "admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const coachId = req.userId!;
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
    }

    // A team is just a convenient way to name a set of players.
    let playerIds = parsed.data.playerIds;
    if (parsed.data.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: parsed.data.teamId },
        include: { members: true },
      });
      if (!team || team.coachId !== coachId) throw new HttpError(404, "Team not found.");
      playerIds = Array.from(new Set([...playerIds, ...team.members.map((m) => m.playerId)]));
    }
    playerIds = Array.from(new Set(playerIds));
    if (playerIds.length === 0) throw new HttpError(400, "That team has no players yet.");
    if (playerIds.length > 12) throw new HttpError(400, "Advice covers at most 12 players at a time.");

    // The coach must actually be entitled to each of these players. Checked
    // BEFORE any data is read, so an unauthorised id can't influence the
    // evidence even by its absence.
    for (const id of playerIds) await assertCanActOnPlayer(coachId, id);

    const cfg = aiConfig();
    if (!cfg) {
      throw new HttpError(
        503,
        "Training advice is not enabled on this server. An administrator needs to configure an AI provider.",
      );
    }

    // Quota is per calendar month, keyed the same way as the counter table.
    const periodKey = new Date().toISOString().slice(0, 7);
    const counter = await prisma.aiUsageCounter.findUnique({
      where: { userId_periodKey: { userId: coachId, periodKey } },
    });
    if ((counter?.reportsGenerated ?? 0) >= MONTHLY_LIMIT) {
      throw new HttpError(
        429,
        `You have used all ${MONTHLY_LIMIT} advice generations for this month.`,
      );
    }

    const rows = await loadTrainingRows(prisma, coachId, playerIds);
    const evidence = buildEvidence(rows, playerIds.length);

    // Refuse rather than invent. With no completed sessions there is nothing to
    // reason FROM, and anything produced would be generic filler wearing the
    // costume of analysis.
    if (evidence.sessions.length === 0) {
      throw new HttpError(
        409,
        "No completed sessions yet for these players, so there is nothing to base advice on. Run and review a session first.",
      );
    }

    const inputHash = evidenceHash(evidence, PROMPT_VERSION);
    const started = Date.now();

    /** Records the attempt whatever the outcome — failures are the interesting ones. */
    const record = (status: string, latencyMs: number, errorMessage?: string) =>
      prisma.aiGeneration
        .create({
          data: {
            userId: coachId,
            reportType: "training_plan",
            provider: cfg.provider,
            model: cfg.model,
            promptVersion: PROMPT_VERSION,
            inputHash,
            status,
            errorMessage: errorMessage?.slice(0, 500),
            latencyMs,
          },
        })
        .catch(() => undefined); // auditing must never break the response

    let completion;
    try {
      completion = await completeText({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(evidence),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await record("provider_error", Date.now() - started, message);
      throw new HttpError(
        err instanceof AiProviderError && err.retryable ? 503 : 502,
        "The AI provider could not be reached. Nothing was generated — try again shortly.",
      );
    }

    let advice;
    try {
      advice = parseAdvice(completion.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await record("invalid_output", completion.latencyMs, message);
      // The raw text is deliberately NOT returned. Unvalidated model output must
      // never reach a coach dressed as advice.
      throw new HttpError(502, "The AI returned an answer we could not read. Nothing was saved.");
    }

    const players = await prisma.user.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, firstName: true },
    });
    // Same order as the labels handed to the model.
    const names = playerIds.map(
      (id, i) => players.find((p) => p.id === id)?.firstName ?? `Player ${i + 1}`,
    );

    await record("success", completion.latencyMs);
    await prisma.aiUsageCounter.upsert({
      where: { userId_periodKey: { userId: coachId, periodKey } },
      create: { userId: coachId, periodKey, reportsGenerated: 1 },
      update: { reportsGenerated: { increment: 1 } },
    });

    ok(res, {
      advice: restoreNames(advice, names),
      basedOn: {
        sessions: evidence.sessions.length,
        reviewed: evidence.reviewedCount,
        withPlayerFeedback: evidence.feedbackCount,
        thin: evidence.sessions.length < THIN_EVIDENCE_BELOW,
      },
      generatedAt: new Date().toISOString(),
      model: completion.model,
      provider: completion.provider,
    });
  }),
);

// ── Match preparation for a tournament ──────────────────────────────────────

const matchPrepRequestSchema = z.object({
  tournamentId: z.string().min(1),
  /** Defaults to the caller — a player preparing themselves is the common case. */
  playerId: z.string().min(1).optional(),
});

/**
 * Interprets the conditions at a tournament for one player.
 *
 * Open to any role, because a player preparing for their own event is exactly
 * who this is for; `assertCanActOnPlayer` (self always allowed) does the real
 * gating. The physics is computed, not generated — see conditions/physics.ts.
 */
aiRouter.post(
  "/match-prep",
  asyncHandler(async (req: AuthedRequest, res) => {
    const actorId = req.userId!;
    const parsed = matchPrepRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "A tournament is required.");

    const playerId = parsed.data.playerId ?? actorId;
    await assertCanActOnPlayer(actorId, playerId);

    const cfg = aiConfig();
    if (!cfg) {
      throw new HttpError(
        503,
        "AI analysis is not enabled on this server. An administrator needs to configure an AI provider.",
      );
    }

    const periodKey = new Date().toISOString().slice(0, 7);
    const counter = await prisma.aiUsageCounter.findUnique({
      where: { userId_periodKey: { userId: actorId, periodKey } },
    });
    if ((counter?.reportsGenerated ?? 0) >= MONTHLY_LIMIT) {
      throw new HttpError(429, `You have used all ${MONTHLY_LIMIT} AI generations for this month.`);
    }

    const conditions = await loadConditions(prisma, parsed.data.tournamentId);
    if (!conditions) throw new HttpError(404, "Tournament not found.");

    // Without conditions there is nothing to interpret. Refusing beats
    // producing generic advice that merely looks tournament-specific.
    if (!conditions.physics) {
      throw new HttpError(
        409,
        "No weather is available for this tournament yet, so there are no conditions to analyse.",
      );
    }

    // The player's recent state comes from the training feedback they and their
    // coach already record. Whoever ran those sessions, they are the player's.
    const recentTraining = await loadTrainingRows(prisma, actorId, [playerId]);

    const input = {
      tournament: conditions.tournament,
      altitudeM: conditions.altitudeM,
      weather: conditions.weather,
      physics: conditions.physics,
      physicsBasis: conditions.physicsBasis,
      recentTraining,
    };
    const userPrompt = buildMatchPrepPrompt(input);
    const inputHash = evidenceHash(
      buildEvidence(recentTraining, 1),
      `${MATCH_PREP_PROMPT_VERSION}:${parsed.data.tournamentId}:${conditions.weather?.kind ?? "none"}`,
    );
    const started = Date.now();

    const record = (status: string, latencyMs: number, errorMessage?: string) =>
      prisma.aiGeneration
        .create({
          data: {
            userId: actorId,
            reportType: "match_prep",
            reportId: parsed.data.tournamentId,
            provider: cfg.provider,
            model: cfg.model,
            promptVersion: MATCH_PREP_PROMPT_VERSION,
            inputHash,
            status,
            errorMessage: errorMessage?.slice(0, 500),
            latencyMs,
          },
        })
        .catch(() => undefined);

    let completion;
    try {
      completion = await completeText({ system: MATCH_PREP_SYSTEM_PROMPT, user: userPrompt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await record("provider_error", Date.now() - started, message);
      throw new HttpError(
        err instanceof AiProviderError && err.retryable ? 503 : 502,
        "The AI provider could not be reached. Nothing was generated — try again shortly.",
      );
    }

    let prep;
    try {
      prep = parseModelJson(completion.text, matchPrepSchema);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await record("invalid_output", completion.latencyMs, message);
      throw new HttpError(502, "The AI returned an answer we could not read. Nothing was saved.");
    }

    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: { firstName: true },
    });
    const swap = (s: string) => s.split("Player 1").join(player?.firstName ?? "the player");

    await record("success", completion.latencyMs);
    await prisma.aiUsageCounter.upsert({
      where: { userId_periodKey: { userId: actorId, periodKey } },
      create: { userId: actorId, periodKey, reportsGenerated: 1 },
      update: { reportsGenerated: { increment: 1 } },
    });

    ok(res, {
      prep: {
        conditionsSummary: swap(prep.conditionsSummary),
        ballBehaviour: swap(prep.ballBehaviour),
        tacticalAdjustments: prep.tacticalAdjustments.map(swap),
        preparation: prep.preparation.map(swap),
        equipmentNotes: prep.equipmentNotes.map(swap),
        cautions: prep.cautions.map(swap),
      },
      basedOn: {
        weatherKind: conditions.weather?.kind ?? null,
        sessions: recentTraining.length,
      },
      generatedAt: new Date().toISOString(),
      model: completion.model,
      provider: completion.provider,
    });
  }),
);
