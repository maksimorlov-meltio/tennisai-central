# The coaching library

A structured, cited collection of tennis drills that a coach can search, and that
the session assembler can build a session from. Every drill is a YAML document in
`content/drills/`, validated against one schema, imported into Postgres, and
carries at least one citation saying where the idea is documented.

Nothing here is complete, certified, endorsed or approved by any governing body.
It is a working library, written and reviewed in the open.

---

## The schema

`server/src/library/drillSchema.ts` is the **single source of truth**. The zod
schema defines the shape and every cross-field rule; `content/schema/drill.schema.json`
is *generated* from it (`npm run content:schema` in `server/`), and a spec fails if
the committed JSON drifts from the zod definition. The Prisma `Drill` model mirrors
the same fields.

A document looks like this (abridged — see any file under `content/drills/`):

```yaml
id: serve-plus-one-open-court          # the slug: primary key on disk AND in Postgres
title: { en: "...", es: "..." }
version: 1
status: draft | reviewed | approved | retired
taxonomy:
  domain: technique | tactics | footwork | serve_return | physical | mental | warmup_cooldown | games_kids
  skills: [serve_placement, point_construction]      # from content/schema/skills.yaml
  patterns: [serve_plus_one_forehand]                # from content/schema/patterns.yaml
blockKinds: [tactical, live]           # which session blocks this drill may fill
levelBands: [intermediate, advanced, high_performance]
ageBands:   [u14, u16, u18, adult]
players: { min: 2, max: 4 }
courts:  { min: 1, max: 1 }
equipment: [balls, cones, targets]
defaults: { durationMin: 15, reps: 24, sets: 2, restSec: 60, intensity: high }
ranges:   { durationMin: [10, 25], reps: [12, 40], sets: [1, 4] }
requiresQualifiedSupervision: false
objective / setup / progression / regression / successCriteria: { en, es }
diagram:  { court, markers: [...], paths: [...] }
steps / cues / commonErrors: { en: [...], es: [...] }
sources: [{ coachOrBody, title, medium, publisherOrChannel, url, year, note, fetchedAt }]
licence: none
authorAgent: researcher | fullstack | db
```

Rules the validator enforces that the shape alone cannot:

- `defaults` must fall inside `ranges`; `players.max ≥ players.min`; `courts.max ≥ courts.min`.
- Every skill and pattern must exist in the vocabularies.
- The `id` must match the file name, and the domain must match the folder.
- No two documents may share an `id`.
- Cues are **≤ 8 words**. A quoted cue (`quote: true`) must carry an `attribution`.
- A `reviewed` or `approved` drill may only cite **https** URLs, and must have at least one.
- Strength work offered to under-14s must be flagged `requiresQualifiedSupervision: true`.

## Taxonomy

Two controlled vocabularies, both content rather than code, so a researcher can
extend them in a reviewable diff:

- `content/schema/skills.yaml` — what the drill trains, grouped by domain for
  readability. A drill in any domain may use any tag.
- `content/schema/patterns.yaml` — recurring shot-and-position sequences
  (`serve_plus_one_forehand`, `short_ball_attack`, …). A warm-up or technique
  drill usually carries none; only claim a pattern the drill really rehearses.

Adding a tag is deliberate. A vocabulary that grows a synonym per drill has
stopped being a vocabulary.

## Diagram coordinate system

Diagrams are **coordinates, not images** — they render at any size, in any theme,
and carry nobody else's copyright.

- Units are **metres**. The origin is the centre of the court.
- **x** runs across the court, towards the sidelines. **y** runs along the court,
  towards the baselines. Positive `y` is one player's end, negative the other's.
- Singles half-width: **4.115** m. Doubles half-width: **5.485** m. Half-length: **11.885** m.
- Everything may sit up to **3 m** outside the lines (the run-off). So a marker on a
  singles court must satisfy `|x| ≤ 7.115` and `|y| ≤ 14.885`.
