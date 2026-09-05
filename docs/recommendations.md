# Recommendations (deterministic v1)

Three rules engines behind the Player Gear & Advice feature: **strings**,
**tournaments**, **money**. Each is a pure function in
`server/src/recommend/` over a plain input object — no Prisma, no clock, no
network inside the engine — so every rule is testable with a fixture and every
answer is reproducible. The route layer (`recommend/routes.ts`) authorizes,
loads the rows through `recommend/load.ts`, calls the engine and returns the
result. Nothing is stored: recommendations are computed at read time.

The catalogue the strings engine picks from is documented in
[`catalogue.md`](catalogue.md).

---

## Principles

- **Recommendation first, numbers second.** A handful of plain inputs drive the
  advice. There is no what-if, no compare, no budget model in this version.
- **Deterministic first, AI second.** Every rule below is code; the reason codes
  are the index into it. No language model phrases anything here.
- **Confidence is visible.** Every result carries `confidence: { level, raisedBy }`
  — and `raisedBy` is the single thing that would raise it.
- **Honest about data.** A reason never cites a number the engine did not have.
  Missing inputs are named in a reason and lower confidence. Catalogue ratings
  are editorial estimates, so a reason using them says *rated*, not *measured*.
- **No medical, investment or tax advice.** Injury or pain text on the profile
  becomes two booleans before any engine sees it (`prefersComfort`,
  `painMentioned`). The text itself is never carried, quoted or classified. When
  pain is mentioned the strings engine emits exactly one caution recommending a
  qualified assessment and says nothing else about it. Money output is about
  spending only — the tests assert the words budget / invest / tax / debt / loan
  never appear.

---

## Output contract (`recommend/types.ts`)

```ts
type Reason     = { code: string; params: Record<string, string | number | boolean>; textEn: string };
type Confidence = { level: "low" | "medium" | "high"; raisedBy: string };
type Caution    = { code: "seek_qualified_assessment"; textEn: string };
export const RECOMMENDER_VERSION = "v1";
```

`code` is a stable snake_case machine key so the client can localise later;
`textEn` is the plain-English sentence for now. Every route returns

```json
{ "data": { "version": "v1", "computedAt": "<ISO>", ...engineOutput } }
```

`RECOMMENDER_VERSION` is bumped whenever a rule changes in a way that changes
output for the same input.

---

## Profile facts (`recommend/profileFacts.ts`)

The raw `PlayerProfile` / `User` rows are wide and mostly free text; the engines
read a handful of derived facts. Everything else is ignored.

| Fact | From | Rule |
|---|---|---|
| `level` | `playingLevel` (free text from the onboarding picker) | Loosely matched to `beginner / intermediate / advanced / competitive`. Unrecognised → `undefined` (lowers confidence; a mis-read would mis-advise). |
| `ageYears`, `ageBand` | `PlayerProfile.dateOfBirth`, else `User.dateOfBirth` | Whole years at `now`; bands `u12 / u14 / u16 / u18 / adult` follow tournament age categories. |
| `utr` | `ranking` (free text) | Read **only** when it literally says `UTR n`. Any other rating scale is not converted — that would be inventing a number. |
| `preferredSurface`, `styleAggression`, `suit{Clay,Hard,Grass,Indoor}` | same-named columns | Passed through; `suit` only when at least one score is set. |
| `painMentioned` | any `injuryRestrictions` text; `physicalLimitations` entries matching word-bounded pain/injury words | Boolean only. |
| `prefersComfort` | `= painMentioned` | The one thing an engine may *act* on. |

---

## 1. Strings — `recommend/strings.ts` → `recommendStrings(input)`

### Inputs
- profile facts (`level`, `ageBand`, `styleAggression`, `preferredSurface`, `prefersComfort`, `painMentioned`);
- the racket: name, pattern mains×crosses, `stiffnessRa?`, recommended band kg (absent when the frame is not linked to a catalogue product);
- `StringSetup` history **for that frame**: strung/retired dates, hours, mains tension, retire reason, string name;
- the next entered tournament's `ConditionsPhysics`, from the existing `conditions/service.ts` — reused, never recomputed; `null` when no temperature/altitude was available;
- the 3–4 plain questions: `breaksOften?`, `wantsArmComfort?`, `wantsMoreSpin?`, `priority?: control | power | balanced`;
- the catalogue slice of active string products.

### Output
`material` (+ up to two `alternatives`), `gauge {label, mm}`,
`tension { mainsKg:[min,max], crossesKg:[min,max], racketBandKg, anchoredTo }`
(**kg only** — the client derives lbs), `hybrid?`, `restringCadence?`,
`reasons[]`, `confidence`, `cautions[]`, `pickFromCatalogue.productIds[]`.

