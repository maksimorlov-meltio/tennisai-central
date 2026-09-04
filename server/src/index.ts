import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env, emailEnabled, mailTransport } from "./env";
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
import { catalogueRouter, adminCatalogueRouter } from "./catalogue/routes";
import { stringSetupsRouter } from "./stringSetups/routes";
import { notificationsRouter } from "./notifications/routes";
import { profileRouter } from "./profile/routes";
import { trainingPlansRouter } from "./trainingPlans/routes";
import { matchesRouter } from "./matches/routes";
import { opponentsRouter } from "./opponents/routes";
import { aiRouter } from "./ai/routes";
import { conditionsRouter } from "./conditions/routes";
import { feedRouter } from "./tournaments/feedRoutes";
import { startTournamentSchedule } from "./tournaments/schedule";
import { importStatus, lastImportAt } from "./tournaments/importStatus";
import { errorHandler } from "./http";
import { verifyMailTransport } from "./email/mailer";

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
    res.json({
      ok: true,
      db: "up",
      emailEnabled,
      // Which transport, and whether signup is currently possible at all —
      // the two facts you need to explain "nobody can register" without SSH.
      mailTransport,
      signupOpen: !(env.requireEmailVerification && !emailEnabled),
      // A calendar feed that has silently stopped looks exactly like one that
      // is working, until a coach plans a season against stale data. Reporting
      // it here makes a dead source visible without opening a shell.
      calendar: { lastImportAt: lastImportAt(), sources: importStatus() },
      time: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ ok: false, db: "down", time: new Date().toISOString() });
  }
});

// Coarse per-client throttle across every API router (mounted before them).
app.use("/api", apiLimiter);

// Machine-to-machine calendar ingest. Its own router because it authenticates
// with a shared token, NOT a user session (see tournaments/feedRoutes.ts) — and
// mounted HERE, before financeRouter/equipmentRouter/notificationsRouter, which
// are mounted at "/api" and whose `requireAuth` therefore runs for every /api/*
// path. Registered after them, this endpoint answered 401 before its own token
// check was ever reached.
app.use("/api/feed", feedRouter);

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
app.use("/api/catalogue", catalogueRouter);
app.use("/api/admin/catalogue", adminCatalogueRouter);
app.use("/api", financeRouter);
app.use("/api", equipmentRouter);
// Mounted at /api like finance/equipment. Its routes carry requireAuth
// individually rather than via router.use, so mounting it here cannot make a
// sibling /api path answer 401 before its own auth check runs (see the
// feedRouter note above for the time that already happened once).
app.use("/api", stringSetupsRouter);
app.use("/api", notificationsRouter);
app.use("/api/ai", aiRouter);
// Mounted alongside tournamentsRouter — adds the per-tournament conditions and
// ball endpoints without enlarging the catalog router.
app.use("/api/tournaments", conditionsRouter);

// Fallback JSON 404 so the frontend always gets a parseable error body.
app.use((_req, res) => res.status(404).json({ message: "Not found" }));

// Terminal error handler — must be registered last.
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`\n🎾  TennisAI API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  console.log(`    Database:       PostgreSQL`);
  console.log(`    Mail:           ${emailEnabled ? `${mailTransport} — checking…` : "no transport (console fallback)"}`);
  console.log(`    Signup:         ${env.requireEmailVerification && !emailEnabled ? "CLOSED — verification on, no mail" : "open"}\n`);

  // Daily tournament-calendar refresh. Pull sources only (UTR today); the
  // browser-driven scrapers post their rows in from CI instead, so nothing on
  // this box ever starts a Chromium.
  startTournamentSchedule(prisma, env.feedRefreshHourUtc);

  // Prove the mail credentials before anyone depends on them. A wrong app
  // password otherwise stays invisible until a real person fails to receive a
  // real link, by which point nobody thinks to look at the configuration.
  if (emailEnabled) {
    void verifyMailTransport().then(({ ok, error }) => {
      console.log(
        ok
          ? `📧  Mail transport (${mailTransport}) authenticated — real email will be sent.`
          : `❌  Mail transport (${mailTransport}) FAILED to authenticate: ${error}\n` +
              `    Nothing will be delivered until this is fixed. Credentials are in the server env.`,
      );
    });
  }
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
