// ============================================================
// Log / edit a match.
//
// Only what the user types is submitted. Blank detailed-stat fields are sent
// as "not entered" (and, when editing, explicitly cleared) — the form never
// substitutes a zero, and it computes nothing on the user's behalf.
//
// The form is long, so everything typed is kept as a localStorage draft
// (see `@/lib/drafts/useFormDraft`) until the match is saved or cancelled.
// ============================================================

import { useMemo, useState } from "react";
import { CalendarDays, Check, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SurfacePicker } from "@/components/SurfacePicker";
import { DraftRestoredNotice } from "@/lib/drafts/DraftRestoredNotice";
import { draftKey, useFormDraft } from "@/lib/drafts/useFormDraft";
import {
  ALL_COUNT_KEYS,
  MatchStatsFields,
  RALLY_BUCKET_KEYS,
  type CountKey,
  type RallyBucketKey,
} from "@/components/matches/MatchStatsFields";
import { MATCH_FORMAT_LABEL, MATCH_FORMAT_OPTIONS } from "@/lib/stats/format";
import type {
  IndoorOutdoor,
  MatchFormat,
  MatchResult,
  MatchSetScore,
  MatchView,
  Opponent,
  RallyLengthBuckets,
  Surface,
} from "@/types";

const NO_OPPONENT = "__none__";
const NEW_OPPONENT = "__new__";
const NO_RESULT = "__unrecorded__";
const MAX_SETS = 5;

/** What the form hands back — the page maps it to the API payload. */
export interface MatchFormValues {
  opponentId: string | null;
  /** Set when the user typed a brand-new opponent name. */
  newOpponent?: { firstName: string; lastName: string };
  date: string;
  competition: string | null;
  surface: Surface;
  indoorOutdoor: IndoorOutdoor;
  format: MatchFormat;
  result: MatchResult | null;
  scoreSets: MatchSetScore[];
  conditions: string | null;
  /** number = entered, null = deliberately blank (cleared on edit). */
  counts: Record<CountKey, number | null>;
  rallyLengthBuckets: RallyLengthBuckets | null;
}

export interface MatchFormProps {
  mode: "create" | "edit";
  initial?: MatchView;
  opponents: Opponent[];
  submitting?: boolean;
  /** Rejects when the save fails — the form then keeps the input and its draft. */
  onSubmit: (values: MatchFormValues) => void | Promise<void>;
  onCancel: () => void;
}

interface SetRow {
  player: string;
  opponent: string;
  tiebreak: string;
}

/** Everything the user can type here — the shape persisted as a draft. */
interface MatchFormDraft {
  opponentChoice: string;
  newFirstName: string;
  newLastName: string;
  date: string;
  competition: string;
  surface: Surface;
  indoorOutdoor: IndoorOutdoor;
  format: MatchFormat;
  result: string;
  conditions: string;
  sets: SetRow[];
  counts: Record<CountKey, string>;
  buckets: Record<RallyBucketKey, string>;
  statsOpen: boolean;
}

/** Count pairs that must stay coherent — same rules the API enforces. */
const COUNT_PAIRS: ReadonlyArray<readonly [CountKey, CountKey, string]> = [
  ["firstServesIn", "firstServeAttempts", "Cannot exceed 1st serve attempts"],
  ["firstServePointsWon", "firstServesIn", "Cannot exceed 1st serves in"],
  ["secondServePointsWon", "secondServePlayed", "Cannot exceed 2nd serves played"],
  ["returnPointsWon", "returnPointsPlayed", "Cannot exceed return points played"],
  ["breakPointsConverted", "breakPointsCreated", "Cannot exceed break points created"],
  ["breakPointsSaved", "breakPointsFaced", "Cannot exceed break points faced"],
  ["netPointsWon", "netApproaches", "Cannot exceed net approaches"],
];

function emptyCounts(): Record<CountKey, string> {
  return ALL_COUNT_KEYS.reduce(
    (acc, key) => {
      acc[key] = "";
      return acc;
    },
    {} as Record<CountKey, string>,
  );
}

function emptyBuckets(): Record<RallyBucketKey, string> {
  return { "1-4": "", "5-8": "", "9+": "" };
}

