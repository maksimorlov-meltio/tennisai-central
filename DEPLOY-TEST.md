# Deploy TennisAI as a real test site (free)

A step-by-step guide to put TennisAI online so a coach can log in and test it, using
**Render** (API + Postgres) and **Vercel** (website), both on their **free** tier.

You do the account/click steps (I can't create accounts or type your passwords).
Everything else is already wired in the committed config (`server/render.yaml`, `vercel.json`).

**Time:** ~20 minutes. **Cost:** €0.

---

## What you'll end up with
- API:   `https://tennisai-api.onrender.com`  (your name may differ)
- Site:  `https://<your-project>.vercel.app`  ← this is the link you send the coach

---

## Step 0 — get the code onto `main`
All the work is in **PR #5**. On GitHub, open
`SOMAXOrlov/tennisai-central` → Pull requests → **#5** → **Merge pull request**.
This puts everything (analytics, auth, the tournaments map, the Wave-1 fixes) on `main`,
which the hosts will deploy.

*(Alternative: skip the merge and just pick the branch `feat/analytics-authz-session-builder`
when connecting Render/Vercel below.)*

## Step 1 — API + database on Render
1. Create a free account at **render.com** (sign in with GitHub).
2. **New ▸ Blueprint** → connect GitHub → pick **`SOMAXOrlov/tennisai-central`**, branch **`main`**.
3. Render reads `server/render.yaml` and proposes **`tennisai-api`** (web, free) + **`tennisai-db`** (Postgres, free). It auto-generates `JWT_SECRET`, wires `DATABASE_URL`, and sets `REQUIRE_EMAIL_VERIFICATION=false`.
   - If it objects to `plan: free` for the database, just pick the **Free** database plan in the dropdown.
4. Leave **`APP_URL`** blank for now. **Set `SIGNUP_INVITE_CODE`** to any code you choose (e.g. `tennis-2026`) — this is the access gate: only people who type this code can register. Share it privately with your brother/coach.
5. Click **Apply / Create**. First deploy runs: build → apply migrations → seed demo data → start. Wait for the service to go **Live** (health check green). First build takes a few minutes.
6. Copy the API URL, e.g. `https://tennisai-api.onrender.com`.
   - Sanity check: open `https://tennisai-api.onrender.com/api/health` → you should see `{"ok":true,"db":"up",...}`.
   - **Your API base is that URL + `/api`** — you'll need it in the next step.

## Step 2 — website on Vercel
1. Create a free account at **vercel.com** (sign in with GitHub).
2. **Add New ▸ Project** → import **`SOMAXOrlov/tennisai-central`**, branch **`main`**.
3. Leave **Root Directory = the repo root** (NOT `server`). Framework auto-detects as **Vite**; build/install come from `vercel.json`.
4. Open **Environment Variables** and add these two **before** the first deploy (they're baked in at build time):
   | Name | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://tennisai-api.onrender.com/api`  *(your Render URL + `/api`)* |
   | `VITE_MOCK_AUTH` | `false` |
5. **Deploy.** When it finishes, copy your site URL, e.g. `https://tennisai.vercel.app`.

## Step 3 — connect them (CORS)
1. Back in **Render ▸ tennisai-api ▸ Environment**, set **`APP_URL`** = your Vercel URL
   (e.g. `https://tennisai.vercel.app`, **no trailing slash**). Save — the API redeploys.
   This is required: the API only accepts requests from `APP_URL`.

## Step 4 — hand it to the coach
- Send the coach your **Vercel URL** and the **invite code** you set in Step 1.4.
- He clicks **Sign up free**, picks role **Coach**, enters the **invite code** + his email + a password, confirms he's 16+, accepts the terms → he's logged straight in (no email verification step). Without a valid code, registration is refused.
- Or explore instantly with the seeded demo login: **`coach@test.com` / `password123`** (login needs no code).
- To link a coach and a player, use the **public ID** shown on each user's Profile page (Connections ▸ add by ID).

---

## Honest caveats (please read)
- **Free-tier behaviour:** the API **sleeps after ~15 min idle** — the first visit after that takes ~30s to wake. Render's **free Postgres expires after ~30 days**; export or upgrade before then if you want to keep the data.
- **This is a test build, not a hardened public product.** Known gaps: no self-service password reset yet (if the coach forgets it, tell me and I'll reset it in the DB), sessions can't be remotely revoked, and the Privacy/Terms pages are **drafts pending real legal review**.
- **Adults only + no real minors' data.** The trial is configured 16+; don't enter real children's personal data.
- **Registration is gated by the invite code** you set (`SIGNUP_INVITE_CODE`). Anyone with the URL can *see* the landing/login page, but only someone with the code can create an account. To rotate access, change the code in Render (existing accounts keep working); to fully close signups, set it to a long random string and don't share it.

## If something breaks
- API won't start → Render ▸ tennisai-api ▸ **Logs** (look for a migration error).
- Site loads but no data / network errors → check `VITE_API_BASE_URL` (must end in `/api`) and that Render `APP_URL` matches the Vercel origin exactly.
- `/api/health` shows `db":"down"` → the database is still provisioning; wait and retry.
