# TennisAI API (real backend)

Express + Prisma + **PostgreSQL** backend for **authentication** and the
**trainings** domain, with **Gmail welcome emails** on signup. Auth and trainings
are real; the remaining domains (tournaments, teams, equipment, …) are still
mock-backed on the frontend (see [Migration status](#migration-status)).

## Stack
- **Express** — HTTP API (`/api/auth/*`, `/api/trainings/*`, `/api/health`)
- **Prisma + PostgreSQL** — real database. Dev/prod use the same engine (parity).
- **bcryptjs** (cost 12) — password hashing (never stored in plaintext)
- **jsonwebtoken** — stateless JWT sessions
- **helmet · express-rate-limit** — security headers + auth throttling
- **nodemailer** — Gmail welcome email

## First-time setup
Requires Docker (for a local Postgres) or any reachable Postgres.
```bash
cd server
npm install
cp .env.example .env           # a working local .env is already present
docker compose up -d           # start local Postgres (see docker-compose.yml)
npm run db:setup               # apply migrations + seed demo users & trainings
```
No Docker? Point `DATABASE_URL` in `.env` at any Postgres (e.g. a free Neon/Supabase
database), then run `npm run db:setup`.

## Run
```bash
npm run dev                    # http://localhost:4000  (auto-reload)   or: npm start
```
Then start the frontend (repo root `tennisai-central/`): `npm run dev`. The frontend
proxies `/api` → `http://localhost:4000` (see `vite.config.ts`); open http://localhost:5180.

## Quality gates
```bash
npm run typecheck              # tsc --noEmit
npm test                       # vitest (jwt unit tests)
```

## Security hardening (production)
- **`JWT_SECRET` is mandatory** and must be ≥ 32 chars in production — the process
  refuses to boot with a missing/default/short secret when `NODE_ENV=production`.
- Auth endpoints are **rate-limited** (30 req / 15 min / IP).
- **helmet** sets security headers; **CORS** is locked to `APP_URL`.
- JSON body limit 1 MB; all input validated with **zod**; a global error handler
  never leaks internals (generic 500 in production).
- Graceful shutdown drains in-flight requests and disconnects Prisma on SIGTERM/SIGINT.

## Enabling real Gmail sending
By default the server **logs** the welcome email to the console (no credentials
needed). To send real email:
1. On the Gmail account, turn on **2-Step Verification**.
2. Google Account → Security → **App passwords** → create one for "Mail".
3. Put it in `server/.env`:
   ```
   GMAIL_USER="you@gmail.com"
   GMAIL_APP_PASSWORD="the 16-char app password"
   ```
4. Restart the server. Signups now send a real Gmail to the new user.

> The app password lives only in your local `.env` (gitignored). It is never
> committed and never leaves your machine.

## Email verification
Signup now sends a **verification link** (`APP_URL/verify-email?token=…`, a purpose-scoped
JWT valid 24h). **Login requires a verified email** (403 otherwise). `POST /auth/verify-email`
confirms it; `POST /auth/resend-verification` re-sends. Without Gmail configured, the link is
**logged to the server console** so the flow is fully testable in dev. Seeded demo users are
pre-verified. Set `APP_URL` to the real frontend origin in production so the link points there.

## Endpoints
| Method | Path                         | Auth   | Purpose                              |
|--------|------------------------------|--------|--------------------------------------|
| GET    | `/api/health`                | —      | Liveness + DB readiness              |
| POST   | `/api/auth/signup`           | —      | Create account → send verification link |
| POST   | `/api/auth/verify-email`     | —      | Confirm email from the link's token  |
| POST   | `/api/auth/resend-verification` | —   | Re-send the verification link        |
| POST   | `/api/auth/login`            | —      | Verify credentials (requires verified email) → JWT |
| POST   | `/api/auth/logout`           | —      | No-op (stateless JWT)                |
| GET    | `/api/auth/me`               | Bearer | Resolve current user from JWT        |
| GET    | `/api/trainings`             | Bearer | Trainings visible to the user        |
| GET    | `/api/trainings/:id`         | Bearer | One training (owner or participant)  |
| POST   | `/api/trainings`             | Bearer | Create (owned by current coach)      |
| PATCH  | `/api/trainings/:id`         | Bearer | Update (owner only)                  |
| DELETE | `/api/trainings/:id`         | Bearer | Delete (owner only)                  |
| POST   | `/api/trainings/:id/analysis`| Bearer | Generate + persist an AI summary     |
| GET    | `/api/tournaments`           | Bearer | Global tournament catalog            |
| GET    | `/api/player-tournaments`    | Bearer | Current user's tournament entries    |
| POST   | `/api/player-tournaments`    | Bearer | Register the user for a tournament   |
| PATCH  | `/api/player-tournaments/:id`| Bearer | Update entry status/notes (owner)    |
| GET    | `/api/teams` · `/:id`        | Bearer | Coach's teams (with members)         |
| POST   | `/api/teams`                 | Bearer | Create a team (owned by the coach)   |
| PATCH/DELETE | `/api/teams/:id`       | Bearer | Rename / delete (owner)              |
| POST/DELETE | `/api/teams/:id/members` | Bearer | Add / remove a player                |
| GET    | `/api/connections`           | Bearer | Requests involving the current user  |
| POST   | `/api/connections`           | Bearer | Send a request                       |
| PATCH  | `/api/connections/:id`       | Bearer | Approve/reject (recipient only)      |
| DELETE | `/api/connections/:id`       | Bearer | Revoke an active relationship        |
| GET    | `/api/users/directory`       | Bearer | Discoverable users for the lookup    |
| GET    | `/api/training-requests` · `/:id` | Bearer | Requests the user is party to   |
| POST   | `/api/training-requests`     | Bearer | Player requests a session            |
| POST   | `/api/training-requests/:id/{approve,reject,reschedule,cancel}` | Bearer | Coach acts (approve → calendar event) |
| GET    | `/api/calendar/events` · `/:id` | Bearer | Events (recurring → occurrences)  |
| POST/PATCH/DELETE | `/api/calendar/events` | Bearer | Create / update / delete an event |
| GET/POST | `/api/players/:id/finance` (+`/summary`) | Bearer | Finance entries (self only)   |
| GET/POST | `/api/players/:id/equipment` · PATCH/DELETE `/api/equipment/:id` | Bearer | Equipment (self) |
| GET | `/api/notifications` · PATCH `/:id/read` · `/read-all` | Bearer | Notifications (self)       |
| GET/PATCH | `/api/notification-preferences` | Bearer | Per-user notification settings   |
| GET/PATCH | `/api/me/profile`         | Bearer | View / update own profile            |

## Demo logins (seeded)
`player@test.com`, `coach@test.com`, `observer@test.com`, `admin@test.com` —
password `password123` for all. IDs are pinned (`p1`, `c1`, …) to match the
front-end mock data. The seed also creates two demo trainings for coach `c1`.

> **Never run the seed in production** — it plants known-credential accounts.

## Deploy
See [`../DEPLOY.md`](../DEPLOY.md) for the full Vercel + Render + Postgres runbook.
`render.yaml` provisions the API service and a managed Postgres.

## Migration status
- ✅ **Auth** — real: signup, login, session, welcome email.
- ✅ **Trainings** — real: CRUD + AI analysis, auth-scoped to owner/participants.
- ✅ **Tournaments** — real: global catalog + per-user entries (`/api/tournaments`,
  `/api/player-tournaments`), auth-scoped to the current player.
- ✅ **Teams** — real: coach-owned teams + members (`/api/teams`), owner-scoped.
- ✅ **Connections** — real: directed requests with server-side duplicate/recipient
  guards (`/api/connections`) + a users directory (`/api/users/directory`). Users now
  carry a shareable `publicId`.
- ✅ **Training requests + Calendar** — real: `/api/training-requests` (approve creates
  a linked calendar event **and a notification**) and `/api/calendar/events` (recurrence
  expanded into occurrences on read).
- ✅ **Finance · Equipment · Notifications · Profile** — real, self-scoped:
  `/api/players/:id/finance` (+ summary), `/api/players/:id/equipment` + `/api/equipment/:id`,
  `/api/notifications` (+ `/notification-preferences`), `/api/me/profile`.
- ⏳ **aiInsights** — the only holdout. It is a *derived computation* (aggregates
  trainings/equipment), not stored CRUD, so it still runs client-side against the mock.
  To make it production-correct, either port the heuristics to the server or have the
  client compute over the now-real trainings/equipment. Everything else is real.
