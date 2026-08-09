// Training Management — Full Coach CRUD via React Query
import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useConnections } from "@/store/ConnectionStore";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamFilterSelect } from "@/components/TeamFilterSelect";
import { PlayerFilterSelect } from "@/components/PlayerFilterSelect";
import { PlayerDetailDrawer } from "@/components/PlayerDetailDrawer";
import {
  Dumbbell, Plus, Calendar, MapPin, Clock, Users, Pencil, Trash2,
  Target, Zap, StickyNote, Search, Star, ClipboardCheck, MessageCircle, Sparkles, RefreshCw, AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrainingReviewDialog } from "@/components/training/TrainingReviewDialog";
import { PlayerFeedbackDialog } from "@/components/training/PlayerFeedbackDialog";
import { DiscardChangesDialog } from "@/components/training/DiscardChangesDialog";
import type { TrainingSession, TrainingType, ConnectedPlayer, PlayerSessionFeedback } from "@/types";
import { useAuth } from "@/auth/AuthContext";
import { useTrainings, useCreateTraining, useUpdateTraining, useDeleteTraining, useTeams, useAnalyzeTraining } from "@/hooks/api/queries";
import { format, parseISO, isPast } from "date-fns";

const TRAINING_TYPES: { value: TrainingType; label: string }[] = [
  { value: "individual", label: "Individual Training" },
  { value: "team", label: "Team Training" },
  { value: "match_practice", label: "Match Practice" },
  { value: "fitness", label: "Fitness" },
  { value: "recovery", label: "Recovery" },
  { value: "tactical", label: "Tactical Session" },
];

const TRAINING_TYPE_LABELS: Record<TrainingType, string> = Object.fromEntries(
  TRAINING_TYPES.map((t) => [t.value, t.label])
) as Record<TrainingType, string>;

const INTENSITY_OPTIONS = [
  { value: "low", label: "Low", color: "bg-muted text-foreground dark:text-foreground" },
  { value: "medium", label: "Medium", color: "bg-primary/10 text-primary dark:text-primary" },
  { value: "high", label: "High", color: "bg-primary/10 text-primary dark:text-primary" },
] as const;

// ─── Training Form ───

interface TrainingFormData {
  title: string;
  trainingType: TrainingType;
  startDate: string;
  endDate: string;
  location: string;
  goal: string;
  intensity: string;
  notes: string;
  coachNotes: string;
  playerIds: string[];
  teamId: string;
}

const emptyForm: TrainingFormData = {
  title: "", trainingType: "individual", startDate: "", endDate: "", location: "",
  goal: "", intensity: "medium", notes: "", coachNotes: "", playerIds: [], teamId: "",
};

function toForm(t: TrainingSession): TrainingFormData {
  return {
    title: t.title, trainingType: t.trainingType,
    startDate: format(parseISO(t.startDate), "yyyy-MM-dd'T'HH:mm"),
    endDate: format(parseISO(t.endDate), "yyyy-MM-dd'T'HH:mm"),
    location: t.location ?? "", goal: t.goal ?? "",
    intensity: t.intensity ?? "medium", notes: t.notes ?? "",
    coachNotes: t.coachNotes ?? "", playerIds: [...t.playerIds],
    teamId: t.teamId ?? "",
  };
}

