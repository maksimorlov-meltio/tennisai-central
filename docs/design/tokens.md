# TennisAI — Design tokens

Status: the tokens as shipped after the Wave 1 accessibility pass (2026-09-05). Every
value below is measured, not eyeballed; the numbers come from
`scripts/contrast-audit.mts` and are re-asserted in CI by the tests listed at the end.

The identity has not moved: warm paper / ink, one matte forest-green accent, sharp
corners, thin ruled borders, red reserved for delete. What moved is *lightness* on a few
dark-theme tokens, so that every foreground/background pair the app renders clears
WCAG 2.1 AA in both themes.

**Where they live.** `src/index.css` — `:root` is the light theme, `.dark` the dark
theme. Every token is an HSL triplet without the `hsl()` wrapper, so Tailwind can add an
alpha (`bg-primary/10`). `tailwind.config.ts` maps them to utilities (`bg-primary`,
`text-muted-foreground`, `border-border`, `ring-ring`, `bg-sidebar-accent`, …). Never
hard-code a hex in a component; the one sanctioned exception is the calendar palette in
`src/lib/calendar/colors.ts`, which is applied through inline styles because Tailwind
cannot generate runtime colours.

---

## 1. Tokens and their roles

Light is `:root`, dark is `.dark`. Hex is the rendered colour, for reference only.

### Surfaces and text

| Token | Role | Light | Dark |
|---|---|---|---|
| `--background` | Page ground, the "paper" | `40 33% 97%` #faf8f5 | `0 0% 7%` #121212 |
| `--foreground` | Body text, the "ink" | `0 0% 9%` #171717 | `40 20% 92%` #efece7 |
| `--card` / `--card-foreground` | Cards, table surfaces, calendar cells | `40 33% 99%` #fdfdfc / #171717 | `0 0% 9%` #171717 / #efece7 |
| `--popover` / `--popover-foreground` | Menus, selects, tooltips, dialogs | `40 33% 99%` #fdfdfc / #171717 | `0 0% 9%` #171717 / #efece7 |
| `--muted` / `--muted-foreground` | Quiet panels; secondary text and metadata | `40 16% 93%` #f0eeea / `0 0% 40%` #666666 | `0 0% 15%` #262626 / `0 0% 62%` #9e9e9e |
| `--secondary` / `--secondary-foreground` | Secondary buttons, chips | `40 16% 92%` #eeece7 / #171717 | `0 0% 15%` #262626 / #efece7 |
| `--accent` / `--accent-foreground` | Hover rows, highlighted menu items | `40 16% 91%` #ece9e4 / #171717 | `0 0% 16%` #292929 / #efece7 |
| `--border` | Rules, card edges | `40 14% 86%` #e0ddd6 | `0 0% 18%` #2e2e2e |
| `--input` | Form-control borders | `40 14% 84%` #dcd8d0 | `0 0% 18%` #2e2e2e |
| `--surface-elevated` / `--surface-sunken` | Rare: raised / recessed panels | #ffffff / #f6f7f9 | #151923 / #090b11 |
| `--radius` | Corner radius (the whole `rounded-*` scale maps here) | `0rem` | `0rem` |

`--border` and `--input` are *not* held to a contrast floor — they are 1px rules whose
job is to be quiet (≈1.3:1). A control's affordance never rests on its border alone: it
has a label, a fill or a focus ring.

### Accent

| Token | Role | Light | Dark |
|---|---|---|---|
| `--primary` | The one accent: filled buttons, active nav, selections, links, chart line | `146 24% 33%` #406851 | `146 22% 50%` #639c7c |
| `--primary-foreground` | Text on a `--primary` fill | `0 0% 100%` #ffffff | `0 0% 7%` #121212 |
| `--ring` | Focus indicator (always equals `--primary`) | `146 24% 33%` #406851 | `146 22% 50%` #639c7c |

