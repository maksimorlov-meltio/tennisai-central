// ============================================================
// Optional detailed match statistics — RAW COUNTS ONLY.
//
// Nothing in here is required. A blank field means "not counted" and stays
// blank everywhere in the app: it is never stored or displayed as a zero, and
// any percentage that needs it renders "—" instead.
// ============================================================

import { ChevronDown, ListOrdered } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MatchCountFields } from "@/types";
import { cn } from "@/lib/utils";

export type CountKey = keyof MatchCountFields;

export interface CountFieldGroup {
  title: string;
  fields: ReadonlyArray<{ key: CountKey; label: string }>;
}

/** Field order mirrors how a coach counts courtside. */
export const COUNT_FIELD_GROUPS: ReadonlyArray<CountFieldGroup> = [
  {
    title: "Serve",
    fields: [
      { key: "firstServeAttempts", label: "1st serve attempts" },
      { key: "firstServesIn", label: "1st serves in" },
      { key: "firstServePointsWon", label: "1st serve points won" },
      { key: "secondServePlayed", label: "2nd serves played" },
      { key: "secondServePointsWon", label: "2nd serve points won" },
      { key: "aces", label: "Aces" },
      { key: "doubleFaults", label: "Double faults" },
    ],
  },
  {
    title: "Return & break points",
    fields: [
      { key: "returnPointsPlayed", label: "Return points played" },
      { key: "returnPointsWon", label: "Return points won" },
      { key: "breakPointsCreated", label: "Break points created" },
      { key: "breakPointsConverted", label: "Break points converted" },
      { key: "breakPointsFaced", label: "Break points faced" },
      { key: "breakPointsSaved", label: "Break points saved" },
    ],
  },
  {
    title: "Rally & net",
    fields: [
      { key: "winners", label: "Winners" },
      { key: "forcedErrors", label: "Forced errors" },
      { key: "unforcedErrors", label: "Unforced errors" },
      { key: "netApproaches", label: "Net approaches" },
      { key: "netPointsWon", label: "Net points won" },
    ],
  },
];

export const ALL_COUNT_KEYS: CountKey[] = COUNT_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export const RALLY_BUCKET_KEYS = ["1-4", "5-8", "9+"] as const;
export type RallyBucketKey = (typeof RALLY_BUCKET_KEYS)[number];

const BUCKET_LABEL: Record<RallyBucketKey, string> = {
  "1-4": "Rallies 1–4 shots",
  "5-8": "Rallies 5–8 shots",
  "9+": "Rallies 9+ shots",
};

export interface MatchStatsFieldsProps {
  counts: Record<CountKey, string>;
  buckets: Record<RallyBucketKey, string>;
  onCountChange: (key: CountKey, value: string) => void;
  onBucketChange: (key: RallyBucketKey, value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Field-level messages (e.g. "cannot exceed attempts"). */
  errors?: Partial<Record<CountKey, string>>;
}

export function MatchStatsFields({
  counts,
  buckets,
  onCountChange,
  onBucketChange,
  open,
  onOpenChange,
  errors,
}: MatchStatsFieldsProps) {
  const filled = ALL_COUNT_KEYS.filter((k) => counts[k] !== "").length;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border border-border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center bg-primary/10 text-primary">
            <ListOrdered className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">Detailed stats (optional)</span>
            <span className="block text-xs text-muted-foreground">
              {filled > 0
                ? `${filled} count${filled === 1 ? "" : "s"} entered — blanks stay blank, never zero`
                : "Add only what you counted. Anything left blank is never treated as zero."}
            </span>
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-5 border-t border-border p-4">
          {COUNT_FIELD_GROUPS.map((group) => (
            <fieldset key={group.title} className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.fields.map((field) => {
                  const id = `count-${field.key}`;
                  const error = errors?.[field.key];
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={id} className="text-xs text-muted-foreground">
                        {field.label}
                      </Label>
                      <Input
                        id={id}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="—"
                        value={counts[field.key]}
                        aria-invalid={error ? true : undefined}
                        onChange={(e) => onCountChange(field.key, e.target.value)}
                      />
                      {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rally lengths
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {RALLY_BUCKET_KEYS.map((bucket) => {
                const id = `bucket-${bucket}`;
                return (
                  <div key={bucket} className="space-y-1.5">
                    <Label htmlFor={id} className="text-xs text-muted-foreground">
                      {BUCKET_LABEL[bucket]}
                    </Label>
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder="—"
                      value={buckets[bucket]}
                      onChange={(e) => onBucketChange(bucket, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