### Rules, in the order the engine applies them

**Signals read first.** `junior` = age band u12/u14/u16. `comfort` = asked for
arm comfort **or** profile prefers comfort. `breaker` = declared **or** logged
breaks average under `BREAKER_HOURS = 10` h. `spin` = asked **or**
`styleAggression ≥ 7`. `stiff` = `RA ≥ STIFF_RA = 68`. Open pattern = mains ≤ 16
and crosses ≤ 19; dense = mains ≥ 18.

| Reason code | Rule | Rationale |
|---|---|---|
| `profile_level`, `profile_level_unknown` | States the level or that it is missing. | An unknown level lowers confidence rather than being guessed. |
| `junior_comfort`, `profile_age_unknown` | Juniors → soft string, lower half of the frame's band. | A developing arm should not absorb a stiff polyester. With no date of birth the rule cannot be applied either way, and says so. |
| `comfort_requested`, `comfort_profile` | Comfort → softer materials, lower tension. | The comfort signal is the only thing the pain flag is allowed to change. |
| `history_none`, `history_summary`, `current_setup_hours` | Names the jobs the engine had, or that there are none. | Honesty about data. |
| `breaker_declared`, `breaker_history` | Frequent breaker (declared or interval < 10 h). | The threshold is spelled out in the reason. |

**Material** (first matching branch wins; each branch also sets which catalogue
rating orders the picks):

| Branch | Primary | Alternatives | Notes |
|---|---|---|---|
| junior or comfort | multifilament (comfort-rated ≥ 7) | soft co-poly (not for u12/u14); natural gut for adults, synthetic gut for juniors | + `spin_with_comfort`: hybrid shaped-poly mains / multi crosses offered instead of a full poly bed. A breaking junior gets a durable-poly-mains hybrid. |
| breaker | durable co-poly (durability ≥ 7) | polyester; hybrid | **Never a higher tension as the first answer** (`breaker_no_tension_increase`). |
| spin | shaped co-poly (`shape ≠ round` or spin ≥ 8) | round poly; hybrid | `spin_priority` says whether it was asked for or read from the profile. |
| `priority = control` | control co-poly (control ≥ 8) | polyester; hybrid | `priority_control` |
| `priority = power` | multifilament | natural gut; synthetic gut | `priority_power` |
| `priority = balanced` | soft co-poly (comfort ≥ 6) + hybrid card | multifilament; hybrid | `priority_balanced` |
| beginner / intermediate | multifilament | synthetic gut; co-poly | `level_developing` — polyester can wait. |
| advanced / competitive | co-poly | multifilament; hybrid | `level_strong` |
| nothing known | soft co-poly (comfort ≥ 6) | multifilament; hybrid | `default_middle_ground` |

`frame_stiff` (RA ≥ 68): polyester steps down to co-poly, a co-poly must be a
comfort-rated one, and a hybrid card is offered if none was.

**Gauge.** Poly 1.25 mm, others 1.30 mm. Breaker → +0.05 mm
(`gauge_thicker_for_breaks`) — the first answer to breaking is a thicker string.
Spin at a strong level with no comfort signal → 1.20 mm
(`gauge_thinner_for_spin`, with the durability cost stated). Otherwise
`gauge_standard`. Labels: 1.20→17, 1.25→16L, 1.30→16, 1.35→15L.

**Tension.** Band = the racket's recommended range, else `DEFAULT_BAND_KG = [22, 26]`
with `band_unknown` said out loud.

- *With history* (`anchor_history`): start from the last mains tension, clamped
  into the band. Junior / comfort / power → −0.5 (`tension_softer`); junior or
  comfort is also **capped at the band midpoint** (`tension_capped_lower_half`)
  — a junior last strung at the top of the band is brought down, not kept there
  because that is what happened last time. Control (non-breaker) → +0.5
  (`tension_control`). Pattern rules are **not** re-applied: they are already
  baked into a tension the player has lived with.
- *Without history*: start at the band midpoint (`tension_midpoint`), or at the
  25 % point for junior / comfort / power (`tension_lower_half`). Open pattern
  → +0.5 (`pattern_open`, for control); dense 18×20 → −0.5 (`pattern_dense`,
  to keep some feel). Control → +0.5.
- `tension_stiff_frame`: −0.5 for RA ≥ 68.
- Conditions at the next tournament, from the shared physics
  (`densityVsReferencePct`): ≤ −8 % → +1 kg, ≤ −3 % → +0.5 (`conditions_hot_thin`
  — the ball flies); ≥ +8 % → −1, ≥ +3 % → −0.5 (`conditions_cold_heavy` — the
  ball sits); otherwise `conditions_neutral`; no physics →
  `conditions_unavailable` and nothing changes.