- `court` is `full`, `half`, `doubles_full` or `doubles_half`. `full`/`half` use the
  singles lines. A **half** court means every marker and path point sits on ONE side
  of the net — all `y ≥ 0` or all `y ≤ 0`.
- Markers carry a `type`: `cone | target | player | feeder | ball_path | hoop | line`.
- Paths carry a `style`: `shot` or `movement`, and at least two points.

Useful landmarks: the net is `y = 0`, the service line `y = ±6.4`, the baseline
`y = ±11.885`, the singles sideline `x = ±4.115`, the centre service line `x = 0`.

## Provenance rules

These are binding on every contributor, human or agent.

- Never download, transcribe, mirror or store video, audio, images or book text.
- Never fetch YouTube, TikTok, Instagram, or any platform whose terms forbid
  automated access. If robots.txt or the terms say no, stop.
- Every drill carries at least one source. No copied sentences: a quoted cue is
  **≤ 8 words**, marked as a quote, and attributed.
- **A named coach or body appears in `sources[]` only if a permitted page
  documenting that drill or pattern was actually fetched.** Otherwise the source
  is `coachOrBody: "TennisAI coaching library"` with
  `note: "written from standard coaching curricula"`, alongside the curricula
  pages that *were* fetched. A failed fetch means no attribution — never a
  best-guess URL.
- Attribution wording is factual — "documented from the public teaching of …" —
  never "official", "approved" or "endorsed".
- `fetchedAt` records the date a source was actually read.

The pages consulted so far are listed in [`research/sources.md`](research/sources.md).

## How a drill is born

```
draft ──▶ reviewed ──▶ approved ──▶ (retired)
```

1. **draft** — the `researcher` agent writes the document from permitted sources
   and its own coaching knowledge, and keeps private notes of what it fetched in
   `content/_notes/` (gitignored). Draft drills are never imported.
2. **reviewed** — the `reviewer` agent audits it: schema, provenance, the
   ≤8-consecutive-words overlap check against the notes, duplicates, URL
   reachability, taxonomy consistency, safeguarding, coaching quality. The
   reviewer files a report; **it never approves.** Reviewed drills are imported
   only with `--include-reviewed` (which is what the seed does, so a demo
   database is not an empty library).
3. **approved** — a **person** approves the drill in the app. `approvedById` and
   `approvedAt` record who and when. Only approved drills are imported by default,
   and only approved drills may be cited by a training plan's `libraryDrillId`.
4. **retired** — the document keeps `status: retired`. The importer flips the row
   and hides it. **Nothing is ever deleted**: a player's finished plan may point
   at it, and history is not ours to edit.

## Commands

```bash
# from the repo root (delegates to server/)
npm run content:validate            # the gate — CI runs this on every push

# from server/
npm run content:validate            # same, directly
npm run content:import              # upsert approved drills into Postgres
npm run content:import -- --include-reviewed   # …and reviewed ones (what the seed uses)
npm run content:schema              # regenerate content/schema/drill.schema.json
```

The importer is idempotent: it hashes the canonical JSON of each document into
`contentHash`, and a re-import of unchanged content writes nothing and does not
bump `version`.

## Data model

| Model | Holds |
|---|---|
| `Drill` | one imported document; `id` is the slug, `contentHash` decides re-import |
| `DrillSource` | the citations, one row each |
| `DrillTag` | skills and patterns, normalised out of the taxonomy for querying |
| `DrillReview` | the review trail: agent report + the human's decision |
| `SessionTemplate` | the shape of a session — ordered blocks with a share of the time |
| `GeneratedSession` | one assembled proposal, what the coach kept, and the diff |
| `CoachPreference` | what a coach tends to keep or throw away (explicit or learned) |

`TrainingDrill.libraryDrillId` links a saved plan drill back to the library drill
it came from. It is `SetNull` on delete: retiring a library drill must never erase
a plan a player already worked through.

## Assembler

_(To be written by the session-assembler work on this branch — how a
`SessionTemplate` plus constraints plus `CoachPreference` becomes a
`GeneratedSession`, and how a coach's edits feed back.)_
