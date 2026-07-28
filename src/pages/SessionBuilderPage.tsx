import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { SurfacePicker } from "@/components/SurfacePicker";
import {
  Dumbbell,
  Sparkles,
  Clock,
  Target,
  CheckCircle2,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ClipboardList,
  Save,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConnections } from "@/store/ConnectionStore";
import { useCreateTrainingPlan } from "@/hooks/api/queries";
import { sessionToTrainingPlanInput } from "@/lib/session/toTrainingPlan";
import { generateSession } from "@/lib/session/generateSession";
import {
  FOCUS_LABELS,
  GOAL_LABELS,
  type FocusArea,
  type GeneratedSession,
  type PlayerLevel,
  type SessionFormat,
  type SessionGoal,
  type SessionPreferences,
} from "@/lib/session/types";
import type { Intensity, Surface } from "@/types";

const ALL_FOCUS = Object.keys(FOCUS_LABELS) as FocusArea[];

const blockAccent: Record<string, string> = {
  warmup: "border-l-muted-foreground",
  technical: "border-l-primary",
  tactical: "border-l-primary",
  live: "border-l-primary",
  cooldown: "border-l-muted-foreground",
};

export default function SessionBuilderPage() {
  const [prefs, setPrefs] = useState<SessionPreferences>({
    level: "intermediate",
    focusAreas: ["serve", "forehand"],
    durationMinutes: 90,
    intensity: "medium",
    format: "individual",
    playersCount: 1,
    surface: "hard",
    goal: "technical",
  });
  const [session, setSession] = useState<GeneratedSession | null>(null);

  const { connectedPlayers } = useConnections();
  const createPlan = useCreateTrainingPlan();
  const [saveOpen, setSaveOpen] = useState(false);
  const [savePlayerId, setSavePlayerId] = useState("");

  const openSave = () => {
    setSavePlayerId(connectedPlayers[0]?.id ?? "");
    setSaveOpen(true);
  };
  const saveSession = () => {
    if (!session || !savePlayerId) return;
    createPlan.mutate(sessionToTrainingPlanInput(session, savePlayerId), {
      onSuccess: () => setSaveOpen(false),
    });
  };

  const set = <K extends keyof SessionPreferences>(key: K, value: SessionPreferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const toggleFocus = (f: FocusArea) =>
    setPrefs((p) => {
      const has = p.focusAreas.includes(f);
      if (has) {
        if (p.focusAreas.length === 1) return p; // keep at least one
        return { ...p, focusAreas: p.focusAreas.filter((x) => x !== f) };
      }
      if (p.focusAreas.length >= 3) return p; // cap at three
      return { ...p, focusAreas: [...p.focusAreas, f] };
    });

  const generate = () => setSession(generateSession(prefs));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" /> Session Builder
        </h1>
        <p className="text-sm text-muted-foreground">
          Set your preferences and generate a structured, best-practice tennis session — with exactly what to do and how
          to do it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Preferences */}
        <DashboardCard title="Coach preferences" description="Tune the session, then generate" icon={<Target className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Session goal</Label>
              <Select value={prefs.goal} onValueChange={(v) => set("goal", v as SessionGoal)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_LABELS) as SessionGoal[]).map((g) => (
                    <SelectItem key={g} value={g}>{GOAL_LABELS[g]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Focus areas <span className="text-muted-foreground">(1–3)</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_FOCUS.map((f) => {
                  const active = prefs.focusAreas.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleFocus(f)}
                      aria-pressed={active}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {FOCUS_LABELS[f]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Select value={prefs.level} onValueChange={(v) => set("level", v as PlayerLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Intensity</Label>
                <Select
                  value={prefs.intensity}
                  onValueChange={(v) => set("intensity", v as Intensity)}
                  disabled={prefs.goal === "recovery"}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select
                  value={String(prefs.durationMinutes)}
                  onValueChange={(v) => set("durationMinutes", Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[45, 60, 75, 90, 120].map((m) => (
                      <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Surface / court</Label>
                <SurfacePicker value={prefs.surface} onChange={(s) => set("surface", s)} />
              </div>
              <div className="space-y-1.5">
                <Label>Format</Label>
                <Select
                  value={prefs.format}
                  onValueChange={(v) => set("format", v as SessionFormat)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Players</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={prefs.playersCount}
                  disabled={prefs.format === "individual"}
                  onChange={(e) => set("playersCount", Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>

            <Button className="w-full gap-2" onClick={generate}>
              <Sparkles className="h-4 w-4" /> Generate session
            </Button>
          </div>
        </DashboardCard>

        {/* Result */}
        <div className="space-y-4">
          {!session ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-10 text-center">
              <Dumbbell className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No session yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Choose a goal and focus areas on the left, then hit <span className="font-medium">Generate session</span>{" "}
                to build a full plan.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{session.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{session.summary}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={openSave}>
                    <Save className="h-3.5 w-3.5" /> Save to plan
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{session.totalMinutes} min</Badge>
                  <Badge variant="secondary" className="capitalize">{session.intensity} intensity</Badge>
                  <Badge variant="secondary" className="capitalize">{session.surface}</Badge>
                  <Badge variant="secondary" className="capitalize">{session.format}{session.format === "group" ? ` · ${session.playersCount}` : ""}</Badge>
                  {session.focusAreas.map((f) => (
                    <Badge key={f} className="bg-primary/10 text-primary hover:bg-primary/10">{FOCUS_LABELS[f]}</Badge>
                  ))}
                </div>
              </div>

              {session.blocks.map((block, bi) => (
                <div key={bi} className={`rounded-xl border border-l-4 border-border bg-card p-5 ${blockAccent[block.kind] ?? ""}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold text-foreground">{block.title}</h3>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{block.minutes} min</span>
                  </div>
                  <p className="mt-0.5 text-xs italic text-muted-foreground">{block.rationale}</p>

                  <div className="mt-3 space-y-3">
                    {block.drills.map((d, di) => (
                      <div key={di} className="rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{d.name}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{d.durationMinutes} min · {d.category}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground"><span className="font-medium text-muted-foreground">What:</span> {d.whatToDo}</p>
                        <div className="mt-1.5">
                          <p className="text-xs font-medium text-muted-foreground">How:</p>
                          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-foreground">
                            {d.howToDo.map((cue, ci) => <li key={ci}>{cue}</li>)}
                          </ul>
                        </div>
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-primary">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span><span className="font-medium">Success:</span> {d.successCriteria}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="grid gap-4 sm:grid-cols-2">
                <DashboardCard title="Equipment checklist" icon={<ListChecks className="h-4 w-4" />}>
                  {session.equipmentChecklist.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No special equipment needed.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-foreground">
                      {session.equipmentChecklist.map((e) => (
                        <li key={e} className="flex items-center gap-2 capitalize"><ClipboardList className="h-3.5 w-3.5 text-muted-foreground" /> {e}</li>
                      ))}
                    </ul>
                  )}
                </DashboardCard>
                <DashboardCard title="Coaching principles" icon={<Lightbulb className="h-4 w-4" />}>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                    {session.coachingPrinciples.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </DashboardCard>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><AlertTriangle className="h-4 w-4 text-muted-foreground" /> Notes</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {session.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save session to a player's plan</DialogTitle>
            <DialogDescription>
              The full session — drills, coaching cues and success targets — is saved to the selected player's training
              plan.
            </DialogDescription>
          </DialogHeader>
          {connectedPlayers.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              You have no connected players yet. Connect a player first, then save the session to their plan.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Player</Label>
              <Select value={savePlayerId} onValueChange={setSavePlayerId}>
                <SelectTrigger><SelectValue placeholder="Select a player" /></SelectTrigger>
                <SelectContent>
                  {connectedPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button disabled={!savePlayerId || createPlan.isPending} onClick={saveSession}>
              <Save className="mr-1.5 h-4 w-4" /> {createPlan.isPending ? "Saving…" : "Save session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