- The result is a 1 kg window around the centre in 0.5 kg steps, **clamped to
  the band** (`band_clamped` when it moved). Crosses = mains
  (`crosses_same_as_mains`): one number to give the stringer.

**Cadence** (`restring_cadence`): only with ≥ 2 retired jobs with hours —
"about every N hours based on your last k finished jobs". One job is not a
pattern.

**Catalogue picks** (`pickFromCatalogue`): material is a hard filter; gauge
(±0.05 mm) and the rating thresholds are relaxed in turn if they empty the list,
so "Fits me" is never empty when the material exists. Ordered by the deciding
rating, then id. When ratings were used, `ratings_are_estimates` is emitted.

**Confidence ladder** (`confidenceFor`):

| Condition | Level | `raisedBy` |
|---|---|---|
| band unknown | low | link the racket to a catalogue product |
| no retired job with hours | low | log finished jobs with hours — two make it medium, three high |
| level unknown | low | add your playing level |
| 1–2 retired jobs with hours | medium | log N more |
| ≥ 3 | high | as confident as v1 gets |

**Caution.** `painMentioned` → exactly one `seek_qualified_assessment`; the
tests assert no condition word survives into the output.

---

## 2. Tournaments — `recommend/tournaments.ts` → `recommendTournaments(input)`

### Inputs
Profile facts (`level`, `dateOfBirth`, `utr`, `preferredSurface`, `suit`);
`origin?` (home coordinates — **no profile field holds one in v1**, so the route
passes `undefined`); candidate tournaments starting within `horizonDays`; the
player's entered tournament ids (status ≠ withdrawn); the player's own hidden
list; busy periods (entries, calendar events, trainings); `FinanceEntry` facts.

### Output
`top` (≤ 5), `others` (≤ 50), `hidden` (≤ 50, each with a why-not),
`totals { candidates, scored, hidden, othersOmitted, hiddenOmitted }`,
`confidence`, `reasonsGlobal[]`. Each `FitResult` carries `score` 0–100 and
`components[]` `{ code, weight, score | null, textEn }`.

### Hard filters → `hidden[]` (never silently dropped)

| Code | Rule |
|---|---|
| `hidden_by_you` | the player hid it |
| `already_entered` | on their calendar already — not a suggestion |
| `age_ineligible` | `ageCategory` of the exact shape `N & Under` and the player's age **at the event's start** exceeds N. Only that shape is read; anything else is `age_category_unparsed` and not enforced. No date of birth → `profile_age_unknown` / `age_unchecked`: shown, not hidden. |
| `entry_deadline_passed` | deadline before `now` |

### Components and weights

| Component | Weight | Score |
|---|---|---|
| `level_fit` | 30 | UTR inside the event's range → 100, −40 per point outside. No UTR → the profile level becomes a deliberately wide band (`LEVEL_UTR_BAND`) and the overlap is scored. Professional tour events (no range) score 50 for competitive players, 5 otherwise — even with an unknown level, so they cannot float to the top of an empty profile. ITF Juniors: 80 / 50 / 15 by level and age. Otherwise unknown. |
| `surface_fit` | 15 | `suit*` score → (s−1)/9 × 100; else preferred surface match 80 / 40; else unknown. Indoor events use `suitIndoor`. |
| `distance` | 20 | haversine from `origin`; ≤ 50 km 100, ≤ 150 85, ≤ 300 65, ≤ 600 45, ≤ 1500 25, else 10. Unknown without an origin or event coordinates. |
| `calendar_conflicts` | 15 | overlaps an entered tournament → 0; other calendar items → 40; nothing → 100. |
| `entry_deadline` | 10 | ≥ 14 days 100, ≥ 7 80, ≥ 3 55, else 30; unknown if none listed. |
| `estimated_cost` | 10 | own history (≥ 3 rows per trip category in **one** currency, averages summed) or a **rough default by distance** labelled as such; ≤ 50 → 100 … > 1000 → 10. Entry fees are not in the calendar (`fee_unknown`, said once). |

The total is the weighted mean over the **known** components only; unknown ones
are listed in `components_unknown`, never scored as average. Ordering: score
desc, then start date, then id — deterministic.

**Known limitation.** With an empty profile only `calendar_conflicts` can be
scored, so most events tie at 100 and the order degenerates to start date. The
result is honest (low confidence, `raisedBy` names the fix) but not useful
until the player fills in a level.

**Confidence:** no level and no UTR → low; no date of birth → low; no origin →
medium ("no home location on the profile in this version"); else high.

---