function todayInput(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** ISO → `yyyy-MM-dd` for a date input, without shifting the day. */
function dateInputValue(iso?: string): string {
  if (!iso) return todayInput();
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return todayInput();
  return parsed.toISOString().slice(0, 10);
}

function numberOrEmpty(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

/** "" → null; anything non-numeric is treated as not entered. */
function parseCount(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** The state the form opens with — also the baseline a draft is compared against. */
function initialDraft(initial?: MatchView): MatchFormDraft {
  const counts = emptyCounts();
  if (initial) for (const key of ALL_COUNT_KEYS) counts[key] = numberOrEmpty(initial.stats?.[key]);

  const buckets = emptyBuckets();
  const existingBuckets = initial?.stats?.rallyLengthBuckets;
  if (existingBuckets) for (const key of RALLY_BUCKET_KEYS) buckets[key] = numberOrEmpty(existingBuckets[key]);

  const existingSets = initial?.scoreSets ?? [];

  return {
    opponentChoice: initial?.opponentId ?? NO_OPPONENT,
    newFirstName: "",
    newLastName: "",
    date: dateInputValue(initial?.date),
    competition: initial?.competition ?? "",
    surface: (initial?.surface as Surface) ?? "hard",
    indoorOutdoor: (initial?.indoorOutdoor as IndoorOutdoor) ?? "outdoor",
    format: (initial?.format as MatchFormat) ?? "best_of_3",
    result: initial?.result ?? NO_RESULT,
    conditions: initial?.conditions ?? "",
    sets:
      existingSets.length === 0
        ? [{ player: "", opponent: "", tiebreak: "" }]
        : existingSets.map((s) => ({
            player: String(s.player),
            opponent: String(s.opponent),
            tiebreak: s.tiebreak ?? "",
          })),
    counts,
    buckets,
    statsOpen: ALL_COUNT_KEYS.some((key) => (initial ? typeof initial.stats?.[key] === "number" : false)),
  };
}

export function MatchForm({ mode, initial, opponents, submitting, onSubmit, onCancel }: MatchFormProps) {
  const pristine = useMemo(() => initialDraft(initial), [initial]);

  const [opponentChoice, setOpponentChoice] = useState<string>(pristine.opponentChoice);
  const [newFirstName, setNewFirstName] = useState(pristine.newFirstName);
  const [newLastName, setNewLastName] = useState(pristine.newLastName);
  const [date, setDate] = useState(pristine.date);
  const [competition, setCompetition] = useState(pristine.competition);
  const [surface, setSurface] = useState<Surface>(pristine.surface);
  const [indoorOutdoor, setIndoorOutdoor] = useState<IndoorOutdoor>(pristine.indoorOutdoor);
  const [format, setFormat] = useState<MatchFormat>(pristine.format);
  const [result, setResult] = useState<string>(pristine.result);
  const [conditions, setConditions] = useState(pristine.conditions);
  const [sets, setSets] = useState<SetRow[]>(pristine.sets);
  const [counts, setCounts] = useState<Record<CountKey, string>>(pristine.counts);
  const [buckets, setBuckets] = useState<Record<RallyBucketKey, string>>(pristine.buckets);
  const [statsOpen, setStatsOpen] = useState(pristine.statsOpen);
  const [errors, setErrors] = useState<{
    date?: string;
    opponent?: string;
    sets?: string;
    counts?: Partial<Record<CountKey, string>>;
  }>({});

  const opponentOptions = useMemo(
    () =>
      [...opponents].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
      ),
    [opponents],
  );

  // ── Draft persistence. Keyed by mode (+ id) so a half-typed new match never
  // bleeds into an edit of an existing one.
  const storageKey = draftKey("match-form", mode, mode === "edit" ? initial?.id : null);

  const draftValue = useMemo<MatchFormDraft>(
    () => ({
      opponentChoice, newFirstName, newLastName, date, competition, surface,
      indoorOutdoor, format, result, conditions, sets, counts, buckets, statsOpen,
    }),
    [opponentChoice, newFirstName, newLastName, date, competition, surface,
      indoorOutdoor, format, result, conditions, sets, counts, buckets, statsOpen],
  );

  const applyDraft = (d: MatchFormDraft) => {
    setOpponentChoice(d.opponentChoice ?? NO_OPPONENT);
    setNewFirstName(d.newFirstName ?? "");
    setNewLastName(d.newLastName ?? "");
    setDate(d.date ?? pristine.date);
    setCompetition(d.competition ?? "");
    setSurface(d.surface ?? pristine.surface);
    setIndoorOutdoor(d.indoorOutdoor ?? pristine.indoorOutdoor);
    setFormat(d.format ?? pristine.format);
    setResult(d.result ?? NO_RESULT);
    setConditions(d.conditions ?? "");
    setSets(Array.isArray(d.sets) && d.sets.length > 0 ? d.sets : pristine.sets);
    setCounts({ ...pristine.counts, ...(d.counts ?? {}) });
    setBuckets({ ...pristine.buckets, ...(d.buckets ?? {}) });
    setStatsOpen(Boolean(d.statsOpen));
  };

  const draft = useFormDraft<MatchFormDraft>(storageKey, draftValue, applyDraft);

  const discardDraft = () => {
    draft.clear();
    applyDraft(pristine);
    setErrors({});
  };

  const setCount = (key: CountKey, value: string) => setCounts((prev) => ({ ...prev, [key]: value }));
  const setBucket = (key: RallyBucketKey, value: string) => setBuckets((prev) => ({ ...prev, [key]: value }));

  const updateSet = (index: number, patch: Partial<SetRow>) =>
    setSets((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addSet = () =>
    setSets((prev) => (prev.length >= MAX_SETS ? prev : [...prev, { player: "", opponent: "", tiebreak: "" }]));

  const removeSet = (index: number) =>
    setSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nextErrors: typeof errors = {};

    if (!date || Number.isNaN(Date.parse(date))) nextErrors.date = "Enter the date the match was played.";

    if (opponentChoice === NEW_OPPONENT && (!newFirstName.trim() || !newLastName.trim())) {
      nextErrors.opponent = "Enter the new opponent's first and last name.";
    }

    // Drop rows the user left completely blank, then require complete rows.
    const usedRows = sets.filter((row) => row.player.trim() !== "" || row.opponent.trim() !== "");
    const scoreSets: MatchSetScore[] = [];
    for (const row of usedRows) {
      const player = Number(row.player);
      const opponent = Number(row.opponent);
      if (!Number.isFinite(player) || !Number.isFinite(opponent) || row.player === "" || row.opponent === "") {
        nextErrors.sets = "Every set needs both games won — remove any set you did not play.";
        break;
      }
      if (player < 0 || opponent < 0 || player > 30 || opponent > 30) {
        nextErrors.sets = "Games won must be between 0 and 30.";
        break;
      }
      if (row.tiebreak.trim() && !/^\d{1,2}-\d{1,2}$/.test(row.tiebreak.trim())) {
        nextErrors.sets = "Write a tiebreak as two numbers, e.g. 7-5.";
        break;
      }
      scoreSets.push({
        player: Math.max(0, Math.floor(player)),
        opponent: Math.max(0, Math.floor(opponent)),
        ...(row.tiebreak.trim() ? { tiebreak: row.tiebreak.trim() } : {}),
      });
    }
    if (!nextErrors.sets && scoreSets.length === 0) {
      nextErrors.sets = "Add at least one set score.";
    }

    const parsedCounts = ALL_COUNT_KEYS.reduce(
      (acc, key) => {
        acc[key] = parseCount(counts[key]);
        return acc;
      },
      {} as Record<CountKey, number | null>,
    );

    const countErrors: Partial<Record<CountKey, string>> = {};
    for (const [subKey, totalKey, message] of COUNT_PAIRS) {
      const sub = parsedCounts[subKey];
      const total = parsedCounts[totalKey];
      if (sub !== null && total !== null && sub > total) countErrors[subKey] = message;
    }
    if (Object.keys(countErrors).length > 0) {
      nextErrors.counts = countErrors;
      setStatsOpen(true);
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const enteredBuckets = RALLY_BUCKET_KEYS.reduce<RallyLengthBuckets>((acc, key) => {
      const parsed = parseCount(buckets[key]);
      if (parsed !== null) acc[key] = parsed;
      return acc;
    }, {});

    try {
      await onSubmit({
        opponentId: opponentChoice === NO_OPPONENT || opponentChoice === NEW_OPPONENT ? null : opponentChoice,
        newOpponent:
          opponentChoice === NEW_OPPONENT
            ? { firstName: newFirstName.trim(), lastName: newLastName.trim() }
            : undefined,
        date,
        competition: competition.trim() ? competition.trim() : null,
        surface,
        indoorOutdoor,
        format,
        result: result === NO_RESULT ? null : (result as MatchResult),
        scoreSets,
        conditions: conditions.trim() ? conditions.trim() : null,
        counts: parsedCounts,
        rallyLengthBuckets: Object.keys(enteredBuckets).length > 0 ? enteredBuckets : null,
      });
      // Saved for real — the draft is no longer needed.
      draft.clear();
    } catch {
      // The mutation hooks already surfaced the failure in a toast; keep the
      // form (and its draft) intact so nothing the user typed is lost.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <DraftRestoredNotice savedAt={draft.restoredAt} onDiscard={discardDraft} onDismiss={draft.acknowledge}>
        {mode === "edit"
          ? "Restored the unsaved edits you had in progress."
          : "Restored the match you started logging earlier."}
      </DraftRestoredNotice>

      {/* ── Who and when ── */}
      <div className="space-y-4 border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="match-opponent">Opponent</Label>
            <Select value={opponentChoice} onValueChange={setOpponentChoice}>
              <SelectTrigger id="match-opponent">
                <SelectValue placeholder="Select an opponent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OPPONENT}>Not recorded</SelectItem>
                {opponentOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.firstName} {o.lastName}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_OPPONENT}>+ New opponent…</SelectItem>
              </SelectContent>
            </Select>
            {errors.opponent && <p className="text-xs text-destructive">{errors.opponent}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-date">Date played</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="match-date"
                type="date"
                className="pl-9"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
          </div>
        </div>

        {opponentChoice === NEW_OPPONENT && (
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opponent-first">New opponent — first name</Label>
              <Input
                id="opponent-first"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                placeholder="e.g. Marta"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opponent-last">New opponent — last name</Label>
              <Input
                id="opponent-last"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                placeholder="e.g. Kovács"
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              <UserPlus className="mr-1 inline h-3 w-3" />
              Saved to your opponent list so you can reuse it for the next match.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="match-competition">Competition (optional)</Label>
            <Input
              id="match-competition"
              value={competition}
              onChange={(e) => setCompetition(e.target.value)}
              placeholder="e.g. ITF J60 Sevilla — R16"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="match-conditions">Conditions (optional)</Label>
            <Input
              id="match-conditions"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="e.g. windy, 31°C"
            />
          </div>
        </div>
      </div>

      {/* ── Court ── */}
      <div className="space-y-4 border border-border bg-card p-4">
        <div className="space-y-2">
          <Label>Surface</Label>
          <SurfacePicker value={surface} onChange={setSurface} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="match-environment">Indoor / outdoor</Label>
            <Select value={indoorOutdoor} onValueChange={(v) => setIndoorOutdoor(v as IndoorOutdoor)}>
              <SelectTrigger id="match-environment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outdoor">Outdoor</SelectItem>
                <SelectItem value="indoor">Indoor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="match-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as MatchFormat)}>
              <SelectTrigger id="match-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_FORMAT_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {MATCH_FORMAT_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="match-result">Result</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger id="match-result">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RESULT}>Not recorded</SelectItem>
                <SelectItem value="win">Win</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Score ── */}
      <div className="space-y-3 border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Set scores</Label>
            <p className="text-xs text-muted-foreground">Games won by you, then your opponent.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={addSet}
            disabled={sets.length >= MAX_SETS}
          >
            <Plus className="h-3.5 w-3.5" /> Add set
          </Button>
        </div>

        <div className="space-y-2">
          {sets.map((row, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <span className="w-12 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Set {index + 1}
              </span>
              <div className="space-y-1">
                <Label htmlFor={`set-${index}-player`} className="text-xs text-muted-foreground">
                  You
                </Label>
                <Input
                  id={`set-${index}-player`}
                  type="number"
                  min={0}
                  max={30}
                  inputMode="numeric"
                  className="w-20"
                  value={row.player}
                  onChange={(e) => updateSet(index, { player: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`set-${index}-opponent`} className="text-xs text-muted-foreground">
                  Opponent
                </Label>
                <Input
                  id={`set-${index}-opponent`}
                  type="number"
                  min={0}
                  max={30}
                  inputMode="numeric"
                  className="w-20"
                  value={row.opponent}
                  onChange={(e) => updateSet(index, { opponent: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`set-${index}-tiebreak`} className="text-xs text-muted-foreground">
                  Tiebreak (optional)
                </Label>
                <Input
                  id={`set-${index}-tiebreak`}
                  className="w-28"
                  placeholder="7-5"
                  value={row.tiebreak}
                  onChange={(e) => updateSet(index, { tiebreak: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                onClick={() => removeSet(index)}
                disabled={sets.length <= 1}
                aria-label={`Remove set ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        {errors.sets && <p className="text-xs text-destructive">{errors.sets}</p>}
      </div>

      {/* ── Optional raw counts ── */}
      <MatchStatsFields
        counts={counts}
        buckets={buckets}
        onCountChange={setCount}
        onBucketChange={setBucket}
        open={statsOpen}
        onOpenChange={setStatsOpen}
        errors={errors.counts}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="gap-1.5" disabled={submitting}>
          <Check className="h-4 w-4" />
          {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Log match"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => { draft.clear(); onCancel(); }}
          disabled={submitting}
        >
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </form>
  );
}
