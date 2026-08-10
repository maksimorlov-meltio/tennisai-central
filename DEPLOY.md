# Deploy runbook — private beta

Copy-paste steps to put TennisAI online for up to ~50 testers, with real email
signup and data that survives.

**Shape:** static frontend on Vercel → API on Render → Postgres on Neon (or
Supabase). Roughly 45 minutes end to end, most of it waiting on builds.

**Definition of done:** a tester can sign up, receive a real verification email,
verify, log in, create trainings and matches, see them after logging out and
back in, and reset a forgotten password.

> **Read before starting**
> - **Do not use Render's free Postgres.** It is deleted after ~30 days and
>   takes your testers' data with it. `render.yaml` no longer provisions one.
> - **Registration is open** — there is no invite code. The URL is the access
>   control. `MAX_SIGNUPS` caps how many people can register.
> - Steps 1, 3, 4 and 6 need dashboards. Nobody can do those from the repo.

---

## 1 · Persistent Postgres

[Neon](https://neon.tech) (recommended) or [Supabase](https://supabase.com) —
both have a non-expiring free tier.

1. Create a project, region close to your testers.
2. Copy the **pooled** connection string.
3. Make sure it ends with `?sslmode=require`:

```
postgresql://USER:PASSWORD@ep-xxx.eu-central-1.aws.neon.tech/tennisai?sslmode=require
```

Keep it to hand — this is `DATABASE_URL`.

## 2 · JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

64 characters. The server **refuses to boot** in production on a short or
known-default secret. Anyone holding it can forge a session for any account.

## 3 · Backend on Render

New → **Blueprint** → point at this repo. `server/render.yaml` defines the
service; set the `sync: false` values in the dashboard:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | from step 1 | **secret** |
| `JWT_SECRET` | from step 2 | **secret** — or let Render generate it |
| `APP_URL` | `https://placeholder.vercel.app` | corrected in step 5 |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | already set in the blueprint |
| `MAX_SIGNUPS` | `50` | remove the key for no cap |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | leave blank for now | step 6 |
| `AI_PROVIDER` / `AI_API_KEY` | optional | see *Optional AI* below |

Migrations run at boot (`npm run migrate:deploy && npm start`). The seed does
**not** run — it writes four demo accounts sharing a password published in this
repo, one of them an admin.

Wait for the first deploy, then:

```bash
curl https://<your-api>.onrender.com/api/health
# {"ok":true,"db":"up","emailEnabled":false,...}
```

`db: "down"` → `DATABASE_URL` is wrong or missing `?sslmode=require`.

## 4 · Frontend on Vercel

New Project → same repo → **root** directory (not `server/`).

| Setting | Value |
|---|---|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install --legacy-peer-deps` |

Environment variable — **the only one you need**:

```
VITE_API_BASE_URL = https://<your-api>.onrender.com/api
```

Three things people get wrong here:

- **The `/api` suffix is required.** Without it every request 404s.
- **Vite inlines this at build time.** Adding it to an existing deployment does
  nothing — you must redeploy so it is rebuilt.
- **Leave `VITE_MOCK_AUTH` and `VITE_USE_MOCK_CONNECTIONS` unset.** Either one
  set keeps the app in browser memory and nothing reaches your API.

Verify after the build:

```bash
curl -s https://<your-site>.vercel.app/assets/index-*.js | grep -c onrender
# non-zero: the API host is baked in
```

## 5 · Point CORS at the real frontend

Back in Render, set `APP_URL` to the exact Vercel origin:

```
https://tennisai.vercel.app
```

No trailing slash. No path. `https`, not `http`. Redeploy the backend.

This is the single most common failure: the site loads, and every request dies
with a CORS error because the origin does not match to the character.

> Vercel gives each deployment its own preview URL. CORS allows exactly one
> origin, so test on the production domain — previews will be blocked.

## 6 · Email

Without this, verification links are only written to the server log — signup
succeeds and **nobody can log in**.

1. On the sending Google account, turn on **2-Step Verification** (app
   passwords do not exist without it).
2. Google Account → Security → **App passwords** → app "Mail" → copy the 16
   characters.
3. In Render set `GMAIL_USER` (the full address) and `GMAIL_APP_PASSWORD`
   (spaces are fine — the server strips them). Redeploy.

```bash
curl https://<your-api>.onrender.com/api/health
# "emailEnabled":true
```

Gmail allows roughly 500 messages/day. Fine for 50 testers; not for launch.

## 7 · Smoke test

```bash
node scripts/smoke.mjs https://<your-api>.onrender.com
```

Then the browser checklist in [`scripts/smoke-test.md`](scripts/smoke-test.md) —
CORS, a real email arriving, and data surviving a re-login can only be
confirmed by hand.

The script creates one synthetic account. Remove it when done:

```sql
delete from users where email like 'smoke+%@synthetic.test';
```

---

## Optional: AI features

Two features call a language model: **training advice** in the coach's Create
Training dialog, and **match-prep analysis** on a tournament.

Set `AI_PROVIDER` (`anthropic` or `openai`) and `AI_API_KEY` in Render. Both, or
it stays off. Unconfigured, the UI says so plainly and returns 503 — it never
invents analysis. Cost is per generation, capped at 100/user/month.

**Tournament conditions — surface, altitude, temperature, humidity and the ball
physics — need no key at all.** They use Open-Meteo, which is free and keyless,
and work from the moment you deploy.

---

## Rollback

| Situation | Action |
|---|---|
| Bad backend deploy | Render → Deploys → previous deploy → **Redeploy**. ~2 min. |
| Bad frontend deploy | Vercel → Deployments → previous → **Promote to Production**. Instant. |
| Bad migration | Restore the database from your provider's snapshot. Neon has branch/restore; Supabase has daily backups. **Take a snapshot before any migration once you have real testers.** |
| Need to stop signups now | Set `MAX_SIGNUPS=0` and redeploy. Existing testers are unaffected; new registrations get "Beta is full". |

## Troubleshooting

**Every request fails with a CORS error.**
`APP_URL` ≠ the site origin. Compare character by character: scheme, no trailing
slash, no path. It must be the origin you are actually browsing — a Vercel
preview URL will not match.

**Requests go to `/api/...` on the Vercel domain instead of the API.**
`VITE_API_BASE_URL` was missing at build time. Set it and **redeploy** —
changing the variable alone does not rebuild.

**First request of the day takes 30 seconds.**
Free Render dynos sleep after ~15 minutes idle. Expected. Upgrade the plan, or
warn testers.

**Signup works, no email arrives.**
Check `emailEnabled` in `/api/health`. `false` → the Gmail variables are not
both set. `true` but nothing arrives → check spam; confirm the app password was
created for "Mail" and that 2-Step Verification is still on. Meanwhile the
server log prints the verification link so you can unblock a tester by hand.

**Verification links point at `localhost`.**
`APP_URL` is unset or still local. Links are built from it.

**`db: "down"` on health.**
Wrong `DATABASE_URL`, missing `?sslmode=require`, or the database is paused —
Neon suspends idle projects and takes a few seconds to wake.

**Signup returns 403 "Beta is full".**
`MAX_SIGNUPS` is reached. Raise it, or delete unused accounts.

**A demo account like `player@test.com` can log in.**
The seed ran against production. Delete all four `@test.com` accounts
immediately — they share a password published in this repo and one is an admin.
Confirm `SEED_ON_BOOT` is not set to `true`.
