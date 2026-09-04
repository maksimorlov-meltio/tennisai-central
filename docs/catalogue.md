# Gear catalogue

The shared, read-only-to-players product catalogue behind the Player Gear &
Advice feature: rackets, strings, shoes, balls and accessories, plus the record
of what a player actually had in their racket and when.

---

## The provenance rule

**Every product row carries where its numbers came from.** This is not
bookkeeping — a recommendation engine that tells a player to string at 21 kg is
giving advice about their elbow, and advice with no traceable origin is a guess
wearing a lab coat.

| Column | Meaning |
|---|---|
| `source` | Free text describing where the specification came from, e.g. `"Manufacturer specification page"`. Required. |
| `sourceUrl` | The page itself. Required, and must be a URL. |
| `lastVerifiedAt` | **Set only when that URL was actually retrieved and its numbers cross-checked.** `null` otherwise. |

`lastVerifiedAt` means *"this URL was retrieved and cross-checked on this date"*
— not *"every column below appeared on it"*. Where a row mixes fetched and
widely-published figures, `source` says which is which. A null is not a gap to
be tidied away; it is the row telling the truth about itself, and the API sends
it as an explicit `null` so a UI can say "unverified" rather than imply
freshness.

### Hard rules

- **Specifications only.** Never copy manufacturer marketing copy or product
  descriptions. They are someone else's writing.
- **Never store an image URL** unless the image is licensed for our use. The
  CSV import drops `imageUrl` unless the row also carries `licensed=true`.
- **Never scrape retailers.** Manufacturer specification pages only.
- **Prefer a gap to a guess.** If an optional field is uncertain, omit it. A
  required field must be a genuinely widely-published figure, and if it is not,
  the product does not belong in the catalogue yet.

### What the current seed actually claims

The seed writes 44 products. **Three** carry `lastVerifiedAt`: the three Babolat
frames whose specification page responded to an automated request. Every other
manufacturer site refused (403 / 404 / 429), so those 41 rows keep
`lastVerifiedAt = null` and say `"Manufacturer spec sheet — not fetched during
seed"` in `source`.

The 1–10 ratings on `StringSpec` are **editorial comparative estimates, not
manufacturer figures** — no manufacturer rating table was retrievable. Every
seeded string row says so in `source`. Any UI that displays them must label them
as estimates.

---

## Schema

```
EquipmentProduct ──1:1── RacketSpec      (category = "racket")
                 ──1:1── StringSpec      (category = "string")
                 ──1:1── ShoeSpec        (category = "shoes")
                 ──1:1── AccessorySpec   (category = "balls" | "accessories")

EquipmentProduct ──1:N── EquipmentItem   (productId, SetNull)
EquipmentProduct ──1:N── StringSetup     (mainsProductId / crossesProductId, SetNull)

StringSetup ──N:1── User          (playerId, Cascade)
            ──N:1── EquipmentItem (racketItemId, Cascade)
```

`category` uses the **same five values as the frontend `EquipmentItem.category`**:
`racket | string | shoes | balls | accessories`. Sub-kinds of accessory (grip,
dampener, bag, apparel) live in `AccessorySpec.attributes.kind` rather than
fragmenting the category list, so a player's own equipment list and the
catalogue can never disagree about what category a thing is in.

### The `variant = ""` convention

`EquipmentProduct.variant` is `String @default("")` — **never null.**

Postgres treats `NULL`s as *distinct* inside a unique index. With a nullable
variant, `("Wilson", "Pro Staff 97", NULL)` could be inserted an unlimited
number of times without ever tripping `@@unique([brand, model, variant])`, and
the upsert-on-conflict that the CSV import depends on would never fire — every
re-import would silently duplicate the catalogue.

So: **a product with no variant stores `""`.** The API reports a stored `""` as
an absent `variant`, and the CSV import defaults a missing `variant` column
to `""`.

### Units

- **Tension is kilograms, everywhere, always.** Nothing stores pounds. Clients
  that display pounds convert on read: `lbs = kg × 2.2046`. Storing both units
  would guarantee they eventually disagree, and the disagreement would be
  invisible.
- Weights are grams, lengths centimetres, balance and gauge millimetres, prices
  euros.
- Head size is stored in **both** cm² and in² rather than converted, because
  manufacturers publish one or the other and round-tripping the conversion turns
  97 in² into 96 in².

### `AccessorySpec.attributes` by `kind`

`attributes` is JSON. `kind` is always a string and is always present.

