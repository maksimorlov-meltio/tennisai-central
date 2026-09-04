# TennisAI — Mobile & Desktop Design Spec

Status: design direction, ready to implement. Written 2026-09-04 against the app as it
stands (audit at 375x812). No source files were changed to produce this.

**Who this is for.** Two people, not one.

- **The coach.** Desktop at home in the evening — planning, reviewing, assigning. Phone
  courtside during the day — one hand, sunlight, a glance between points. He *plans* on
  desktop and *checks and logs* on phone. He almost never plans on the phone.
- **The teenage player.** Phone, essentially always. Everything they do — see what's on,
  see what the coach wrote, log a match — happens on a phone, often in a car or a
  clubhouse.

That split is the whole spec. Desktop is a **planning surface** and must stay dense and
information-rich. Mobile is a **glance-and-log surface** and must be sparse, tappable and
readable in direct sun. Where the two want different things, we build two things at one
seam rather than one thing that bends.

---

## 0. Non-negotiables (read before touching anything)

1. **Desktop at `md`+ must be byte-identical after this work.** Every rule below is
   either a `<md`-only override or an addition behind `useIsMobile()`. If a change alters
   what a 1440px window renders, it is out of scope. Section 6 lists what must not move.
2. **No new dependencies.** Everything here is buildable from primitives already in
   `src/components/ui/` — `drawer.tsx` (vaul 0.9.9 is already installed), `sheet.tsx`,
   `toggle-group.tsx`, `scroll-area.tsx`, `tabs.tsx`, `dropdown-menu.tsx`.
3. **`--radius: 0rem`.** `tailwind.config.ts` remaps the entire `rounded-*` scale to that
   token. Do not spec or expect pill-shaped tab bars, rounded sheets or capsule buttons —
   this brand is square. Only `rounded-full` (avatars, dots, count badges) survives.
   **One live exception to fix:** `src/components/ui/drawer.tsx` line 34 carries
   `rounded-t-[10px]`. The remap only catches the *named* scale — an arbitrary `[10px]`
   bypasses it. Every bottom `Drawer` this spec asks for will ship rounded corners on a
   square brand unless you either fix the primitive (`rounded-t-none`, preferred — it has
   no current consumers to regress) or pass `rounded-none` at each call site.
4. **Named motion tokens only.** `tailwindcss-animate` silently swallows
   `duration-[220ms]` and `ease-[cubic-bezier(...)]` — they generate no CSS at all. Use
   `duration-120` / `duration-600` / `ease-editorial` from the theme.

---

## 1. Breakpoint strategy

### One number, used by both CSS and JS

`768px` — Tailwind `md`, and the value already hardcoded as `MOBILE_BREAKPOINT` in
`src/hooks/use-mobile.tsx`. **That is the only breakpoint at which behaviour changes.**
CSS `md:` and `useIsMobile()` must never disagree; if one moves, both move.

`sm` (640) and `lg` (1024) stay what they are today: **pure reflow**. Card grids go 1 → 2
→ 3 columns, the calendar's mini-calendar column appears at `lg`. No component is swapped
at those points, and none should be added.

### The rule for "reflow" vs "swap"

> Reflow (CSS only) when the same information, in the same order, still reads at 375px.
> Swap the component when the phone version answers a **different question** than the
> desktop one, or when the desktop interaction is physically impossible on touch.

"Physically impossible" is not rhetorical here: the calendar's reschedule and reassign
features use HTML5 drag-and-drop (`dataTransfer`, `onDragStart`/`onDrop` in
`CalendarPage.tsx` and `ReassignDropStrip`). HTML5 DnD does not fire on touch. Any port of
the month grid to mobile ships a feature that is dead on arrival — see §4.1.

### Which screens land where

**Swap the component at `<md` (behavioural):**