**Why the dark accent changed.** The dark green was `146 22% 46%` (#5b8f72) with white
text. White on it measured **3.74:1** — a filled button failed AA. No single lightness
lets white text on the fill *and* green text on the page both clear 4.5:1, so the fill
went to 50 % and its text flipped to ink: ink on #639c7c is 5.87:1, and green as text on
`--background` is also 5.87:1. Visually it is the same matte green, one step lighter.
`--sidebar-primary*` and `--ring` follow it.

### Destructive

| Token | Role | Light | Dark |
|---|---|---|---|
| `--destructive` | Delete / danger **only** — never a general accent, never a selection | `6 78% 42%` #bf2818 | `6 72% 62%` #e46658 |
| `--destructive-foreground` | Text on a destructive fill | `0 0% 100%` #ffffff | `0 0% 7%` #121212 |

Same reasoning as the accent. Light went 47 % → 42 % so the `/90` hover fill and the
`/10` error-banner tint both pass; dark went from #ba2c1c (which read **3.09:1** as error
text on the page) to a lighter red with ink text. The `text-destructive` +
`bg-destructive/10` error banner — the pattern every auth page uses — is 4.78:1 light and
5.08:1 dark.

### Sidebar

| Token | Light | Dark |
|---|---|---|
| `--sidebar-background` | `40 30% 95%` #f6f4ee | `0 0% 9%` #171717 |
| `--sidebar-foreground` | `0 0% 20%` #333333 | `40 20% 88%` #e7e2da |
| `--sidebar-primary` / `-foreground` | #406851 / #ffffff | #639c7c / #121212 |
| `--sidebar-accent` / `-foreground` | `40 16% 90%` #eae7e1 / #171717 | `0 0% 15%` #262626 / #efece7 |
| `--sidebar-border` | #e0ddd6 | #2e2e2e |
| `--sidebar-ring` | #406851 | #639c7c |

### Calendar palette (theme-aware, used as chip *text* and *border*)

Same hue and saturation in both themes; only lightness is tuned per theme. Consumed via
`colors.ts` as `hsl(var(--cal-…))`.

| Token | Meaning | Light | Dark |
|---|---|---|---|
| `--cal-event-training` | steel blue | `210 29% 42%` #4c6b8a | `210 29% 53%` #6487aa |
| `--cal-event-tournament` | violet | `258 20.8% 47.1%` #6e5f91 | `258 20.8% 58%` #8b7eaa |
| `--cal-event-match` | rust | `16.3 40.7% 46%` #a55f46 | `16.3 40.7% 53%` #b87156 |
| `--cal-event-travel` | amber | `39.2 51.2% 37%` #8f6d2e | `39.2 51.2% 50.2%` #c1943f |
| `--cal-event-recovery` | sage | `152.5 20.2% 40%` #517b68 | `152.5 20.2% 46.7%` #5f8f79 |
| `--cal-fed-atp` | blue | `215.5 36% 38.6%` #3f5c86 | `215.5 36% 55%` #6385b6 |
| `--cal-fed-wta` | purple | `272.7 23% 46.9%` #7a5c93 | `272.7 23% 57%` #9478ab |
| `--cal-fed-itf` | teal | `172 37.3% 35%` #387b72 | `172 37.3% 41.5%` #429187 |
| `--cal-fed-itf-junior` | green-teal (ITF sibling) | `156 37.3% 33%` #35745a | `156 37.3% 42%` #439373 |
| `--cal-fed-utr` | orange | `27.7 45.5% 41%` #986539 | `27.7 45.5% 49.6%` #b87a45 |
| `--cal-fed-usta` | rose | `335.6 31.8% 50%` #a85778 | `335.6 31.8% 57%` #b46e8b |