## 3. Money — `recommend/money.ts` → `analyseMoney(input)`

### Inputs
`FinanceEntry` rows; the player's tournament entries with dates; `StringSetup`
rows (hours, cost); trainings the player took part in (for hours).

### The per-currency rule
**Everything is grouped by `currency`; nothing is ever converted or added
across currencies.** The headline is the currency with the most entries in the
window (ties alphabetical); the others are listed separately
(`other_currencies_separate`). 800 USD + 450 EUR is a number that is neither.

### Rules

| Reason / field | Rule |
|---|---|
| `window` | rolling 30 / 182 / 365 days for `month / season / year`, compared with the equal window before it. |
| `headline`, `otherCurrencies` | totals and by-category per currency, plus the previous window's. |
| `tournaments[]` | true cost per entered tournament: rows matched **by `tournamentId` first** (a flight booked months early belongs to its event), then unlinked rows in a tournament category (`tournament, tournament_fee, travel, accommodation, food, stringing`) dated within the event ± 1 day. A row linked to another tournament is never re-matched by date. `matched.byDateWindow` tells the UI what was inferred. Newest first. |
| `costPerTrainingHour` | headline-currency `training + coaching` ÷ hours of **completed** sessions in the window; `training_hours_none` otherwise. |
| `stringingPerHour` | string jobs carrying **both** a cost and hours (EUR); fallback: finance `stringing` rows over all logged hours. Never both — that counts a restring twice. |
| `insights[]` (≤ 3, fixed priority) | `travel_share` (≥ 35 % of spend; with ≥ 2 costed trips, the cheapest-vs-average gap from real rows — no "nearer" claim without distance data), `category_doubled` (vs the previous window, same currency), `stringing_per_hour`, `most_expensive_tournament`, `new_category` (new this window and ≥ 20 %). |

**Confidence:** no entries in the window → low ("log your expenses"); < 10
entries or a single category → medium (says how many more); else high.

---

## Routes and authorization

All three: `GET`, `requireAuth` per route, zod-validated query, mounted at
`/api` in `index.ts` next to `stringSetupsRouter`. Authorization runs **before**
any of the player's rows are read (the tests assert no Prisma read on a 403).

| Route | Query | Who may read |
|---|---|---|
| `/api/players/:playerId/recommendations/strings` | `racketItemId?`, `breaksOften?`, `wantsArmComfort?`, `wantsMoreSpin?` (`true`/`false` literally — `"false"` is false), `priority?` | `assertCanActOnPlayer`: owner, actively assigned coach, active connection, consenting guardian |
| `/api/players/:playerId/recommendations/tournaments` | `horizonDays` 1–365, default 90 | `assertCanActOnPlayer` |
| `/api/players/:playerId/recommendations/money` | `window` month/season/year, default month | **owner or consenting guardian only** (`assertOwnerOrGuardian`, composed from `assertGuardianOf`) |

| Caller | strings | tournaments | money |
|---|---|---|---|
| unauthenticated | 401 | 401 | 401 |
| owner | 200 | 200 | 200 |
| consenting guardian | 200 | 200 | 200 |
| guardian without consent | 403 | 403 | 403 |
| actively assigned coach | 200 | 200 | **403** |
| active connection | 200 | 200 | 403 |
| stranger | 403 | 403 | 403 |

**Why a coach gets 403 on money.** The sprint document allows a coach to see a
player's finances only under an academy-level permission. No such permission
exists in the schema yet, and inventing a table for it is out of scope here, so
the narrower check stands until it does. The route test proves the narrower
path ran: on a coach's request the coach-assignment and connection tables are
never consulted, only guardianship.

**Racket selection** for strings: `racketItemId` if given (it must belong to
this player — otherwise 404, which confirms nothing about anyone else's bag);
else the player's most recently strung racket; else the first racket item; else
404 with a plain "add a racket first" message. A racket with no linked product
runs with the band unknown and says so.

---

## What v1 deliberately does not do

- **No AI phrasing, no `/explain`.** Every sentence is a template over the inputs. An AI layer, if it comes, will paraphrase these structured reasons — never generate advice.
- **No budget model, no what-if, no compare.** The users are players, parents and coaches, not analysts; the sprint's owner decision is recommendation first.
- **No caching tables.** `TournamentRecommendation` / `GearRecommendation` from the sprint document are not created; results are computed at read time and versioned.
- **No home location.** There is no profile field for it, so distance is scored as unknown rather than guessed from a city name.
- **No currency conversion**, no entry-fee estimates (events do not carry a fee), no restring cadence from a single job, no eligibility call from an age category it cannot parse.
- **No medical language.** One caution, no condition ever named.