| Screen | What is swapped | Why |
|---|---|---|
| `/calendar` month + week views | → `MobileAgenda` (§4.1) | 7 columns cannot hold a title at 375px; DnD is dead on touch |
| Whole-app navigation | drawer → bottom tab bar + More (§3) | Courtside is one thumb; a drawer costs 2 taps per destination |
| `/tournaments` Globe tab | tab hidden | three.js on a phone GPU, and a pannable globe is not a courtside question |
| `/tournaments` Map tab | map full-bleed, results list into a `Drawer` | A 40%-height map is neither a map nor a list |
| Right-side sheets (`EventDetailDrawer`, `PlayerStatsDrawer`, `DayEventsSheet`) | `Sheet side="right"` → `Drawer` (bottom) | `w-3/4` from the right is a thumb-hostile 281px column |
| Filter toolbars (Calendar / Tournaments / Trainings) | inline row → one "Filters" button + bottom `Drawer` | 4–6 selects wrap to three rows and push content off-screen |

**Reflow only (CSS at `sm`/`lg`, no new component):**

`/dashboard/*` (all four), `/players`, `/profile`, `/trainings`, `/teams`, `/equipment`,
`/finance`, `/stats`, `/connections`, `/notifications`, `/matches`, `/training-plans`,
`/training-requests`, `/session-builder`, `/admin/*`, `/tournaments` list tabs. These are
already card grids or forms; they need the touch scale in §2 and nothing structural.

### The `useIsMobile()` bug you will hit

`useIsMobile()` initialises to `undefined` and returns `!!isMobile` — **so the first
render on a phone returns `false`.** Every behavioural swap keyed on it will render the
desktop component for one frame, then swap. On the calendar that means a 7-column grid
flashing before the agenda. Fix it in `src/hooks/use-mobile.tsx` before using it for
anything behavioural:

```ts
// initialise synchronously; SSR-safe fallback stays false
const [isMobile, setIsMobile] = React.useState(
  () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches,
);
```

This is a 3-line change to a hook that currently has one consumer (`ui/sidebar.tsx`, which
is unused by the app shell). Low collision risk. Do it first.

---

## 2. Touch target and spacing scale

Apply mechanically. The rule is 44px, which is `h-11` — **not** `h-10` (40px), which is
what `Button` defaults to today, and not `h-9`/`h-8`, which is what the toolbars use.

### The sizes

| Thing | `<md` (phone) | `md`+ (unchanged) |
|---|---|---|
| Primary / secondary button | `h-11` | `h-10` (`size="default"`) |
| Icon-only button | `h-11 w-11` | `h-10 w-10` (`size="icon"`) |
| Toolbar icon button (calendar prev/next) | `h-11 w-11` | `h-8 w-8` |
| Tab trigger (`TabsTrigger`) | `h-11` in an `h-12` `TabsList` | `h-6` in `h-8` |
| Select trigger / Input | `h-11` | `h-10` |
| Tappable list row (day event, tournament card, player card) | `min-h-12` (48px) | as-is |
| Inline text link acting as a control (`+N more`) | wrap in `min-h-11 -my-1 px-2` | as-is |
| Bottom tab bar item | `h-14` full-width flex-1 | n/a |
| Gap between two adjacent targets | `gap-2` (8px) minimum, `gap-3` preferred | `gap-1.5` fine |
| Page padding (`<main>`) | `p-4` | `p-6` |
| Vertical rhythm between page sections | `space-y-4` | `space-y-5` / `space-y-6` |

Tailwind here is 3.4.17, so `size-11` compiles — but the codebase writes `h-11 w-11`
everywhere, so keep writing that. Consistency beats brevity in a file 20 other people grep.

### How to apply it — pick one lever

**Recommended (cheap, ~15 lines, one file).** Add a `touch` size to
`src/components/ui/button.tsx` and change nothing else about the component:

```ts
size: {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
  // Phone-first: 44px thumb target below md, desktop density above it.
  touch: "h-11 px-4 md:h-10",
  "touch-icon": "h-11 w-11 md:h-10 md:w-10",
},
```