function TrainingFormDialog({
  open, onOpenChange, initial, onSave, saving, preselectedPlayerIds,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Rejects when the save fails — the dialog then stays open with the input intact. */
  initial?: TrainingSession; onSave: (data: TrainingFormData) => void | Promise<void>; saving?: boolean;
  preselectedPlayerIds?: string[];
}) {
  const { connectedPlayers } = useConnections();
  const { data: teams = [] } = useTeams();
  const [form, setForm] = useState<TrainingFormData>(() => {
    if (initial) return toForm(initial);
    const base = { ...emptyForm };
    if (preselectedPlayerIds?.length) base.playerIds = [...preselectedPlayerIds];
    return base;
  });
  const pristine = useRef(JSON.stringify(form));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(form) !== pristine.current;

  const update = <K extends keyof TrainingFormData>(k: K, v: TrainingFormData[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const togglePlayer = (id: string) => {
    setForm((prev) => ({
      ...prev,
      playerIds: prev.playerIds.includes(id)
        ? prev.playerIds.filter((p) => p !== id)
        : [...prev.playerIds, id],
    }));
  };

  const selectTeam = (teamId: string) => {
    if (teamId === "__none__") { update("teamId", ""); return; }
    const team = teams.find((t) => t.id === teamId);
    if (team) { update("teamId", teamId); update("playerIds", team.players.map((p) => p.id)); }
  };

  const valid = form.title.trim() && form.startDate && form.endDate;

  // Only close once the mutation has actually succeeded — a failed save must
  // leave the coach's input exactly where it was.
  const handleSave = async () => {
    if (!valid || saving) return;
    setSaveError(null);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (e) {
      setSaveError((e as { message?: string })?.message ?? "Could not save the training. Your input is still here — try again.");
    }
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) { setConfirmDiscard(true); return; }
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); else onOpenChange(true); }}>
      <DialogContent
        className="sm:max-w-lg max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => { if (dirty || saving) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Training" : "Create Training"}</DialogTitle>
          <DialogDescription>
            {initial ? "Update training details." : "Schedule a new training session for your connected players."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Morning Drills" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Training Type</Label>
              <Select value={form.trainingType} onValueChange={(v) => update("trainingType", v as TrainingType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRAINING_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Intensity</Label>
              <Select value={form.intensity} onValueChange={(v) => update("intensity", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INTENSITY_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start *</Label><Input type="datetime-local" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End *</Label><Input type="datetime-local" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="Court A, Gym, etc." /></div>
          <div className="space-y-1.5"><Label>Training Goal</Label><Input value={form.goal} onChange={(e) => update("goal", e.target.value)} placeholder="e.g. Improve backhand consistency" /></div>
          <div className="space-y-1.5">
            <Label>Assign to Team</Label>
            <Select value={form.teamId || "__none__"} onValueChange={selectTeam}>
              <SelectTrigger><SelectValue placeholder="No team — pick players manually" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No team</SelectItem>
                {teams.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name} ({t.players.length} players)</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Assign Players</Label>
            {connectedPlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No connected players.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                {connectedPlayers.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-accent/30">
                    <Checkbox checked={form.playerIds.includes(p.id)} onCheckedChange={() => togglePlayer(p.id)} />
                    <span className="text-sm text-foreground">{p.firstName} {p.lastName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{p.playerPublicId}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Visible to players" rows={2} /></div>
          <div className="space-y-1.5"><Label>Coach Notes <span className="text-muted-foreground">(private)</span></Label><Textarea value={form.coachNotes} onChange={(e) => update("coachNotes", e.target.value)} placeholder="Only visible to you" rows={2} /></div>
          {saveError && (
            <p className="flex items-start gap-1.5 border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {saveError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Create Training"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DiscardChangesDialog
      open={confirmDiscard}
      onOpenChange={setConfirmDiscard}
      what={initial ? "changes" : "new training"}
      onConfirm={() => onOpenChange(false)}
    />
    </>
  );
}

// ─── Training Detail Drawer ───

function TrainingDetailDrawer({
  training, open, onOpenChange, onEdit, onDelete, onReview, onPlayerFeedback, readOnly, isPlayer, deleting,
  onAnalyze, analyzing, analyzeError,
}: {
  training: TrainingSession | null; open: boolean; onOpenChange: (o: boolean) => void;
  onEdit: () => void; onDelete: () => void; onReview?: () => void; onPlayerFeedback?: () => void;
  readOnly?: boolean; isPlayer?: boolean; deleting?: boolean;
  onAnalyze?: () => void; analyzing?: boolean; analyzeError?: string | null;
}) {
  const { connectedPlayers } = useConnections();
  if (!training) return null;
  const players = connectedPlayers.filter((p) => training.playerIds.includes(p.id));
  const intensityCfg = INTENSITY_OPTIONS.find((o) => o.value === training.intensity);
  const past = isPast(parseISO(training.endDate));

  const FEELING_EMOJI: Record<string, string> = { awful: "😫", bad: "😕", okay: "😐", good: "🙂", great: "🤩" };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><Dumbbell className="h-4 w-4 text-primary" />Training Detail</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-5">
          <h3 className="text-lg font-semibold text-foreground">{training.title}</h3>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[11px] font-medium text-foreground">{TRAINING_TYPE_LABELS[training.trainingType]}</span>
            {intensityCfg && <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${intensityCfg.color}`}><Zap className="mr-1 h-3 w-3" /> {intensityCfg.label}</span>}
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4 shrink-0" />{format(parseISO(training.startDate), "EEEE, MMM d")} · {format(parseISO(training.startDate), "h:mm a")} – {format(parseISO(training.endDate), "h:mm a")}</div>
            {training.location && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{training.location}</div>}
            {training.goal && <div className="flex items-center gap-2 text-muted-foreground"><Target className="h-4 w-4 shrink-0" />{training.goal}</div>}
            <div className="flex items-start gap-2 text-muted-foreground"><Users className="h-4 w-4 shrink-0 mt-0.5" /><div>{players.length > 0 ? players.map((p) => `${p.firstName} ${p.lastName}`).join(", ") : "No players assigned"}</div></div>
            {training.notes && <div className="rounded-lg border border-border bg-secondary/30 p-3"><div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><StickyNote className="h-3 w-3" /> Notes</div><p className="text-sm text-foreground">{training.notes}</p></div>}
            {!readOnly && training.coachNotes && <div className="rounded-lg border border-border bg-primary/5 p-3"><div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary"><StickyNote className="h-3 w-3" /> Coach Notes (private)</div><p className="text-sm text-primary/80">{training.coachNotes}</p></div>}
          </div>

          {/* Training Review Section */}
          {training.review && (
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary dark:text-primary">
                  <ClipboardCheck className="h-3 w-3" /> Session Review
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`h-3 w-3 ${s <= training.review!.rating ? "fill-primary text-primary" : "text-muted-foreground/20"}`} />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-foreground"><span className="font-medium text-muted-foreground">Worked on:</span> {training.review.workedOn}</p>
                {training.review.nextSteps && <p className="text-xs text-primary"><span className="font-medium">Next steps:</span> {training.review.nextSteps}</p>}
                {training.review.playerFeedback && <p className="text-xs text-foreground"><span className="font-medium text-muted-foreground">Player feedback:</span> {training.review.playerFeedback}</p>}
              </div>
              <p className="text-[10px] text-muted-foreground">Reviewed {format(parseISO(training.review.reviewedAt), "MMM d, yyyy 'at' h:mm a")}</p>
            </div>
          )}

          {/* Player Session Feedback */}
          {training.playerSessionFeedback && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MessageCircle className="h-3 w-3" /> Player Feedback
                </div>
                <span className="text-lg">{FEELING_EMOJI[training.playerSessionFeedback.feeling] ?? ""}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Energy: {training.playerSessionFeedback.energyLevel}/5</span>
              </div>
              {training.playerSessionFeedback.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {training.playerSessionFeedback.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{tag}</span>
                  ))}
                </div>
              )}
              {training.playerSessionFeedback.note && (
                <p className="text-xs text-foreground italic">"{training.playerSessionFeedback.note}"</p>
              )}
              <p className="text-[10px] text-muted-foreground">Submitted {format(parseISO(training.playerSessionFeedback.submittedAt), "MMM d, yyyy")}</p>
            </div>
          )}

          {/* Session analysis */}
          {(training.analysis || (past && onAnalyze)) && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> Session Summary
                </div>
                {onAnalyze && past && !analyzing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={onAnalyze}
                  >
                    <RefreshCw className="h-3 w-3" />
                    {analyzeError ? "Try again" : training.analysis ? "Re-analyze" : "Analyze"}
                  </Button>
                )}
              </div>
              {analyzing ? (
                <div className="space-y-1.5" role="status" aria-label="Generating analysis">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[92%]" />
                  <Skeleton className="h-3 w-[78%]" />
                  <Skeleton className="h-3 w-[60%]" />
                  <p className="pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Generating summary…
                  </p>
                </div>
              ) : analyzeError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 space-y-2">
                  <div className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-medium">Analysis failed</p>
                      <p className="text-destructive/80">{analyzeError}</p>
                    </div>
                  </div>
                  {onAnalyze && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onAnalyze}>
                      <RefreshCw className="h-3 w-3" /> Retry
                    </Button>
                  )}
                  {training.analysis && (
                    <p className="text-[10px] text-muted-foreground">
                      Showing the last successful summary below.
                    </p>
                  )}
                </div>
              ) : null}
              {!analyzing && training.analysis ? (
                <>
                  <p className="text-xs leading-relaxed text-foreground">{training.analysis.summary}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Generated {format(parseISO(training.analysis.generatedAt), "MMM d, yyyy 'at' h:mm a")}
                    {training.analysis.model ? ` · ${training.analysis.model}` : ""}
                  </p>
                </>
              ) : !analyzing && !analyzeError ? (
                <p className="text-xs text-muted-foreground">
                  Generate a structured performance summary of this session.
                </p>
              ) : null}
            </div>
          )}

          {/* Coach actions */}
          {!readOnly && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {past && onReview && (
                <Button size="sm" variant="outline" onClick={onReview} className="gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5" /> {training.review ? "Edit Review" : "Review Session"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
              <Button size="sm" variant="outline" onClick={onDelete} disabled={deleting} className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete"}</Button>
            </div>
          )}

          {/* Player feedback action */}
          {isPlayer && past && onPlayerFeedback && (
            <div className="border-t border-border pt-4">
              <Button size="sm" variant="outline" onClick={onPlayerFeedback} className="gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" /> {training.playerSessionFeedback ? "Edit Feedback" : "Leave Feedback"}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DeleteTrainingDialog({ open, onOpenChange, title, onConfirm, loading }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; onConfirm: () => void; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Delete Training</DialogTitle><DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">"{title}"</span>? This action cannot be undone.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={loading} onClick={() => { onConfirm(); onOpenChange(false); }}><Trash2 className="mr-1.5 h-4 w-4" /> {loading ? "Deleting…" : "Delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ───

export default function TrainingsPage() {
  const { user } = useAuth();
  const { connectedPlayers } = useConnections();
  const role = user?.role ?? "player";
  const isCoach = role === "coach";
  const readOnly = !isCoach;

  const { data: trainings = [], isLoading, error } = useTrainings();
  const { data: teams = [] } = useTeams();
  const createMut = useCreateTraining();
  const updateMut = useUpdateTraining();
  const deleteMut = useDeleteTraining();
  const analyzeMut = useAnalyzeTraining();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TrainingSession | undefined>(undefined);
  const [detailTarget, setDetailTarget] = useState<TrainingSession | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrainingSession | null>(null);
  const [preselectedPlayerIds, setPreselectedPlayerIds] = useState<string[]>([]);
  const [reviewTarget, setReviewTarget] = useState<TrainingSession | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<TrainingSession | null>(null);

  const [search, setSearch] = useState("");
  const [playerFilter, setPlayerFilter] = useState("__all__");
  const [teamFilter, setTeamFilter] = useState("__all__");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [timeFilter, setTimeFilter] = useState<"upcoming" | "past" | "all">("upcoming");

  // Player detail drawer
  const [playerDetailOpen, setPlayerDetailOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<ConnectedPlayer | null>(null);

  // Team filter → restrict player filter options
  const teamPlayerIds = useMemo(() => {
    if (teamFilter === "__all__") return null;
    const team = teams.find((t) => t.id === teamFilter);
    return new Set(team?.players.map((p) => p.id) ?? []);
  }, [teamFilter, teams]);

  const filteredPlayers = useMemo(() => {
    if (!teamPlayerIds) return connectedPlayers;
    return connectedPlayers.filter((p) => teamPlayerIds.has(p.id));
  }, [connectedPlayers, teamPlayerIds]);

  const filtered = useMemo(() => {
    return trainings.filter((t) => {
      const q = search.toLowerCase();
      if (q && !t.title.toLowerCase().includes(q) && !(t.location ?? "").toLowerCase().includes(q)) return false;
      if (playerFilter !== "__all__" && !t.playerIds.includes(playerFilter)) return false;
      if (teamPlayerIds && !t.playerIds.some((pid) => teamPlayerIds.has(pid))) return false;
      if (typeFilter !== "__all__" && t.trainingType !== typeFilter) return false;
      if (timeFilter === "upcoming" && isPast(parseISO(t.endDate))) return false;
      if (timeFilter === "past" && !isPast(parseISO(t.endDate))) return false;
      return true;
    }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [trainings, search, playerFilter, teamFilter, typeFilter, timeFilter, teamPlayerIds]);

  // ── Deep link: /trainings?filter=past&review=<trainingId>
  // Applied once per mount. The `review` param is dropped from the URL as soon
  // as it is consumed so a refresh doesn't reopen the dialog; `filter` stays so
  // the list the coach was sent to remains shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkApplied = useRef(false);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);

  useEffect(() => {
    if (deepLinkApplied.current) return;
    const filterParam = searchParams.get("filter");
    const reviewParam = searchParams.get("review");
    if (!filterParam && !reviewParam) return;
    deepLinkApplied.current = true;

    if (filterParam === "past" || filterParam === "upcoming" || filterParam === "all") setTimeFilter(filterParam);
    if (reviewParam) {
      setPendingReviewId(reviewParam);
      const next = new URLSearchParams(searchParams);
      next.delete("review");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Resolve the requested session once the list has loaded. An unknown id just
  // leaves the filter applied — no dialog, no crash.
  useEffect(() => {
    if (!pendingReviewId || isLoading) return;
    const match = trainings.find((t) => t.id === pendingReviewId);
    setPendingReviewId(null);
    if (match && isCoach) setReviewTarget(match);
  }, [pendingReviewId, isLoading, trainings, isCoach]);

  const handleCreate = (playerIds?: string[]) => {
    setEditTarget(undefined);
    setPreselectedPlayerIds(playerIds ?? []);
    setFormOpen(true);
  };

  // Throws on failure so TrainingFormDialog can stay open with the input intact.
  const handleSave = async (data: TrainingFormData) => {
    if (editTarget) {
      await updateMut.mutateAsync({
        id: editTarget.id,
        data: {
          title: data.title, trainingType: data.trainingType,
          startDate: new Date(data.startDate).toISOString(),
          endDate: new Date(data.endDate).toISOString(),
          location: data.location || undefined, goal: data.goal || undefined,
          intensity: (data.intensity as "low" | "medium" | "high") || undefined,
          notes: data.notes || undefined, coachNotes: data.coachNotes || undefined,
          playerIds: data.playerIds, teamId: data.teamId || undefined,
        },
      });
    } else {
      await createMut.mutateAsync({
        title: data.title, trainingType: data.trainingType,
        coachId: user?.id ?? "", playerIds: data.playerIds,
        teamId: data.teamId || undefined,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        location: data.location || undefined, goal: data.goal || undefined,
        intensity: (data.intensity as "low" | "medium" | "high") || undefined,
        notes: data.notes || undefined, coachNotes: data.coachNotes || undefined,
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteMut.mutate(id, { onSuccess: () => { setDetailOpen(false); setDetailTarget(null); } });
  };

  const openDetail = (t: TrainingSession) => { setDetailTarget(t); setDetailOpen(true); };
  const openEdit = (t: TrainingSession) => { setEditTarget(t); setPreselectedPlayerIds([]); setDetailOpen(false); setFormOpen(true); };

  const handleViewPlayerDetail = (player: ConnectedPlayer) => {
    setDetailPlayer(player);
    setPlayerDetailOpen(true);
  };

  if (isLoading) return <LoadingState message="Loading trainings…" />;
  if (error) return <ErrorState message="Failed to load trainings" onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trainings</h1>
          <p className="text-sm text-muted-foreground">{isCoach ? "Create and manage training sessions for your connected players." : "View your assigned training sessions."}</p>
        </div>
        {isCoach && <Button className="gap-2 self-start" onClick={() => handleCreate()}><Plus className="h-4 w-4" /> Create Training</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search trainings…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        {isCoach && <TeamFilterSelect teams={teams} value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setPlayerFilter("__all__"); }} />}
        <PlayerFilterSelect players={filteredPlayers} value={playerFilter} onValueChange={setPlayerFilter} onViewDetail={isCoach ? handleViewPlayerDetail : undefined} />
        <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[170px]"><SelectValue placeholder="All Types" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Types</SelectItem>{TRAINING_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}</SelectContent></Select>
        <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as typeof timeFilter)}><TabsList><TabsTrigger value="upcoming">Upcoming</TabsTrigger><TabsTrigger value="past">Past</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList></Tabs>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Dumbbell className="h-6 w-6 text-muted-foreground" />} title="No training sessions" description={search || playerFilter !== "__all__" || typeFilter !== "__all__" || teamFilter !== "__all__" ? "No trainings match your filters." : "Create your first training session."}>
          {isCoach && !search && <Button onClick={() => handleCreate()} className="gap-1.5"><Plus className="h-4 w-4" /> Create Training</Button>}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const players = connectedPlayers.filter((p) => t.playerIds.includes(p.id));
            const intensityCfg = INTENSITY_OPTIONS.find((o) => o.value === t.intensity);
            const past = isPast(parseISO(t.endDate));
            return (
              <button key={t.id} onClick={() => openDetail(t)} className={`flex w-full items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/20 hover:bg-accent/20 ${past ? "opacity-60" : ""}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Dumbbell className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{t.title}</h3>
                    <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{TRAINING_TYPE_LABELS[t.trainingType]}</span>
                    {intensityCfg && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${intensityCfg.color}`}>{intensityCfg.label}</span>}
                    {t.review && (
                      <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary dark:text-primary">
                        <Star className="h-2.5 w-2.5 fill-current" /> {t.review.rating}
                      </span>
                    )}
                    {past && !t.review && isCoach && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Unreviewed</span>
                    )}
                    {t.playerSessionFeedback && (
                      <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {({ awful: "😫", bad: "😕", okay: "😐", good: "🙂", great: "🤩" })[t.playerSessionFeedback.feeling]}
                      </span>
                    )}
                    {!isCoach && past && !t.playerSessionFeedback && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Give feedback</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(parseISO(t.startDate), "MMM d, h:mm a")} – {format(parseISO(t.endDate), "h:mm a")}</span>
                    {t.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {t.location}</span>}
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{players.length > 0 ? players.map((p) => p.firstName).join(", ") : "No players"}</span>
                  </div>
                  {t.goal && <p className="mt-1 text-xs text-muted-foreground"><Target className="mr-1 inline h-3 w-3" />{t.goal}</p>}
                </div>
                {isCoach && (
                  <div className="flex items-center gap-1 shrink-0">
                    {past && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setReviewTarget(t); }} title="Review session"><ClipboardCheck className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${t.title}`} onClick={(e) => { e.stopPropagation(); openEdit(t); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${t.title}`} onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
                {!isCoach && past && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setFeedbackTarget(t); }} title="Leave feedback"><MessageCircle className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {formOpen && <TrainingFormDialog key={editTarget?.id ?? "new"} open={formOpen} onOpenChange={setFormOpen} initial={editTarget} onSave={handleSave} saving={createMut.isPending || updateMut.isPending} preselectedPlayerIds={preselectedPlayerIds} />}
      <TrainingDetailDrawer training={detailTarget} open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) { setDetailTarget(null); analyzeMut.reset(); } }} onEdit={() => detailTarget && openEdit(detailTarget)} onDelete={() => detailTarget && setDeleteTarget(detailTarget)} onReview={isCoach ? () => { if (detailTarget) { setReviewTarget(detailTarget); } } : undefined} onPlayerFeedback={!isCoach ? () => { if (detailTarget) setFeedbackTarget(detailTarget); } : undefined} readOnly={readOnly} isPlayer={!isCoach} deleting={deleteMut.isPending} onAnalyze={detailTarget ? () => analyzeMut.mutate(detailTarget.id) : undefined} analyzing={analyzeMut.isPending} analyzeError={analyzeMut.isError ? ((analyzeMut.error as any)?.message ?? "Unable to reach the analysis service. Check your connection and try again.") : null} />
      {deleteTarget && <DeleteTrainingDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title={deleteTarget.title} onConfirm={() => { handleDelete(deleteTarget.id); setDeleteTarget(null); }} loading={deleteMut.isPending} />}
      {reviewTarget && <TrainingReviewDialog open={!!reviewTarget} onOpenChange={(o) => { if (!o) setReviewTarget(null); }} training={reviewTarget} onSave={async (review) => { await updateMut.mutateAsync({ id: reviewTarget.id, data: { review } }); }} saving={updateMut.isPending} />}
      {feedbackTarget && <PlayerFeedbackDialog open={!!feedbackTarget} onOpenChange={(o) => { if (!o) setFeedbackTarget(null); }} training={feedbackTarget} onSave={(feedback) => { updateMut.mutate({ id: feedbackTarget.id, data: { playerSessionFeedback: feedback } }); setFeedbackTarget(null); }} saving={updateMut.isPending} />}
      <PlayerDetailDrawer player={detailPlayer} open={playerDetailOpen} onOpenChange={setPlayerDetailOpen} onCreateTraining={(pid) => handleCreate([pid])} />
    </div>
  );
}
