// AI Insights — match preparation analysis (player) & training insights (coach)
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthContext";
import { useEquipment, usePlayerTournaments } from "@/hooks/api/queries";
import { aiInsightsApi } from "@/api/endpoints/aiInsights";
import type { AIInsightInput, AIInsightResult } from "@/types";
import { LoadingState, ErrorState } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, AlertTriangle, ClipboardList, Wrench, RefreshCw,
  CloudSun, Mountain, Trophy, Loader2, Lightbulb, BarChart3,
} from "lucide-react";
import { toast } from "sonner";

// ─── Options ───

const SURFACES = ["Hard", "Clay", "Grass", "Indoor Hard", "Carpet"];
const WEATHER = ["Mild", "Hot", "Cold", "Windy", "Humid", "Rain expected"];
const STYLES = ["All-court", "Aggressive baseliner", "Counterpuncher / defensive", "Serve and volley"];
const LOADS = ["Light", "Moderate", "Heavy"];

// ─────────────────────────────────────────────────────────────
// Player view — Match Prep
// ─────────────────────────────────────────────────────────────

function PlayerMatchPrep({ playerId }: { playerId: string }) {
  const { data: equipment = [], isLoading, error } = useEquipment(playerId);
  const { data: playerTournaments = [] } = usePlayerTournaments();

  const [form, setForm] = useState<AIInsightInput>({
    surface: "Hard",
    weather: "Mild",
    playerStyle: "All-court",
    recentTrainingLoad: "Moderate",
  });
  const [result, setResult] = useState<AIInsightResult | null>(null);

  const rackets = useMemo(() => equipment.filter((e) => e.category === "racket"), [equipment]);
  const strings = useMemo(() => equipment.filter((e) => e.category === "string"), [equipment]);
  const myTournaments = useMemo(
    () => playerTournaments.filter((pt) => pt.playerId === playerId),
    [playerTournaments, playerId]
  );

  const generate = useMutation({
    mutationFn: async () => (await aiInsightsApi.generateMatchPrep(playerId, form)).data,
    onSuccess: (data) => {
      setResult(data);
      toast.success("Match prep ready");
    },
    onError: () => toast.error("Failed to generate insights"),
  });

  if (isLoading) return <LoadingState message="Loading your equipment…" />;
  if (error) return <ErrorState message="Failed to load equipment" onRetry={() => window.location.reload()} />;

  const set = (patch: Partial<AIInsightInput>) => setForm((f) => ({ ...f, ...patch }));

  const onTournamentChange = (id: string) => {
    if (id === "none") { set({ tournamentId: undefined }); return; }
    const pt = myTournaments.find((t) => t.tournamentId === id);
    set({
      tournamentId: id,
      surface: pt?.tournament.surface ?? form.surface,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Input form */}
      <Card className="lg:col-span-2 h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CloudSun className="h-4 w-4 text-primary" /> Match Conditions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {myTournaments.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tournament (optional)</Label>
              <Select value={form.tournamentId ?? "none"} onValueChange={onTournamentChange}>
                <SelectTrigger><SelectValue placeholder="Select tournament" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tournament</SelectItem>
                  {myTournaments.map((pt) => (
                    <SelectItem key={pt.id} value={pt.tournamentId}>
                      <span className="flex items-center gap-1.5"><Trophy className="h-3 w-3" /> {pt.tournament.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Surface</Label>
              <Select value={form.surface} onValueChange={(v) => set({ surface: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SURFACES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Weather</Label>
              <Select value={form.weather} onValueChange={(v) => set({ weather: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WEATHER.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Mountain className="h-3.5 w-3.5" /> Altitude (m)</Label>
            <Input
              type="number"
              min={0}
              value={form.altitude ?? ""}
              placeholder="e.g. 600"
              onChange={(e) => set({ altitude: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Racket</Label>
            <Select value={form.racket ?? "auto"} onValueChange={(v) => set({ racket: v === "auto" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="From your bag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Use my equipment list</SelectItem>
                {rackets.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}{r.condition ? ` (${r.condition})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Strings</Label>
            <Select value={form.stringType ?? "auto"} onValueChange={(v) => set({ stringType: v === "auto" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="From your bag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Use my equipment list</SelectItem>
                {strings.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}{s.condition ? ` (${s.condition})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Play style</Label>
              <Select value={form.playerStyle} onValueChange={(v) => set({ playerStyle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recent load</Label>
              <Select value={form.recentTrainingLoad} onValueChange={(v) => set({ recentTrainingLoad: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LOADS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ball brand (optional)</Label>
            <Input
              value={form.ballBrand ?? ""}
              placeholder="e.g. Wilson US Open"
              onChange={(e) => set({ ballBrand: e.target.value || undefined })}
            />
          </div>

          <Button className="w-full gap-2" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generate.isPending ? "Analyzing…" : "Generate Match Prep"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="lg:col-span-3 space-y-4">
        {generate.isPending && (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        )}

        {!generate.isPending && !result && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Your match prep will appear here</p>
              <p className="text-sm text-muted-foreground">Set the conditions and generate an analysis based on the gear you own.</p>
            </div>
          </div>
        )}

        {!generate.isPending && result && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" /> Conditions Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{result.matchConditionsSummary}</p>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/[0.04]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-primary">
                  <AlertTriangle className="h-4 w-4" /> Expected Risks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.expectedRisks.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-primary" /> {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardList className="h-4 w-4 text-primary" /> Preparation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.preparationRecommendations.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> {p}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="h-4 w-4 text-primary" /> Equipment Setup
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.equipmentRecommendations.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> {g}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-muted-foreground">
              Generated {new Date(result.generatedAt).toLocaleString()} · Based on your equipment list and the conditions above
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Coach view — Training Insights
// ─────────────────────────────────────────────────────────────

function CoachTrainingInsightsView({ coachId }: { coachId: string }) {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["coachInsights", coachId],
    queryFn: async () => (await aiInsightsApi.getCoachInsights(coachId)).data,
  });

  if (isLoading) return <LoadingState message="Analyzing your training sessions…" />;
  if (error || !data) return <ErrorState message="Failed to generate insights" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data.periodLabel} · generated {new Date(data.generatedAt).toLocaleString()}</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" /> Observations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.observations.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> {o}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border bg-muted/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <Lightbulb className="h-4 w-4" /> Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-foreground" /> {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function AIInsightsPage() {
  const { user } = useAuth();
  const isCoach = user?.role === "coach";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            AI Insights <Badge variant="outline" className="text-[10px]">Beta</Badge>
          </h1>
          <p className="text-muted-foreground">
            {isCoach
              ? "Session insights generated from your group's training sessions and player feedback."
              : "Best-practice match preparation based on the conditions and the gear you own."}
          </p>
        </div>
      </div>

      {!user ? (
        <LoadingState message="Loading…" />
      ) : isCoach ? (
        <CoachTrainingInsightsView coachId={user.id} />
      ) : (
        <PlayerMatchPrep playerId={user.id} />
      )}
    </div>
  );
}