Then a page-level fix is `size="touch"` instead of `size="sm"`. For the ~50 non-`Button`
targets (bare `<button>` in `EventChip`, `DayView` rows, the `+N more` link, the mini
calendar days) add `min-h-11 md:min-h-0` at the call site.

**Expensive alternative (do not do this now).** Change `Button`'s `default` to
`h-11 md:h-10` globally. It fixes every target in one line and changes desktop nothing —
but it moves the height of every button on every phone screen simultaneously, including
inside dialogs sized around `h-10`. If you take it, it needs a full visual pass; the
`touch` variant is the safe increment.

### Spacing and hit-area gotchas

- Two targets closer than 8px read as one target under a thumb. The calendar toolbar's
  `gap-1` prev/next pair and the `gap-1.5` filter run both violate this at `<md` —
  `gap-2` them.
- `h-11` with `text-xs` content is fine. The target is the box, not the glyph. Do not
  enlarge type to reach 44px; enlarge padding.
- `active:scale-[0.97]` already exists on `Button` and is the only press feedback needed.
  Touch has no hover, so do not add `hover:` affordances that carry meaning (see §5).

---

## 3. Mobile navigation

### Recommendation: **bottom tab bar with a "More" tab. Keep the drawer, demoted to being what "More" opens.** Not both as peers.

**Reasoning in one line:** courtside is one thumb and one glance, and a drawer costs two
taps (open, choose) for every single destination, every single time — while 15+ routes
means a pure tab bar cannot address the whole app, so the drawer has to survive as the
long tail.

The pieces:

- A fixed bottom bar, `<md` only, `h-14` + `pb-[env(safe-area-inset-bottom)]`,
  `bg-card border-t border-border`, four route tabs plus More. Square, no floating pill,
  no shadow — consistent with `--radius: 0`.
- **More** opens the existing `mobileMenuOpen` drawer in `DashboardLayout.tsx`, unchanged,
  containing every remaining role-visible route from `navItems` plus the account block
  (Profile, Notification settings, Theme, Log out) that already lives at its foot.
- The existing `h-14 md:hidden` top bar stays, but the hamburger becomes redundant —
  replace it with the page title, keep `ThemeToggle`, and add a **bell** on the right
  carrying `unreadNotificationCount`, which `DashboardLayout` already computes. That gets
  Notifications out of the tab budget without burying it.
- Active tab: `text-primary` icon + label. Inactive: `text-muted-foreground`. No animated
  indicator sliding between tabs — the layout comment on the sidebar already establishes
  that this app cross-fades in place rather than sweeping.

### Which routes earn a tab slot

Tabs are **role-derived**, from the same `roles` arrays in `navItems` that drive the
sidebar. A coach and a player do not get the same bar, because they do not do the same job.

| Role | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|---|---|---|---|---|---|
| **Player** | Home `/dashboard` | Calendar | Trainings | Tournaments | More |
| **Coach** | Home `/dashboard` | Calendar | Players | Trainings | More |
| **Observer** | Home | Calendar | Tournaments | Finance | More |
| **Admin** | Home | Users | Alerts | Tournaments | More |

Selection rule, so this survives new routes: a slot goes to a destination the user opens
**more than once a day, from outside the app's flow**. Calendar is the courtside screen.
Trainings is where the coach's written feedback lands and where a player looks after a
session. Players is the coach's roster and his entry point to everything per-person.
Tournaments is the player's "what am I entered in".

Explicitly **not** tabs: Connections, Teams, Session Builder, Training Plans, Training
Requests, Stats, Equipment, Finance (player), Matches, Notification Settings, Profile,
Admin sub-pages. All reachable in two taps via More, which is correct for
once-a-week destinations.

**Cost.** ~120 lines: one new `src/components/nav/MobileTabBar.tsx` plus ~15 lines in
`DashboardLayout.tsx` (render it, add `pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0`
to `<main>` — plain `pb-16` leaves the last row under the home indicator — and swap the
hamburger for a title + bell). Do **not** thread it through pages.