| `kind` | Shape |
|---|---|
| `grip` | `{ kind, gripType: "overgrip"\|"replacement", thicknessMm: number, packCount: number, material: string, tacky?: boolean }` |
| `dampener` | `{ kind, packCount: number, material: string, mounting?: string }` |
| `bag` | `{ kind, racketCapacity: number, compartments: number, insulatedCompartment?: boolean, shoeCompartment?: boolean }` |
| `apparel` | `{ kind, garment: string, material: string, fit?: string, sizes: string[] }` |
| `balls` | `{ kind, felt: "regular_duty"\|"extra_duty"\|"clay", pressurised: boolean, ballsPerCan: number, approval?: string, surface?: string }` |

New kinds are added by documenting them here first. An undocumented `kind` is a
bug, not a feature.

---

## Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/api/catalogue` | Bearer |
| GET | `/api/catalogue/facets` | Bearer |
| GET | `/api/catalogue/:id` | Bearer |
| GET/POST | `/api/players/:playerId/string-setups` | Bearer + owner / coach / consented guardian |
| PATCH/DELETE | `/api/string-setups/:id` | Bearer + owner / coach / consented guardian |
| POST | `/api/admin/catalogue/import` | Bearer + `admin` role |

### `GET /api/catalogue`

Only `isActive` products. Returns `{ data: { items, total, page, pageSize } }`;
each item is the product plus its one spec under `spec` and its provenance under
`provenance`.

| Query param | Notes |
|---|---|
| `category` | One of the five categories. |
| `brand` | Repeatable: `?brand=Wilson&brand=Head` is an OR. |
| `q` | Case-insensitive text over brand / model / variant. |
| `min…` / `max…` | For `headSizeIn2`, `unstrungWeightG`, `balanceMm`, `stiffnessRa`, `gaugeMm`, `recommendedTensionKg`, `weightG`. e.g. `minUnstrungWeightG=300`. |
| `material`, `shape`, `courtType`, `widthFit`, `targetLevel` | Repeatable select facets. |
| `sort` | `relevance` (default) · `weight` · `price` · `newest`. |
| `page`, `pageSize` | `pageSize` is **capped at 100** and defaults to 20. |

Two behaviours worth knowing:

- **`recommendedTensionKg` is an OVERLAP, not containment.** Asking for 23 kg
  returns every frame whose recommended 23–27 kg window includes it — not only
  frames whose whole window sits inside your filter. With no `category`, a
  product matches if *either* its racket spec *or* its string spec overlaps.
- **`sort=weight` is category-scoped.** Frame weight for rackets, shoe weight
  for shoes. They are different columns on different tables and there is no
  honest way to interleave them.
- **`sort=relevance` is currently a stable alphabetical order**, not a scored
  ranking. There is no full-text index yet. It is named for the slot it will
  fill.

### `GET /api/catalogue/facets`

Same filters. Returns `{ data: { facets, ranges } }` — counts per value for
`brand, category, material, shape, courtType, widthFit, targetLevel`, and
`{ min, max }` for each numeric range. A range with no matching rows reports
`null`, not `0` (`0` would read as "the lightest racket weighs nothing").

Aggregation happens **in the database** (`groupBy` / `aggregate`), never by
loading the table into JS. The table is small today; the shape is what has to
scale.

Each facet is counted under the **full current filter, including that facet's
own selection** — so selecting Wilson leaves Wilson as the only brand shown.
That is the honest count of what is on screen. A UI that wants the unselected
brands greyed-in should request facets without the brand filter.

### String setups

`POST` validates that `racketItemId` belongs to the player in the URL — without
that check, a coach assigned to one player could staple a stringing job onto a
stranger's racket. Tension is validated in **kg** (10–35; the bounds exist to
catch a pounds value typed into a kg field, not to have an opinion about how
someone strings).

**Retiring a setup is a `PATCH` with `retiredAt` + `retiredReason`**
(`broke | dead | switched | other`). There is no separate `/retire` endpoint:
retirement is a state the row moves into, and giving it its own verb invites a
second way to get it half-done. A `retiredAt` of `null` *is* what "current"
means; the API derives `isCurrent` from it rather than storing a flag that can
drift.

**Un-retiring is not supported. Omit `retiredAt`; do not send `null`.** A
`retiredAt: null` is rejected with a 400 rather than coerced — `new Date(null)`
is the 1970 epoch, and the usual `z.coerce.date()` would have accepted it
silently, leaving the row retired forever with a date nobody typed.

---

## CSV import

```
POST /api/admin/catalogue/import
Content-Type: text/csv
Authorization: Bearer <admin token>
```