**The binding surface in dark is `--card`, not `--background`.** The dark values had
been tuned against the page (#121212), but chips sit inside calendar cells and cards,
which are `--card` (#171717) — lighter, so every hue lost ~0.2 and eight of eleven fell
to ≈4.4:1. Each dark value was raised 1.5–3 L until it clears 4.5:1 against `--card`;
against `--background` they then pass with margin.

**Raw hex in `colors.ts`** (`ENTITY_PALETTE` for player/team identity, `SURFACE_COLOR`
for court tints) is theme-independent and used only as *graphics* — 8 px dots, left
bars, tinted fills — so it is held to the 3:1 non-text floor against both backgrounds in
both themes. One entry moved: the amber #c1943f measured 2.62:1 on paper and is now
#ad8430 (3.24:1).

### Decorative (not audited)

`--tennis-ball`, `--court-clay`, `--court-grass`, `--court-hard`, `--court-line`,
`--net-shadow` paint the ambient court background, the SurfacePicker fallback tiles and
the landing artwork. Nothing that must be read is drawn in them. If one is ever used as
text or as a meaningful icon, add it to the audit first (section 7).

---

## 2. Contrast — the measured pairs

Floors: 4.5:1 for text, 3:1 for large text and non-text UI (focus rings, icons, chart
marks, palette dots). "Tint" rows composite the translucent fill over its surface first
(sRGB alpha), which is what the eye actually sees for `bg-primary/10`-style badges.

Before the pass, 21 of 92 pairs failed (all listed in the commit `a11y: bring every
token pair to WCAG AA in both themes`). After:

| Pair | Role (floor) | Light | Dark | Verdict |
|---|---|---:|---:|---|
| --foreground on --background | text (4.5) | 16.91 | 15.90 | pass |
| --foreground on --card | text (4.5) | 17.61 | 15.21 | pass |
| --foreground on --muted | text (4.5) | 15.47 | 12.84 | pass |
| --foreground on --accent (hover rows) | text (4.5) | 14.81 | 12.35 | pass |
| --muted-foreground on --background | text (4.5) | 5.42 | 6.99 | pass |
| --muted-foreground on --card | text (4.5) | 5.64 | 6.69 | pass |
| --muted-foreground on --muted | text (4.5) | 4.96 | 5.65 | pass |
| --muted-foreground on --secondary | text (4.5) | 4.86 | 5.65 | pass |
| --muted-foreground on --accent (hover rows) | text (4.5) | 4.74 | 5.43 | pass |
| --card-foreground on --card | text (4.5) | 17.61 | 15.21 | pass |
| --popover-foreground on --popover | text (4.5) | 17.61 | 15.21 | pass |
| --secondary-foreground on --secondary | text (4.5) | 15.19 | 12.84 | pass |
| --accent-foreground on --accent | text (4.5) | 14.81 | 12.35 | pass |
| --primary-foreground on --primary (buttons, active nav) | text (4.5) | 6.33 | 5.87 | pass |
| --primary-foreground on --primary/90 (button hover) | text (4.5) | 5.08 | 4.95 | pass |
| --primary as text on --background (links, text-primary) | text (4.5) | 5.97 | 5.87 | pass |
| --primary as text on --card | text (4.5) | 6.22 | 5.61 | pass |
| --primary as text on --muted | text (4.5) | 5.46 | 4.74 | pass |
| --primary as text on --primary/10 tint over --background (badges) | text (4.5) | 5.22 | 5.19 | pass |
| --primary as text on --primary/10 tint over --card (badges in cards) | text (4.5) | 5.40 | 4.94 | pass |
| --primary as UI/graphic on --background (chart line, icons) | ui (3) | 5.97 | 5.87 | pass |
| --primary as UI/graphic on --card | ui (3) | 6.22 | 5.61 | pass |
| --destructive-foreground on --destructive (delete buttons) | text (4.5) | 5.95 | 5.66 | pass |
| --destructive-foreground on --destructive/90 (hover) | text (4.5) | 5.15 | 4.79 | pass |
| --destructive as text on --background (error text) | text (4.5) | 5.61 | 5.66 | pass |
| --destructive as text on --card | text (4.5) | 5.84 | 5.41 | pass |
| --destructive as text on --destructive/10 tint over --background (error banners) | text (4.5) | 4.78 | 5.08 | pass |
| --destructive as text on --destructive/10 tint over --card | text (4.5) | 4.99 | 4.80 | pass |
| --ring on --background (focus indicator) | ui (3) | 5.97 | 5.87 | pass |
| --ring on --card | ui (3) | 6.22 | 5.61 | pass |
| --ring on --popover | ui (3) | 6.22 | 5.61 | pass |
| --input border on --background | info (—) | 1.34 | 1.38 | info |
| --border on --background | info (—) | 1.28 | 1.38 | info |
| --sidebar-foreground on --sidebar-background | text (4.5) | 11.49 | 13.91 | pass |
| --sidebar-primary-foreground on --sidebar-primary | text (4.5) | 6.33 | 5.87 | pass |
| --sidebar-accent-foreground on --sidebar-accent | text (4.5) | 14.53 | 12.84 | pass |
| --sidebar-primary as text on --sidebar-background | text (4.5) | 5.76 | 5.61 | pass |
| --sidebar-ring on --sidebar-background | ui (3) | 5.76 | 5.61 | pass |
| --cal-event-training as text on --background | text (4.5) | 5.24 | 4.98 | pass |
| --cal-event-training as text on --card | text (4.5) | 5.46 | 4.77 | pass |
| --cal-event-tournament as text on --background | text (4.5) | 5.34 | 5.05 | pass |
| --cal-event-tournament as text on --card | text (4.5) | 5.56 | 4.83 | pass |
| --cal-event-match as text on --background | text (4.5) | 4.58 | 4.94 | pass |
| --cal-event-match as text on --card | text (4.5) | 4.77 | 4.72 | pass |
| --cal-event-travel as text on --background | text (4.5) | 4.51 | 6.76 | pass |
| --cal-event-travel as text on --card | text (4.5) | 4.69 | 6.47 | pass |
| --cal-event-recovery as text on --background | text (4.5) | 4.52 | 5.08 | pass |
| --cal-event-recovery as text on --card | text (4.5) | 4.71 | 4.86 | pass |
| --cal-fed-atp as text on --background | text (4.5) | 6.42 | 4.96 | pass |
| --cal-fed-atp as text on --card | text (4.5) | 6.68 | 4.75 | pass |
| --cal-fed-wta as text on --background | text (4.5) | 5.24 | 4.94 | pass |
| --cal-fed-wta as text on --card | text (4.5) | 5.46 | 4.72 | pass |
| --cal-fed-itf as text on --background | text (4.5) | 4.67 | 5.02 | pass |
| --cal-fed-itf as text on --card | text (4.5) | 4.86 | 4.81 | pass |
| --cal-fed-itf-junior as text on --background | text (4.5) | 5.22 | 5.05 | pass |
| --cal-fed-itf-junior as text on --card | text (4.5) | 5.43 | 4.83 | pass |
| --cal-fed-utr as text on --background | text (4.5) | 4.66 | 5.27 | pass |
| --cal-fed-utr as text on --card | text (4.5) | 4.85 | 5.04 | pass |
| --cal-fed-usta as text on --background | text (4.5) | 4.61 | 4.95 | pass |
| --cal-fed-usta as text on --card | text (4.5) | 4.80 | 4.73 | pass |
| ENTITY_PALETTE #4c6b8a on --background | ui (3) | 5.24 | 3.37 | pass |
| ENTITY_PALETTE #4c6b8a on --card | ui (3) | 5.46 | 3.22 | pass |
| ENTITY_PALETTE #b4694d on --background | ui (3) | 3.91 | 4.52 | pass |
| ENTITY_PALETTE #b4694d on --card | ui (3) | 4.07 | 4.33 | pass |
| ENTITY_PALETTE #5f8f79 on --background | ui (3) | 3.48 | 5.08 | pass |
| ENTITY_PALETTE #5f8f79 on --card | ui (3) | 3.63 | 4.86 | pass |
| ENTITY_PALETTE #ad8430 on --background | ui (3) | 3.24 | 5.46 | pass |
| ENTITY_PALETTE #ad8430 on --card | ui (3) | 3.37 | 5.22 | pass |
| ENTITY_PALETTE #6e5f91 on --background | ui (3) | 5.34 | 3.31 | pass |
| ENTITY_PALETTE #6e5f91 on --card | ui (3) | 5.56 | 3.17 | pass |
| ENTITY_PALETTE #4f8a86 on --background | ui (3) | 3.73 | 4.74 | pass |
| ENTITY_PALETTE #4f8a86 on --card | ui (3) | 3.88 | 4.53 | pass |
| ENTITY_PALETTE #a85778 on --background | ui (3) | 4.61 | 3.84 | pass |
| ENTITY_PALETTE #a85778 on --card | ui (3) | 4.80 | 3.67 | pass |
| ENTITY_PALETTE #5d6ba0 on --background | ui (3) | 4.86 | 3.64 | pass |
| ENTITY_PALETTE #5d6ba0 on --card | ui (3) | 5.06 | 3.48 | pass |
| ENTITY_PALETTE #7d914f on --background | ui (3) | 3.28 | 5.38 | pass |
| ENTITY_PALETTE #7d914f on --card | ui (3) | 3.42 | 5.15 | pass |
| ENTITY_PALETTE #3f8a80 on --background | ui (3) | 3.84 | 4.60 | pass |
| ENTITY_PALETTE #3f8a80 on --card | ui (3) | 4.00 | 4.40 | pass |
| ENTITY_PALETTE #a67a45 on --background | ui (3) | 3.61 | 4.90 | pass |
| ENTITY_PALETTE #a67a45 on --card | ui (3) | 3.76 | 4.69 | pass |
| ENTITY_PALETTE #a05563 on --background | ui (3) | 4.98 | 3.55 | pass |
| ENTITY_PALETTE #a05563 on --card | ui (3) | 5.19 | 3.39 | pass |
| SURFACE_COLOR #b06a45 on --background | ui (3) | 3.97 | 4.45 | pass |
| SURFACE_COLOR #b06a45 on --card | ui (3) | 4.13 | 4.26 | pass |
| SURFACE_COLOR #4c6b8a on --background | ui (3) | 5.24 | 3.37 | pass |
| SURFACE_COLOR #4c6b8a on --card | ui (3) | 5.46 | 3.22 | pass |
| SURFACE_COLOR #5f8f62 on --background | ui (3) | 3.54 | 4.99 | pass |
| SURFACE_COLOR #5f8f62 on --card | ui (3) | 3.69 | 4.77 | pass |
| SURFACE_COLOR #6e5f91 on --background | ui (3) | 5.34 | 3.31 | pass |
| SURFACE_COLOR #6e5f91 on --card | ui (3) | 5.56 | 3.17 | pass |

92 pairs, 0 failing. Several calendar hues sit at 4.5–4.8 by design: they are as
saturated as the matte palette allows while still passing, and going lighter/darker would
make the eleven hues harder to tell apart. Do not "improve" one without re-running the
whole table — the palette is a set.

---

## 3. Focus

One rule, in `src/index.css` under `@layer base`:

```css
:where(a, button, input, select, textarea, summary,
       [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

- It is the **floor**, not the design. shadcn primitives paint their own Tailwind ring
  (`focus-visible:ring-2 ring-ring ring-offset-2`), and utilities beat a zero-specificity
  `:where()` rule, so they are untouched. The floor catches what had nothing — NavLinks,
  links in prose, the calendar's bare `<button>` day cells and chips, `role="button"`
  rows.
- `:focus-visible`, never `:focus`: a mouse click does not paint a ring; a keyboard does.
  The primitives that used `focus:` (select trigger, dialog/sheet close, badge,
  navigation-menu trigger) were moved to `focus-visible:` for the same reason.
- **Roving-tabindex items are excluded on purpose.** Radix menu, select and menubar
  items are `tabindex="-1"` and receive focus by arrow key; they ring themselves with
  `focus-visible:ring-1 ring-inset ring-ring`. Their old indicator, `focus:bg-accent`,
  measured ≈1.2:1 against the popover — invisible.
- Radix `FocusScope` focuses `DialogContent` itself when a dialog opens. An unscoped
  `*:focus-visible` rule would box the whole dialog in green; the `:where()` list is why
  it does not.
- `outline: none` is allowed only next to a replacement on the same element (the
  `outline-none focus-visible:ring-…` pattern). `ui/command.tsx`'s input keeps the dialog
  frame as its indicator; `ui/chart.tsx` removes Recharts' SVG outline (not focusable).
- The ring colour is `--ring` = `--primary`, which is 5.97:1 / 5.87:1 against the page —
  above the 3:1 non-text floor with margin in both themes.

Verified 1440×900 with Playwright: four dashboards, the calendar, the New-training
dialog, the player-stats sheet — every stop in the tab order paints an outline or a ring
(logs in the Wave 1 report). One false alarm to know about: `SurfacePicker` tiles carry
`transition-all`, so the outline *fades in* over 150 ms; a probe that reads the computed
style on the same tick as the Tab sees `0px`. Wait for the transition, and it is there.

---

## 4. Forms — labels, required, errors

- **Every control has a programmatic name.** `<Label htmlFor="x">` ↔ `id="x"` on the
  `Input` / `Textarea` / `SelectTrigger` / `Switch`. When there is no visible label
  (search boxes, filter comboboxes, icon-only buttons) use `aria-label` — through `t()`,
  under the `a11y` namespace in `src/locales/{en,es}.json`. A placeholder is not a
  label; a `title` is not a name.
- **Required** fields keep the visible `*` in the label *and* carry
  `aria-required="true"`. Not the native `required`: these forms submit from an
  `onClick`, and native `required` would switch on browser validation bubbles and change
  how they behave.
- **Errors.** In shadcn `Form` (`src/components/ui/form.tsx`) the wiring is already
  there — `FormControl` sets `aria-describedby` to the description and message ids and
  `aria-invalid` when the field has an error; `FormMessage` renders the error with that
  id. Use it. On raw-input pages, a form-level failure is a `<div role="alert">` in the
  `text-destructive bg-destructive/10` banner style that mounts only while an error
  exists — so it is announced exactly once per failure and never on page load.
- **Icon-only controls** are named for what they do *to what*: "Rename team {name}",
  "Delete team {name}", "Copy public ID" (which flips to "Public ID copied" so the
  outcome is announced without a toast).
- **Toggles** are named by their row label: `<Label htmlFor>` ↔ `<Switch id>`.

---

## 5. Live regions

Rules of the house:

| Situation | Markup | Politeness |
|---|---|---|
| Something finished, saved, sent | toast | `polite` — say it when the user pauses |
| Something failed | toast or inline banner | `assertive` (toast) / `role="alert"` (banner, mounted on failure) |
| Content is loading | the loading component | `aria-busy="true"` on the region + one sr-only "Loading…" in a `polite` region |
| A count/summary changed while the user typed | the summary element | `role="status"` (implicitly polite, atomic) |

Rationale: assertive interrupts whatever the screen reader is saying. It is right for a
failed save and wrong for "Training created". Live regions announce *changes*, so the
element must exist before the text arrives (a persistent `role="status"` node) — or, for
one-shot alerts, mount with its text and unmount when cleared.

**Current state (measured 2026-09-05, both toast systems are mounted in `App.tsx`):**

- **Radix toaster** (`hooks/use-toast.ts` → `ui/toast.tsx` / `ui/toaster.tsx`). Radix
  announces through a hidden `<span role="status" aria-live=…>`, with `aria-live` set by
  the `Toast` `type` prop: `"foreground"` → **assertive**, `"background"` → polite. The
  default is `"foreground"`, so today *every* Radix toast interrupts, success included.
  Fix (owner: D, `ui/toaster.tsx`): `type={variant === "destructive" ? "foreground" :
  "background"}` on each `<Toast>` — destructive stays assertive, everything else becomes
  polite. No other change; the visible `<li>` correctly stays `aria-live="off"`.
- **sonner 1.7.4** (`ui/sonner.tsx`). The `<section aria-label="Notifications alt+T">`
  is `aria-live="polite" aria-relevant="additions text"`; individual toasts have no
  role or live attribute and sonner has no per-toast politeness knob. So `toast.error`
  is announced politely. Acceptable minimum: leave it. Preferred (owner: D): a persistent
  visually-hidden `<div role="alert">`-style announcer mounted once in `App.tsx`, and a
  thin wrapper that mirrors `toast.error(...)` text into it (clear, then set on the next
  frame, so repeated identical errors re-announce).
- **`LoadingState`** (`ui/shared.tsx`, owner D). The skeleton variant is right:
  `aria-busy="true" aria-live="polite"` plus `<span class="sr-only">Loading…</span>`.
  The spinner variant has `aria-busy` but no announced text — add `role="status"` and
  the same sr-only message. `PageSkeleton` already matches the skeleton variant.
- **`ErrorState`** (`ui/shared.tsx`, owner D). No live role. Add `role="alert"` on its
  root: it mounts on failure and fires once, which is what an error deserves. Its retry
  is a bare `<button>`, so the focus floor already rings it.
- Already correct, leave alone: the four auth error banners (`role="alert"`), the
  password-rules list (`aria-live="polite"`), `DraftRestoredNotice` and the command
  palette result count (`role="status"`).

---

## 6. Type scale

One scale — Tailwind's named steps, Inter throughout (headings 800, `-0.02em`):

| Class | px | Used for |
|---|---|---|
| `text-xs` | 12 | metadata, badges, table captions — the **floor** for body copy |
| `text-sm` | 14 | body, list rows, inputs on desktop |
| `text-base` | 16 | landing copy, inputs on mobile (stops iOS focus-zoom) |
| `text-lg` | 18 | card titles |
| `text-xl` | 20 | page titles on mobile |
| `text-2xl` | 24 | page titles |
| `text-3xl`+ | 30… | landing display only |

**Two dense-grid exceptions, and only two:** `text-[10px]` and `text-[11px]`, used where
the 7-column month grid genuinely cannot afford 12 px on desktop — day-of-week headers,
`+N more`, chip captions, legends (≈140 sites). Nothing renders below 10 px. On phones
those sites should read `text-xs md:text-[10px]` (the mobile spec, §5 of
`mobile-and-desktop.md`).

The audit that established this found three outliers, now fixed: the mini-calendar
weekday header at 9 px (→ 10 px), the landing's feature copy at 15 px (→ `text-base`),
and shadcn's unused `ui/calendar.tsx` at `0.8rem` (exempted by name, with its reason).

**Spacing rhythm** is the 4 px grid through Tailwind's named steps (`0.5 / 1 / 1.5 / 2 /
3 / 4 / 5 / 6 …`). Desktop density is `p-6` page padding, `space-y-6` between sections,
`gap-4` in card grids, `h-10` buttons and `h-8`/`h-9` toolbar controls; mobile loosens
vertically and tightens horizontally (`p-4`, `space-y-4`, `gap-3`, `min-h-12` rows). The
only arbitrary spacing tolerated is a 1 px hairline (`p-[1px]`).

Neither the font sizes nor the spacing steps are redeclared in `tailwind.config.ts`: the
values already *are* Tailwind's defaults, so redeclaring them would be a no-op, and
introducing new names with no migration would be dead config.

**Guarded in CI** by `src/lib/a11y/__tests__/typeScale.test.ts`, which walks `src/` and
fails on any arbitrary `text-[…]` other than 10/11 px, on anything under 10 px, and on
any arbitrary padding/margin/gap other than a 1 px hairline.

---

## 7. How to add a colour

1. **Ask whether you need one.** Most "new colour" requests are a role that an existing
   token already plays (a hover is `--accent`, a quiet panel is `--muted`, a success
   state is `--primary`). The palette is intentionally small; a new token is a
   maintenance cost in two themes forever.
2. **Add it to both themes** in `src/index.css` — `:root` *and* `.dark` — as an HSL
   triplet, with a comment saying what it is for. Keep the same hue and saturation in
   both themes and tune lightness only; that is what keeps the two themes feeling like
   one product.
3. **Map it in `tailwind.config.ts`** under `theme.extend.colors` as
   `"hsl(var(--your-token))"` (with a `foreground` pair if anything will be written on
   it). Calendar hues skip this step and are consumed through `colors.ts` instead.
4. **Add its pairs to `scripts/contrast-audit.mts`** — every surface it will be
   *text* on (4.5:1) and every surface it will be a *graphic* on (3:1) — and run it:

   ```
   node --experimental-strip-types scripts/contrast-audit.mts
   ```

   It prints the Markdown table and exits 1 on any failure. Paste the table into your
   PR. If a pair fails, move lightness, not hue; if a fill and its text cannot both pass
   at any lightness, flip the text to ink (see `--primary` in dark).
5. **If it is a calendar or palette colour**, `src/lib/calendar/__tests__/
   paletteContrast.test.ts` will assert it in CI automatically (it reads `--cal-*` from
   `index.css` and the hex lists from `colors.ts`); nothing to register.
6. **Never hard-code the hex** in a component. If Tailwind cannot express it (a runtime
   colour), go through a helper in `colors.ts` and an inline `style`, as the calendar
   does.
7. **Update the table in this file.**

---

## 8. Tooling

| What | Where | Runs |
|---|---|---|
| Colour maths (HSL/hex parse, luminance, contrast, alpha composite, `index.css` token reader) | `src/lib/a11y/contrast.ts` | imported by everything below; 26 unit tests in `__tests__/contrast.test.ts` |
| Full 92-pair audit, human-readable table | `scripts/contrast-audit.mts` | by hand, when a token or palette hex moves |
| Calendar palette floor (`--cal-*` as text 4.5:1 against `--background` and `--card`; `ENTITY_PALETTE` / `SURFACE_COLOR` as graphics 3:1), both themes | `src/lib/calendar/__tests__/paletteContrast.test.ts` | CI (`npm test`) |
| Type scale + spacing rhythm | `src/lib/a11y/__tests__/typeScale.test.ts` | CI (`npm test`) |
| Keyboard / name sweep (routes × roles, tab loops, dialog and sheet containment) | Playwright scripts in the sprint scratch folder; logs attached to the Wave 1 report | by hand before a release |