**Cheaper version if the tab bar has to wait:** keep the drawer as the only nav, but move
Calendar and Trainings/Players into the mobile top bar as two icon buttons. It buys the
courtside case at a tenth of the cost, and it is throwaway when the bar lands.

Also required, one-time, by a developer editing `index.html` (not a `.tsx`):
`<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`
— without `viewport-fit=cover`, `env(safe-area-inset-bottom)` resolves to `0` and the bar
sits under the iPhone home indicator.

---

## 4. Per-screen direction

### 4.1 Calendar — the hard one

**Desktop stays exactly as it is:** month/week `grid-cols-7`, drag-to-reschedule, the
`ReassignDropStrip`, the `lg:` mini-calendar + legend column, the single-row toolbar.

**The phone version is not a calendar. It is an agenda.**

A coach courtside is not asking "what does September look like?" — he is asking "what is
next, and who is it with?". A player is asking "am I training today?". Both are questions
about a *day and the days around it*, and both are answered by a vertical list. The month
grid answers a planning question that nobody asks with one hand in the sun.

**What it IS — `MobileAgenda`, three stacked parts:**

1. **A horizontal week strip at the top — paged by week, not scrolled by day.** Build it
   as three `w-full shrink-0 snap-start` week panes (previous / current / next) inside an
   `overflow-x-auto snap-x snap-mandatory` track, re-centred on the middle pane once a
   swipe settles. Each pane holds seven day cells (`flex-1`, ~44px at 375px): weekday
   letter, date number, up to three coloured dots (`entityColor` / `eventBaseColor` — the
   tokens already exist in `src/lib/calendar/colors.ts`). Swipe = change week. Tap = select
   that day. Today keeps the filled `bg-primary` circle the grid already uses.
   **Pick this, not per-cell `snap-center`** — snapping each day gives a continuously
   scrolling day ribbon with no week boundary, which is a different (and worse) interaction
   for someone answering "what's on this week".
2. **The selected day's events as a vertical list below it** — this is
   `DayView`'s existing row markup, which is already a well-designed vertical list
   (time on the left, coloured spine, type badge, title, player dot, location). Reuse it;
   do not rewrite it.
3. **Month, when it is genuinely wanted, is `MiniMonthCalendar`** — which already renders
   a dotted month at ~260px — shown behind a "Month" toggle, where tapping a day opens
   `DayEventsSheet` (already built, already scrollable, already sorts own-events first).
   That is the *entire* month story on a phone: density as dots, detail on tap.

**Where it plugs in — one seam.** In `CalendarPage.tsx` around line 1158, the render is
already `{view === "month" && ...}` / `{view === "week" && ...}` / `{view === "day" && ...}`.
Mobile is:

```tsx
{isMobile
  ? <MobileAgenda currentDate={currentDate} events={scopedEvents} onSelectEvent={handleSelectEvent} … />
  : <>{view === "month" && <MonthlyView …/>}{view === "week" && <WeeklyView …/>}{view === "day" && <DayView …/>}</>}
```

New file `src/components/calendar/MobileAgenda.tsx`. Honest collision footprint in
`CalendarPage.tsx` (1201 lines, under active edit by others): **one render seam, the
toolbar block, and two new rows in `EventDetailDrawer`** — three localised hunks. The
month/week grid components, all the DnD handlers, the desktop toolbar markup and every
mutation stay untouched. This must not become a refactor of `CalendarPage`.

**Toolbar on mobile.** The `month|week|day` `Tabs` become a two-item `ToggleGroup`
("Agenda" / "Month") at `h-11`. Prev/next/Today collapse into the week strip's swipe plus
one `h-11` "Today" button. Every filter (`LocationFilterMenu`, `MultiFilterMenu`, Scope,
`TeamFilterSelect`, refresh) moves behind a single `h-11` **Filters** button opening a
bottom `Drawer` with the same menus stacked `w-full`, plus a count badge when any filter
is off its default. Reasoning: the current run wraps to three rows at 375px and costs ~120
vertical pixels before a single event is visible.