- **Admin role only.** The role check runs before the body is parsed.
- **1 MB cap**, enforced on this route only. An oversize body gets `413`.
- Upserts on `(brand, model, variant)`.
- Returns `{ data: { imported, updated, rejected: [{ row, reason }] } }`.
- **`row` is the line number as a spreadsheet shows it** — the header is row 1,
  so the first data row is row 2. A rejection you cannot locate is barely a
  rejection.
- One bad row does not fail the upload. Good rows land; bad rows come back with
  a reason.

### Columns common to every category

| Column | Required | Notes |
|---|---|---|
| `category` | ✅ | `racket \| string \| shoes \| balls \| accessories` — decides which spec table the row fills. |
| `brand` | ✅ | |
| `model` | ✅ | |
| `variant` | | Defaults to `""`. |
| `source` | ✅ | **Required on every row.** No provenance, no import. |
| `sourceUrl` | ✅ | **Required on every row**, must be a URL. |
| `lastVerifiedAt` | | ISO date. Leave empty unless you actually checked the page. |
| `releaseYear` | | |
| `msrpEur` | | |
| `imageUrl` | | **Ignored unless `licensed=true` on the same row.** |
| `licensed` | | `true` to assert the image is licensed for our use. |

### `category=racket`

Required: `headSizeCm2`, `headSizeIn2`, `lengthCm`, `unstrungWeightG`,
`balanceMm`, `beamMm`, `stringPatternMains`, `stringPatternCrosses`,
`recommendedTensionMinKg`, `recommendedTensionMaxKg`, `targetLevel`
(`beginner|intermediate|advanced|pro`).

Optional: `strungWeightG`, `balancePtsHL`, `swingweight`, `stiffnessRa`,
`composition`, `gripSizes` (pipe-separated, e.g. `L1|L2|L3`).

### `category=string`

Required: `material` (`polyester|co_polyester|multifilament|synthetic_gut|natural_gut|kevlar|hybrid_set`),
`gaugeMm`, `gaugeLabel`, `shape` (`round|hexagonal|pentagonal|octagonal|twisted|textured`),
`power`, `control`, `spin`, `comfort`, `durability`, `tensionMaintenance` (each 1–10),
`recommendedTensionMinKg`, `recommendedTensionMaxKg`.

Optional: `coating`, `colour`, `hybridPartnerNote`.

### `category=shoes`

Required: `courtType` (`clay|hard|all_court|grass|carpet|indoor`), `weightG`,
`widthFit` (`narrow|standard|wide`), `cushioning`, `stability` (`low|medium|high`).

Optional: `dropMm`, `outsoleGuaranteeMonths`, `sizesEu` (pipe-separated).

### `category=balls` and `category=accessories`

Required: `attributesJson` — a JSON **object** containing at least a string
`kind`. Shapes are documented above. In CSV, quote the cell and double the inner
quotes:

```csv
category,brand,model,source,sourceUrl,attributesJson
accessories,Wilson,Pro Overgrip,Manufacturer specification page,https://example.com/x,"{""kind"":""grip"",""gripType"":""overgrip"",""thicknessMm"":0.55,""packCount"":3,""material"":""Polyurethane""}"
```

### Running an import

```bash
curl -X POST http://localhost:4000/api/admin/catalogue/import \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: text/csv" \
  --data-binary @rackets.csv
```

Example `rackets.csv`:

```csv
category,brand,model,variant,source,sourceUrl,headSizeCm2,headSizeIn2,lengthCm,unstrungWeightG,balanceMm,beamMm,stringPatternMains,stringPatternCrosses,recommendedTensionMinKg,recommendedTensionMaxKg,gripSizes,targetLevel
racket,Head,Radical MP,Auxetic,Manufacturer specification page,https://example.com/radical,632,98,68.5,300,320,20/23/21,16,19,23,27,L1|L2|L3|L4,intermediate
```

The parser handles quoted fields, commas and newlines inside quotes, `""` as an
escaped quote, CRLF or LF, and a UTF-8 BOM (Excel writes one, and without
stripping it the first column name mysteriously stops existing).

---

## Finance categories

`FinanceEntry.category` grew with this wave. **Nothing was renamed** — every row
already written stays valid:

- Original: `training`, `travel`, `tournament`, `equipment`
- Added: `coaching`, `stringing`, `tournament_fee`, `accommodation`, `food`,
  `membership`, `other`

`FinanceEntry.currency` now defaults to **`EUR`** for new rows. **Existing rows
were not updated** — a stored amount means what it meant when it was entered,
and re-labelling one changes what it says. The migration alters the column
default and runs no `UPDATE`.

`FinanceEntry.tournamentId` optionally links a cost to the event it belongs to,
so a tournament's true cost no longer has to be inferred from a date window —
which is wrong the moment a flight is booked two months early.
