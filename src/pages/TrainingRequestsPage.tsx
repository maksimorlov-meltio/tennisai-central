// Training Requests — Player creates requests, Coach approves/rejects/reschedules
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, LoadingState, ErrorState, StatusBadge, ReadOnlyBanner, ReadOnlyBadge } from "@/components/ui/shared";
import {
  useTrainingRequests,
  useCreateTrainingRequest,
  useApproveTrainingRequest,
  useRejectTrainingRequest,
  useRescheduleTrainingRequest,
  useCancelTrainingRequest,
} from "@/hooks/api/queries";
import {
  Plus, Calendar, Clock, MapPin, User, Dumbbell, MessageSquare, Check, X, RefreshCw, Send, AlertCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TrainingRequest, TrainingType, TrainingRequestStatus } from "@/types";

const TRAINING_TYPES: { value: TrainingType; label: string }[] = [
  { value: "individual", label: "Individual Training" },
  { value: "team", label: "Team Training" },
  { value: "match_practice", label: "Match Practice" },
  { value: "fitness", label: "Fitness" },
  { value: "recovery", label: "Recovery" },
  { value: "tactical", label: "Tactical Session" },
];

const STATUS_TABS: TrainingRequestStatus[] = ["pending", "approved", "rejected", "reschedule_proposed", "cancelled"];