**Drag-and-drop.** Reschedule and reassign are `dataTransfer`-based and **do not fire on
touch**. Do not attempt a touch DnD port. Instead, `EventDetailDrawer` gains two rows on
mobile — **"Move to date…"** (opens `MiniMonthCalendar` in a nested drawer, calls the same
`handleDropEvent` payload) and **"Reassign to…"** (a player list calling
`handleReassignToPlayer`). Both mutations already exist; only the trigger is new. Guard
both with the existing `canEdit` / `isProjected()` checks.

**Cost/cheaper.** `MobileAgenda` is ~180 lines and is the one genuinely expensive item
here. The cheaper 80% is: at `<md`, force `view = "day"`, render the existing `DayView`,
and put prev/next day at `h-11`. No week strip, no swipe — but it is immediately usable
and ships in an afternoon. The week strip is what makes it feel like a product.

### 4.2 Tournaments (list / map / globe)

- **Tabs.** Four triggers do not fit at 375px. `<md`: drop **Globe** entirely (three.js
  on a phone GPU, and "spin the planet" is a desktop pleasure, not a courtside need), and
  render the remaining three as full-width `TabsList` with `grid grid-cols-3 h-12`.
- **Browse / Player list.** The `sm:grid-cols-2 lg:grid-cols-3` card grid already reflows
  to one column correctly. Keep it. Inside each card, the `h-7 w-[120px]` status Select
  goes `h-11 w-full`.
- **Filters.** Search stays inline and full width (it is the most-used control). Surface /
  Category / Country / Status move into a **Filters** bottom `Drawer`, `w-full` selects,
  with an active-count badge on the button. Cheaper version if the drawer is too much
  right now: `w-full sm:w-[140px]` on each of the four `SelectTrigger`s — they stack
  instead of wrapping raggedly, which is ugly but not broken.
