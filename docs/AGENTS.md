# tennisai-central — Agent team

Project-scoped Claude Code subagents live in [`.claude/agents/`](../.claude/agents). Each owns one part of the stack. Invoke one by asking for its area of work, or by name.

| Agent | Model | Owns | Invoke for |
|---|---|---|---|
| **manager** | Opus | Delivery lead / coordinator | "plan this", "break this down", "who does X", roadmap, multi-role features |
| **backend** | Sonnet | Express + Prisma + PostgreSQL API, auth, authz, validation | endpoints, auth, mock→real migration, anything server-side |
| **frontend** | Sonnet | React 18 + Vite + TS + shadcn/ui pages, hooks, forms | pages/components, routing, data hooks, responsive/theming |
| **designer** | Sonnet | Design tokens (`src/index.css`), calendar palette, court picker, a11y | "restyle this", "does it look right", spacing/colour, accessibility, dark mode |
| **fullstack** | Sonnet | End-to-end vertical slices across client + server | a feature that touches both halves at once |
| **db** | Opus* | Prisma schema, migrations, seed, indexes, query perf | schema changes, new models, migration review, data modeling |
| **devops** | Sonnet | Build/run (FE :5180 / API :4000), env & secrets, migrations-on-deploy, CI | "how do I run/build/deploy", env/proxy/port issues, CI |
| **security** | Opus | Adversarial review **and** fixes: authz/IDOR, auth, secrets, XSS | before merging auth/API changes, hardening pass, "is this safe" |
| **test** | Sonnet | Vitest suite, browser E2E, type-checks — the PR gate | "run the tests", "verify this", "add a test for", "did I break anything" |
| **marketing** | Sonnet | Positioning, launch plan, landing/feature copy, competitor scans | "how do we describe this", landing copy, launch plan, naming |
| **lawyer** | Opus | GDPR (esp. minors), privacy policy, ToS, consent, DPA — advisory | "privacy policy", "is this GDPR-ok", kids' data / parental consent |

\* `db` runs on Opus for schema/architecture reasoning.

## Stack the team operates on
- **Frontend:** React 18 · Vite · TypeScript · shadcn/ui + Tailwind · TanStack React Query · React Router. Dev server on **:5180**. Design tokens in `src/index.css` — warm paper/ink base, **matte forest-green accent**, sharp corners, matte (no glow); `destructive` = red (delete only).
- **Backend:** Node (ESM) · Express · TypeScript (tsx) · Prisma · **PostgreSQL** · JWT (HS256) + bcrypt (cost 12) · role-based authz (`server/src/authz.ts`). API on **:4000**, proxied at `/api`.
- **Roles:** player · coach · observer (parent) · admin (academy).

## House rules every agent follows
- Don't rewrite from scratch; reuse existing components; no unnecessary dependencies.
- Never expose secrets in client code; never commit `.env`.
- Schema changes go through Prisma migrations.
- Real logic only — no fake buttons, no hard-coded analytical conclusions, no fake "AI".
- Every data view has loading / empty / error states; strict TypeScript; responsive + light/dark.
- Nothing is "complete" without test evidence.

## Honesty & scope guardrails
- Never claim the app is "fully secure", "penetration-tested", "security-approved", or "GDPR/legally approved" — state what was actually checked.
- Synthetic data only — no real data belonging to children.
- No public deploy, domain purchase, or DNS change without explicit approval.
