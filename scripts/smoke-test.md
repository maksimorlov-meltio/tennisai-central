# Smoke test — is the deployment actually usable?

Run this after every deploy, and after any env-var change. "The site loads" is
not the bar; the bar is that a beta tester can get in.

## Automated part

```bash
node scripts/smoke.mjs https://<your-api-host>
```

No dependencies — Node 18+ built-in `fetch`. Exits `0` when every check passes,
`1` otherwise, so CI can gate on it.

> ⚠️ **It creates a real account** on the target and consumes one `MAX_SIGNUPS`
> seat. The address is obviously synthetic — `smoke+<timestamp>@synthetic.test`.
> Delete it when you are done:
> ```sql
> delete from users where email like 'smoke+%@synthetic.test';
> ```
> Use `--skip-signup` to check only health and password reset (safe to repeat).

| Check | Pass condition | What a failure means |
|---|---|---|
| `GET /api/health` | `200 {ok: true, db: "up"}` | `db: "down"` → `DATABASE_URL` wrong or the database is unreachable. No response → wrong host, or a free dyno cold-starting (retry once; the script waits 60s). |
| `POST /api/auth/signup` | `201` | `403` → `MAX_SIGNUPS` reached. `500` → migrations were not applied. |
| `POST /api/auth/login` before verifying | `403` | `200` means `REQUIRE_EMAIL_VERIFICATION` is off — anyone can register and use an address they do not own. |
| `POST /api/auth/forgot-password` | generic `200` | Anything else could let an attacker discover which addresses are registered. |

The script also warns when `emailEnabled: false`. That combination —
verification required, no mail configured — is the one that silently bricks a
beta: signup succeeds, no link is ever delivered, and nobody can log in.

## Manual part

The automated checks cannot cover these. Do them once per deploy, in a browser.

- [ ] **CORS.** Open the deployed frontend, sign in, load any page. A failed
      request with a CORS error means backend `APP_URL` does not exactly match
      the site origin — no trailing slash, no path, right scheme.
- [ ] **The frontend is talking to the real API.** DevTools → Network: requests
      go to your API host, not to a relative `/api` on the static host. If they
      are relative, `VITE_API_BASE_URL` was missing **at build time** — set it
      and redeploy; changing it without rebuilding does nothing.
- [ ] **The real email arrives.** Sign up with an address you control. Check
      spam. The link must point at the frontend origin (`APP_URL`), not
      `localhost`.
- [ ] **Verify, then log in.** Click the link, then sign in.
- [ ] **Data persists.** Create a training, hard-refresh, confirm it is still
      there, then log out and back in and confirm again.
- [ ] **Password reset.** Request one, follow the emailed link, set a new
      password, log in with it.
- [ ] **No demo accounts.** `player@test.com` / `password123` must NOT work.
      If it does, the seed ran against production — delete those four accounts
      immediately (they share a password published in this repo, and one is an
      admin).
- [ ] **No mock data.** A brand-new account should see empty states, never
      Alex Rivera's trainings, matches or equipment.

## Cold starts

On Render's free plan the API sleeps after ~15 minutes idle and the next
request takes ~30 seconds. The first tester of the day will see a slow load.
That is the plan, not a bug — upgrade if it bothers people.