- **Map.** Full-bleed: the Leaflet map takes the viewport minus the top bar and tab bar,
  and the sorted results list moves into a `Drawer` with a peeking handle ("34 tournaments
  near you"). Rationale: at 375px a map sharing the screen with a list gives you neither.
  Geolocation "Near me" is the one control that stays visible over the map, `h-11`.
- **Globe.** Desktop only. State it in code with a comment so nobody "fixes" it later.

### 4.3 Trainings

The phone version is **the coach's review queue and the player's session record** — not a
management table.

- One-column list, each session a `min-h-12` row: date, type badge, player/team, and the
  unreviewed marker the sidebar already counts. Tapping opens the detail as a bottom
  `Drawer`, where "worked on / next steps" is read and written.
- **Upcoming / Past / All** `Tabs` become a full-width `grid grid-cols-3 h-12` — this is
  the primary control on the page and deserves the width.
- Search stays inline full-width; the `w-[170px]` type Select goes into the Filters drawer
  (or `w-full` as the cheap version).
- The `grid grid-cols-2 gap-3` blocks inside the training form (lines 190, 206) are
  **already fine at 375px** — two short fields side by side. Leave them.

### 4.4 Players (coach)

The phone version is **a roster you tap to get to one person**. Almost right already.

- Card grid is `sm:grid-cols-2 lg:grid-cols-3`, so one column on a phone. Keep.
- **Make the whole card the tap target**, not just the `size="sm"` "View stats" button —
  a 36px button in the corner of a 120px card is the wrong affordance under a thumb.
  Wrap the card contents in a button/`Link`, keep the explicit action visible as a chevron.
- `PlayerStatsDrawer` opens as a bottom `Drawer` at `<md` instead of a right sheet.
- Search input `h-11`, `max-w-sm` → `w-full sm:max-w-sm`.

### 4.5 Dashboard (all four roles)

The phone version is **"what is happening today, and what needs me"** — the top of the
page, uncompressed. The rest of the page is allowed to be a long scroll.

- The stat grids (`sm:grid-cols-2 lg:grid-cols-4`, `lg:grid-cols-2`) already collapse
  correctly. **Do not** force stats to a 2-up row at 375px to "save space" — a 170px card
  is where numbers become unreadable in sunlight.
- **Order matters more than layout here.** On mobile, the next-24-hours card (today's
  sessions / next tournament) must render first, before stat tiles. If the current order
  puts tiles first: add `flex flex-col` to the page root (no visual change — `space-y-*`
  behaves identically in column flex) and `order-first md:order-none` on that card.
  `order-*` is inert in block flow, which is what these roots are today, so the parent
  class is not optional. Two classes, still not a restructure.
- Every "View" / "See all" link on a card goes to `min-h-11`.
- `h1` from `text-2xl` to `text-xl md:text-2xl` — the greeting line wraps to three lines
  at 375px otherwise.

### 4.6 Profile

The phone version is **identity, public ID, and the tour subscriptions** — a form, and
forms are the one thing that already work on phones.

- Single column throughout (already is). `Input`s to `h-11`; `Input` already carries
  `text-base md:text-sm`, which is what stops iOS zooming on focus — **that is already
  done, do not re-spec it.**
- The **Copy public ID** control is the single most-used thing on this page (it is how a
  player connects to a coach). At `<md` make it a full-width `h-11` button under the ID,
  not an icon beside it.
- The `FEDERATION_OPTIONS` switch rows: each row `min-h-12`, whole row tappable (label
  `htmlFor` the switch), hint text on its own line rather than beside the label.
- Save button: full-width `h-11` at the foot on `<md`.

---

## 5. Typography and density

The existing type system is right; it just has a floor problem on phones.

**Desktop — unchanged.** `Inter`, body `text-sm` (14px), page `h1` `text-2xl` at
`font-bold tracking-tight`, `h1`–`h6` at `font-weight: 800; letter-spacing: -0.02em`,
metadata `text-xs`. This is a dense planning tool and it should read like one.

**Mobile:**

| Role | `<md` | `md`+ |
|---|---|---|
| Page title | `text-xl` | `text-2xl` |
| Section / card title | `text-base` | `text-sm`–`text-base` |
| Body, list rows | `text-sm` (14px) | `text-sm` |
| Metadata, badges | `text-xs` (12px) — **floor** | `text-xs` |
| Form inputs | `text-base` (already) | `text-sm` (already) |

**The 12px floor is the rule that matters.** `CalendarPage.tsx` and its children use
`text-[10px]` and `text-[11px]` in ~20 places (day-of-week headers, `+N more`, state
badges, player legend, the `DayView` time column). At arm's length, outdoors, on a phone,
10px is decoration. On `<md`, every one of those becomes `text-xs`. Keep them at `[10px]`
on `md+` where the 7-column grid genuinely needs them — `text-[10px] md:text-[10px]` is
wrong; write `text-xs md:text-[10px]`.

**Contrast in sunlight.** `--muted-foreground` is `0 0% 40%` on a `40 33% 97%` paper —
about 5.3:1, which passes AA indoors and is marginal in direct sun. Rule: on mobile, the
*primary* text of any row (event title, player name, session type) is `text-foreground`;
`text-muted-foreground` is only for genuinely secondary metadata. This is a per-component
call, not a token change — **do not alter the token**, the calendar palette in
`index.css` is contrast-tuned against it and every one of those hues was measured.

**Density.** Desktop is comfortable-dense: `space-y-5`/`space-y-6` between sections,
`gap-4` in card grids, `p-6` page padding. Mobile is looser vertically and tighter
horizontally: `p-4` page padding, `space-y-4` between sections, `gap-3` in grids, and
`min-h-12` rows. Net effect is fewer items per screen, which is correct — a phone screen
should hold one answer, not six.

**Touch has no hover, and no `title`.** The calendar leans on both:
`title={event.title}` is the only way to see a truncated event name, and `hover:bg-accent`
is the only affordance that a cell is clickable. Neither exists under a thumb. On mobile
the equivalent is always **tap → detail drawer**, and titles must be allowed to wrap to
two lines (`line-clamp-2`) rather than truncate, because there is no tooltip behind them.

---

## 6. What must NOT change on desktop

This is a mobile adaptation, not a redesign. At `md`+ (≥768px) the following stay exactly
as they are, and any diff that touches them without a `<md` guard should be rejected in
review:

1. **The sidebar.** `w-64`, `hidden md:flex`, the collapse button, the
   `tennisai:navCollapsed` persistence, the focus-return-on-collapse behaviour, the
   in-place cross-fade of the active row, the unreviewed/unread count badges, and the
   account dropdown at its foot. The bottom tab bar is `md:hidden` and additive.
2. **The calendar's 7-column month and week grids** — `min-h-[140px]` cells,
   `MONTH_CELL_EVENT_LIMIT = 4`, the `+N more` → `DayEventsSheet` path, the today
   highlight, `EventChip`'s colour grading (fill by type/federation, left accent by
   entity, opacity/dash/strike by state).
