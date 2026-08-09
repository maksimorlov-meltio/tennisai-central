# TennisAI

Player/coach tennis platform: a React + Vite frontend and an Express + Prisma
API, backed by **PostgreSQL**.

## Quick start (Windows, one click)

Double-click **`Start-TennisAI.bat`** in the project root. It starts Postgres, the
API and the website, waits for each to be genuinely ready, and opens
<http://localhost:5180>. **`Stop-TennisAI.bat`** shuts it all down again.

**Accounts you create through the sign-up page are permanent.** They live in a
Postgres data directory outside the repo — `D:\SQL\data\tennisai` by default —
so you can stop, restart, or reboot and log straight back in. Nothing is stored
in a temp folder.

| | |
|---|---|
| Sign up | <http://localhost:5180/signup> — creates a real, saved account |
| Database files | `D:\SQL\data\tennisai` (override: `TENNISAI_PGDATA`) |
| Postgres binaries | `D:\SQL\bin` (override: `TENNISAI_PGBIN`) |
| Logs | `.local-logs/` (postgres, api, web, migrate) |

The launcher applies pending migrations on every boot but deliberately does
**not** re-seed: seeding upserts the demo accounts and would overwrite changes
you made yourself (a password, for instance). Restore demo data on purpose with
`cd server && npm run prisma:seed`.

## Quick start (manual / non-Windows)

This is a **two-server app** — both need to be running, in separate terminals:

```bash
# Backend — http://localhost:4000
cd server
npm install
cp .env.example .env          # then point DATABASE_URL at a reachable Postgres
npm run db:setup              # applies Prisma migrations + seeds demo users
npm run dev

# Frontend — http://localhost:5180 (proxies /api → :4000)
npm install --legacy-peer-deps
npm run dev
```

Demo logins (seeded): `player@test.com` / `coach@test.com` / `observer@test.com` /
`admin@test.com`, password `password123` for all.

Node **20.x** is expected (see `.nvmrc` / `engines` in `package.json`).

- **Deploying** (Vercel + Render + managed Postgres): see [`DEPLOY.md`](./DEPLOY.md).
- **Backend details** (endpoints, env vars, migration status): see
  [`server/README.md`](./server/README.md).

## What technologies are used for this project?

This project is built with:

- Vite, TypeScript, React, shadcn-ui, Tailwind CSS (frontend)
- Express, Prisma, PostgreSQL (backend, see `server/`)

## Troubleshooting

### Stale component reference errors (e.g. `X is not defined`)

If the preview shows a runtime error like `ReferenceError: SomeComponent is not defined` immediately after renaming or removing a component — and a code search confirms the symbol no longer exists in the source — Vite's HMR (Hot Module Replacement) cache is serving a stale module.

**Quick fixes (in order of escalation):**

1. **Hard reload** the preview tab: `Cmd/Ctrl + Shift + R`.
2. **Restart the dev server**:
    ```sh
    # Stop with Ctrl+C, then:
    npm run dev
    ```
3. **Clear Vite's on-disk cache** if a hard reload + restart still serves stale code:
    ```sh
    rm -rf node_modules/.vite
    npm run dev
    ```
4. **Nuclear option** — wipe deps and reinstall:
    ```sh
    rm -rf node_modules/.vite node_modules/.cache
    npm ci
    npm run dev
    ```

> Working inside Lovable? Just ask the agent to "restart the dev server" — it has a dedicated tool for it and no manual cache clearing is required.