function RequestStatusBadge({ status }: { status: TrainingRequestStatus }) {
  const styles: Record<TrainingRequestStatus, string> = {
    pending: "bg-primary/10 text-primary dark:text-primary",
    approved: "bg-primary/10 text-primary",
    rejected: "bg-destructive/10 text-destructive",
    reschedule_proposed: "bg-muted text-foreground dark:text-foreground",
    cancelled: "bg-muted text-muted-foreground",
  };
  const labels: Record<TrainingRequestStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Declined",
    reschedule_proposed: "New Time Proposed",
    cancelled: "Cancelled",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles[status]}`}>{labels[status]}</span>;
}

// ─── Player Request Form ───
function PlayerRequestForm({ open, onOpenChange, coachId, coachName }: {
  open: boolean; onOpenChange: (o: boolean) => void; coachId: string; coachName: string;
}) {
  const { user } = useAuth();
  const createMut = useCreateTrainingRequest();
  const [form, setForm] = useState({
    preferredDate: "",
    preferredStartTime: "09:00",
    preferredEndTime: "10:30",
    trainingType: "individual" as TrainingType,
    location: "",
    notes: "",
    priority: "normal" as "normal" | "high",
  });

  const valid = form.preferredDate && form.preferredStartTime && form.preferredEndTime;

  const handleSubmit = () => {
    if (!user) return;
    createMut.mutate({
      playerId: user.id,
      playerName: `${user.firstName} ${user.lastName}`,
      coachId,
      coachName,
      ...form,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Request Training</DialogTitle>
          <DialogDescription>Send a training request to {coachName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Preferred Date *</Label>
            <Input type="date" value={form.preferredDate} onChange={(e) => setForm((f) => ({ ...f, preferredDate: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time *</Label>
              <Input type="time" value={form.preferredStartTime} onChange={(e) => setForm((f) => ({ ...f, preferredStartTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time *</Label>
              <Input type="time" value={form.preferredEndTime} onChange={(e) => setForm((f) => ({ ...f, preferredEndTime: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Training Type</Label>
              <Select value={form.trainingType} onValueChange={(v) => setForm((f) => ({ ...f, trainingType: v as TrainingType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRAINING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as "normal" | "high" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Location <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Court A, Gym, etc." />
          </div>
          <div className="space-y-1.5">
            <Label>Notes for Coach <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="What would you like to work on?" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!valid || createMut.isPending}>
            {createMut.isPending ? "Sending…" : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Coach Action Drawer ───
function CoachRequestDrawer({ request, open, onOpenChange }: {
  request: TrainingRequest | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const approveMut = useApproveTrainingRequest();
  const rejectMut = useRejectTrainingRequest();
  const rescheduleMut = useRescheduleTrainingRequest();

  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [message, setMessage] = useState("");
  const [rescheduleForm, setRescheduleForm] = useState({ proposedDate: "", proposedStartTime: "09:00", proposedEndTime: "10:30" });

  if (!request) return null;
  const isPending = request.status === "pending";
  const typeLabel = TRAINING_TYPES.find((t) => t.value === request.trainingType)?.label ?? request.trainingType;

  const handleApprove = () => {
    approveMut.mutate({ id: request.id, coachMessage: message || undefined }, { onSuccess: () => onOpenChange(false) });
  };
  const handleReject = () => {
    rejectMut.mutate({ id: request.id, coachMessage: message || undefined }, { onSuccess: () => onOpenChange(false) });
  };
  const handleReschedule = () => {
    rescheduleMut.mutate({ id: request.id, data: { ...rescheduleForm, coachMessage: message || undefined } }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Dumbbell className="h-4 w-4 text-primary" /> Training Request</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {request.playerName.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <p className="font-semibold text-foreground">{request.playerName}</p>
                <p className="text-xs text-muted-foreground">{typeLabel}</p>
              </div>
            </div>
            <RequestStatusBadge status={request.status} />
          </div>

          {request.priority === "high" && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-primary dark:text-primary" />
              <span className="text-sm font-medium text-primary dark:text-primary">High Priority</span>
            </div>
          )}

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{request.preferredDate}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{request.preferredStartTime} – {request.preferredEndTime}</span>
            </div>
            {request.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{request.location}</span>
              </div>
            )}
          </div>

          {request.notes && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3 w-3" /> Player Notes
              </div>
              <p className="text-sm text-foreground">{request.notes}</p>
            </div>
          )}

          {request.status === "reschedule_proposed" && request.proposedDate && (
            <div className="rounded-lg border border-border bg-muted p-3">
              <div className="mb-1 text-xs font-medium text-foreground dark:text-foreground">Proposed New Time</div>
              <p className="text-sm text-foreground dark:text-foreground">
                {request.proposedDate} · {request.proposedStartTime} – {request.proposedEndTime}
              </p>
            </div>
          )}

          {request.coachMessage && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Coach Response</div>
              <p className="text-sm text-foreground">{request.coachMessage}</p>
            </div>
          )}

          {isPending && mode === "view" && (
            <>
              <div className="space-y-1.5">
                <Label>Message to Player <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a note…" rows={2} />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button onClick={handleApprove} disabled={approveMut.isPending} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" /> {approveMut.isPending ? "Approving…" : "Approve"}
                </Button>
                <Button variant="outline" onClick={() => setMode("reschedule")} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Propose New Time
                </Button>
                <Button variant="outline" onClick={handleReject} disabled={rejectMut.isPending} className="gap-1.5 text-destructive hover:text-destructive">
                  <X className="h-3.5 w-3.5" /> {rejectMut.isPending ? "Declining…" : "Decline"}
                </Button>
              </div>
            </>
          )}

          {isPending && mode === "reschedule" && (
            <>
              <div className="border-t border-border pt-4 space-y-4">
                <p className="text-sm font-medium text-foreground">Propose New Time</p>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={rescheduleForm.proposedDate} onChange={(e) => setRescheduleForm((f) => ({ ...f, proposedDate: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start</Label>
                    <Input type="time" value={rescheduleForm.proposedStartTime} onChange={(e) => setRescheduleForm((f) => ({ ...f, proposedStartTime: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End</Label>
                    <Input type="time" value={rescheduleForm.proposedEndTime} onChange={(e) => setRescheduleForm((f) => ({ ...f, proposedEndTime: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explain the reschedule…" rows={2} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleReschedule} disabled={!rescheduleForm.proposedDate || rescheduleMut.isPending}>
                  {rescheduleMut.isPending ? "Sending…" : "Send Proposal"}
                </Button>
                <Button variant="outline" onClick={() => setMode("view")}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Cancel confirmation ───
function CancelRequestDialog({ open, onOpenChange, request, onConfirm, loading }: {
  open: boolean; onOpenChange: (o: boolean) => void; request: TrainingRequest; onConfirm: () => void; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            Your request to {request.coachName} for{" "}
            <span className="font-semibold text-foreground">{request.preferredDate}</span>{" "}
            ({request.preferredStartTime} – {request.preferredEndTime}) will be withdrawn. You would need to send a new
            one to ask again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep request</Button>
          <Button variant="destructive" disabled={loading} onClick={() => { onConfirm(); onOpenChange(false); }}>
            <X className="mr-1.5 h-4 w-4" /> {loading ? "Cancelling…" : "Cancel request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ───
export default function TrainingRequestsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const { activeRelationships, connectedPlayers } = useConnections();
  const role = user?.role ?? "player";
  const isPlayer = role === "player";
  const isCoach = role === "coach";
  const isObserver = role === "observer";

  const { data: requests = [], isLoading, error } = useTrainingRequests();
  const cancelMut = useCancelTrainingRequest();

  const [formOpen, setFormOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<TrainingRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TrainingRequestStatus | "all">("all");
  const [cancelTarget, setCancelTarget] = useState<TrainingRequest | null>(null);

  // For player: find connected coach
  const connectedCoach = useMemo(() => {
    if (!isPlayer) return null;
    const rel = activeRelationships.find((r) => {
      const otherRole = r.fromUserId === user?.id ? r.toUserRole : r.fromUserRole;
      return otherRole === "coach";
    });
    if (!rel) return null;
    const isFrom = rel.fromUserId === user?.id;
    return { id: isFrom ? rel.toUserId : rel.fromUserId, name: isFrom ? rel.toUserName : rel.fromUserName };
  }, [activeRelationships, isPlayer, user?.id]);

  // Filter requests by role
  const filtered = useMemo(() => {
    let list = requests;
    if (isPlayer) list = requests.filter((r) => r.playerId === user?.id);
    if (isCoach) list = requests.filter((r) => r.coachId === user?.id);
    if (isObserver) list = [];
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [requests, isPlayer, isCoach, isObserver, user?.id, statusFilter]);

  const pendingCount = requests.filter((r) => r.status === "pending" && (isCoach ? r.coachId === user?.id : r.playerId === user?.id)).length;

  if (isLoading) return <LoadingState message="Loading requests…" />;
  if (error) return <ErrorState message="Failed to load requests" onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Training Requests</h1>
            {isObserver && <ReadOnlyBadge />}
            {pendingCount > 0 && <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{pendingCount}</span>}
          </div>
          <p className="text-muted-foreground">{isPlayer ? "Request training sessions from your coach." : isCoach ? "Review and respond to player training requests." : "View training request activity."}</p>
        </div>
        {isPlayer && connectedCoach && (
          <Button className="gap-2 self-start" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Request Training
          </Button>
        )}
      </div>

      {isObserver && <ReadOnlyBanner />}

      {isPlayer && !connectedCoach && (
        <div className="rounded-lg border border-primary/25 bg-primary/10 p-4">
          <p className="text-sm text-primary dark:text-primary">
            <AlertCircle className="mr-1.5 inline h-4 w-4" />
            You need to connect with a coach before you can request training sessions.
          </p>
        </div>
      )}

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending {pendingCount > 0 && `(${pendingCount})`}</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="reschedule_proposed">Rescheduled</TabsTrigger>
          <TabsTrigger value="rejected">Declined</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        statusFilter !== "all" ? (
          <EmptyState icon={<Dumbbell className="h-6 w-6 text-muted-foreground" />} title={t("empty.trainingRequests.filtered.title")} description={t("empty.trainingRequests.filtered.description")} />
        ) : (
          // First run. A player with a coach asks for a session right here;
          // without one, the next step is connecting a coach. A coach with no
          // players cannot receive a request yet, so the step is adding one.
          <EmptyState
            icon={<Dumbbell className="h-6 w-6 text-muted-foreground" />}
            title={t("empty.trainingRequests.title")}
            description={isCoach ? t("empty.trainingRequests.coach.description") : t("empty.trainingRequests.player.description")}
            action={
              isPlayer ? (
                connectedCoach ? (
                  <Button onClick={() => setFormOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> {t("empty.trainingRequests.player.actionRequest")}</Button>
                ) : (
                  <Button asChild className="gap-1.5"><Link to="/connections">{t("empty.trainingRequests.player.actionConnect")}</Link></Button>
                )
              ) : isCoach && connectedPlayers.length === 0 ? (
                <Button asChild className="gap-1.5"><Link to="/connections">{t("empty.trainingRequests.coach.actionConnect")}</Link></Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const typeLabel = TRAINING_TYPES.find((t) => t.value === req.trainingType)?.label ?? req.trainingType;
            return (
              <button
                key={req.id}
                onClick={() => { setDetailRequest(req); setDetailOpen(true); }}
                className="flex w-full items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/20 hover:bg-accent/20"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {req.playerName.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{isCoach ? req.playerName : typeLabel}</h3>
                    <RequestStatusBadge status={req.status} />
                    {req.priority === "high" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary dark:text-primary">High Priority</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {req.preferredDate}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {req.preferredStartTime} – {req.preferredEndTime}</span>
                    {req.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {req.location}</span>}
                    {isPlayer && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {req.coachName}</span>}
                  </div>
                  {req.notes && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{req.notes}</p>}
                </div>
                {isPlayer && req.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    title="Cancel request"
                    aria-label={`Cancel your ${typeLabel} request for ${req.preferredDate}`}
                    disabled={cancelMut.isPending}
                    onClick={(e) => { e.stopPropagation(); setCancelTarget(req); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </button>
            );
          })}
        </div>
      )}

      {connectedCoach && <PlayerRequestForm open={formOpen} onOpenChange={setFormOpen} coachId={connectedCoach.id} coachName={connectedCoach.name} />}
      <CoachRequestDrawer request={detailRequest} open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetailRequest(null); }} />
      {cancelTarget && (
        <CancelRequestDialog
          open={!!cancelTarget}
          onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
          request={cancelTarget}
          loading={cancelMut.isPending}
          onConfirm={() => { cancelMut.mutate(cancelTarget.id); setCancelTarget(null); }}
        />
      )}
    </div>
  );
}