3. **Drag-to-reschedule and `ReassignDropStrip`.** Mouse DnD keeps working exactly as it
   does. The mobile "Move to date…" / "Reassign to…" actions are additional entry points
   to the same mutations, not a replacement.
4. **The calendar's single toolbar row** — view tabs, date nav, Today, and the filter
   menus in one left-aligned run at `h-8`. It replaced four stacked chip rows for a
   reason; do not undo that to share code with mobile.
5. **The `lg:` mini-calendar + legend column** at `w-[260px]`, and its collapse toggle.
6. **The Globe tab** and its lazy three.js import. Desktop-only means desktop-*keeps*-it.
7. **Density: `text-sm` body, `text-xs` metadata, `text-[10px]` in month cells,
   `h-8`/`h-9` toolbar controls, `h-10` buttons, `p-6` page padding, `gap-4`/`space-y-6`.**
   The 44px floor is a `<md` rule. Applying it at `md+` would cost roughly one card row of
   vertical space per screen on the coach's planning surface, which is the opposite of
   what he wants there.
8. **All card grid breakpoints** — `sm:grid-cols-2 lg:grid-cols-3`, `lg:grid-cols-2`,
   `sm:grid-cols-4`. They are correct; they were the reason the audit found no horizontal
   scrolling anywhere.
9. **Every design token** in `src/index.css` — the calendar/federation palette in
   particular, which is contrast-measured per hue in both themes, and `--radius: 0rem`.
10. **The motion system** — `duration-120`, `ease-editorial`, `animate-fade-in-soft` on
    route change, `active:scale-[0.97]`, and the `prefers-reduced-motion` block.

---

## 7. Suggested order of work

Each item is independently shippable and independently revertible.

1. Fix `useIsMobile()`'s first-render flash (§1). 3 lines, unblocks everything else.
2. `viewport-fit=cover` in `index.html`; `p-4 md:p-6` on `<main>` in `DashboardLayout`.
3. `size="touch"` / `size="touch-icon"` in `button.tsx`, then sweep pages. Mechanical,
   parallelisable, no design decisions left in it.
4. Bottom tab bar + top-bar bell (§3). Biggest felt improvement per line of code.
5. Right sheets → bottom `Drawer` at `<md` (Event detail, Player stats, Day events).
6. Filters drawer on Tournaments / Trainings / Calendar; hide Globe at `<md`.
7. `MobileAgenda` (§4.1) — last, because it is the largest new surface and the file it
   plugs into is under active edit.
8. Typography floor sweep: `text-[10px]`/`[11px]` → `text-xs md:text-[10px]` at `<md`.

Verification, per item: 375x812 and 1440x900, light and dark, coach and player roles. The
desktop pass is the one that matters — if a 1440px screenshot differs from `main`, the
change is wrong.
