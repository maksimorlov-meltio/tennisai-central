import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env, emailEnabled } from "./env";
import { prisma } from "./db";
import { authRouter } from "./auth/routes";
import { trainingsRouter } from "./trainings/routes";
import {
  tournamentsRouter,
  playerTournamentsRouter,
  hiddenTournamentsRouter,
} from "./tournaments/routes";
import { teamsRouter } from "./teams/routes";
import { connectionsRouter } from "./connections/routes";
import { usersRouter } from "./users/routes";
import { trainingRequestsRouter } from "./trainingRequests/routes";
import { calendarRouter } from "./calendar/routes";
import { financeRouter } from "./finance/routes";
import { equipmentRouter } from "./equipment/routes";
import { notificationsRouter } from "./notifications/routes";
import { profileRouter } from "./profile/routes";
import { trainingPlansRouter } from "./trainingPlans/routes";
import { matchesRouter } from "./matches/routes";
import { opponentsRouter } from "./opponents/routes";
import { aiRouter } from "./ai/routes";
import { errorHandler } from "./http";

const app = express();

// Behind a PaaS load balancer (Render/Railway/Fly) — trust the proxy so
// rate-limiting and secure cookies see the real client IP / protocol.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.appUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.isProd ? "combined" : "dev"));

// Throttle auth endpoints — brute-force / credential-stuffing defence.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

// General API throttle — a coarse ceiling on all /api traffic per client to
// blunt scraping / abuse. The stricter authLimiter still applies to /api/auth
// (both counters increment on an auth request). Health checks are excluded
// because they are mounted before this limiter.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down and try again shortly." },
});

// Liveness + DB readiness.
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "up", emailEnabled, time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: "down", time: new Date().toISOString() });
  }
});

// Coarse per-client throttle across every API router (mounted before them).
app.use("/api", apiLimiter);

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/trainings", trainingsRouter);
app.use("/api/tournaments", tournamentsRouter);
app.use("/api/player-tournaments", playerTournamentsRouter);
app.use("/api/hidden-tournaments", hiddenTournamentsRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/users", usersRouter);
app.use("/api/training-requests", trainingRequestsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/training-plans", trainingPlansRouter);
app.use("/api/matches", matchesRouter);
app.use("/api/opponents", opponentsRouter);
app.use("/api/me", profileRouter);
app.use("/api", financeRouter);
app.use("/api", equipmentRouter);
app.use("/api", notificationsRouter);
app.use("/api/ai", aiRouter);

// Fallback JSON 404 so the frontend always gets a parseable error body.
app.use((_req, res) => res.status(404).json({ message: "Not found" }));

// Terminal error handler — must be registered last.
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`\n🎾  TennisAI API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  console.log(`    Database:       PostgreSQL`);
  console.log(`    Gmail sending:  ${emailEnabled ? "ENABLED ✅" : "disabled (console fallback)"}\n`);
});

// Graceful shutdown — drain in-flight requests and close the DB pool.
function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down…`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  // Failsafe: force-exit if close hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
