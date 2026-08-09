// What it will actually be like to play here: surface, ball, altitude, the
// expected weather, and what that does to the ball — then, optionally, a
// model's read on what the player should do about it.
//
// The facts come first and stand alone. They need no API key, so this panel is
// useful on a server with the AI switched off.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Thermometer, Droplets, Mountain, Wind, Sun, Warehouse, Sparkles, Loader2,
  AlertTriangle, Info, Check, Pencil,
} from "lucide-react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/AuthContext";
import { conditionsApi, type WeatherKind } from "@/api/endpoints/conditions";
import { aiAdviceApi } from "@/api/endpoints/aiAdvice";
import { toast } from "sonner";

/** Plain-English provenance. A historical average must never read as a forecast. */
const WEATHER_LABEL: Record<WeatherKind, string> = {
  forecast: "Forecast",
  observed: "Recorded",
  typical: "Typical for this date",
};

const SPEED_COPY = {
  faster: "The ball will move through the air faster than usual",
  slower: "The ball will move through the air slower than usual",
  neutral: "Ball speed through the air will feel normal",
} as const;

const BOUNCE_COPY = {
  higher: "and bounce higher",
  lower: "and bounce lower",
  neutral: "with a normal bounce",
} as const;

export function TournamentConditionsDialog({
  tournamentId,
  open,
  onOpenChange,
  playerId,
}: {
  tournamentId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Whose recent training the analysis should consider. Defaults to the caller. */
  playerId?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEditBall = user?.role === "coach" || user?.role === "admin";

  const [editingBall, setEditingBall] = useState(false);
  const [ballDraft, setBallDraft] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tournament-conditions", tournamentId],
    queryFn: () => conditionsApi.get(tournamentId!),
    enabled: open && Boolean(tournamentId),
  });

  const { data: aiStatus } = useQuery({
    queryKey: ["ai", "status"],
    queryFn: aiAdviceApi.status,
    staleTime: 5 * 60_000,
  });

  const saveBall = useMutation({
    mutationFn: (ballBrand: string) => conditionsApi.setBall(tournamentId!, ballBrand),
    onSuccess: () => {
      setEditingBall(false);
      queryClient.invalidateQueries({ queryKey: ["tournament-conditions", tournamentId] });
      toast.success("Ball saved");
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? "Could not save the ball."),
  });

  const analyse = useMutation({
    mutationFn: () => conditionsApi.matchPrep({ tournamentId: tournamentId!, playerId }),
  });

  const t = data?.tournament;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t?.name ?? "Playing conditions"}</DialogTitle>
          <DialogDescription>
            {t ? `${t.city}, ${t.country} · ${format(new Date(t.startDate), "d MMM yyyy")}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {isError && (
          <p className="flex items-start gap-1.5 border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {(error as { message?: string })?.message ?? "Could not load the conditions."}
          </p>
        )}

        {data && t && (
          <div className="space-y-4">
            {/* ── Facts ─────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">{t.surface}</Badge>
              <Badge variant="outline" className="capitalize">
                {t.indoorOutdoor === "indoor" ? (
                  <><Warehouse className="mr-1 h-3 w-3" />Indoor</>
                ) : (
                  <><Sun className="mr-1 h-3 w-3" />Outdoor</>
                )}
              </Badge>
              {data.altitudeM !== null && (
                <Badge variant="outline">
                  <Mountain className="mr-1 h-3 w-3" />
                  {data.altitudeM} m
                  {data.altitudeSource === "derived" && (
                    <span className="ml-1 text-muted-foreground">(from map)</span>
                  )}
                </Badge>
              )}
            </div>

            {/* Balls — nobody publishes these, so a coach fills them in. */}
            <div className="flex items-center justify-between gap-2 border border-border p-2.5">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Official ball</p>
                {editingBall ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <Input
                      value={ballDraft}
                      onChange={(e) => setBallDraft(e.target.value)}
                      placeholder="e.g. Dunlop ATP"
                      className="h-8"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={saveBall.isPending}
                      onClick={() => saveBall.mutate(ballDraft)}
                    >
                      {saveBall.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ) : (
                  <p className="truncate text-sm text-foreground">
                    {t.ballBrand ?? <span className="text-muted-foreground">Not recorded</span>}
                  </p>
                )}
              </div>
              {canEditBall && !editingBall && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    setBallDraft(t.ballBrand ?? "");
                    setEditingBall(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t.ballBrand ? "Change" : "Add"}
                </Button>
              )}
            </div>

            {/* ── Weather ───────────────────────────────────────── */}
            {data.weather ? (
              <div className="space-y-2 border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Conditions</p>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {WEATHER_LABEL[data.weather.kind]}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                    {data.weather.temperatureC}°C
                    <span className="text-muted-foreground">
                      ({data.weather.temperatureMinC}–{data.weather.temperatureMaxC}°C)
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
                    {data.weather.humidityPct}% humidity
                  </span>
                </div>
                {/* Provenance in full, because "typical" and "forecast" mean very
                    different things to someone planning a trip. */}
                <p className="text-[11px] text-muted-foreground">{data.weather.source}</p>
                {data.weather.kind === "typical" && (
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    Too far out to forecast — this is what this date has actually been like in
                    recent years, not a prediction.
                  </p>
                )}
              </div>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {data.weatherError ?? "No weather available."}
              </p>
            )}

            {/* ── Physics ───────────────────────────────────────── */}
            {data.physics && (
              <div className="space-y-2 border border-border bg-muted/20 p-2.5">
                <div className="flex items-center gap-1.5">
                  <Wind className="h-3.5 w-3.5 text-primary" />
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    How the ball will play
                  </p>
                </div>
                <p className="text-sm text-foreground">
                  {SPEED_COPY[data.physics.speed]} {BOUNCE_COPY[data.physics.bounce]}.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Air density {data.physics.airDensity} kg/m³ (
                  {data.physics.densityVsReferencePct > 0 ? "+" : ""}
                  {data.physics.densityVsReferencePct}% vs a mild sea-level day) · calculated, not
                  estimated by AI
                  {data.physicsBasis === "indoor" && " · indoor hall assumed at 22°C"}
                </p>
                {data.physics.drivers.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {data.physics.drivers.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Optional AI reading ───────────────────────────── */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">What this means for you</span>
              </div>

              {aiStatus && !aiStatus.configured ? (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  AI analysis is not enabled on this server. The conditions above are unaffected.
                </p>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={!data.physics || analyse.isPending}
                    onClick={() => analyse.mutate()}
                  >
                    {analyse.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" /> Analyse for this player</>
                    )}
                  </Button>
                  {!data.physics && (
                    <p className="text-xs text-muted-foreground">
                      Needs weather data before there is anything to analyse.
                    </p>
                  )}

                  {analyse.isError && (
                    <p className="flex items-start gap-1.5 border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {(analyse.error as { message?: string })?.message ?? "Could not analyse."}
                    </p>
                  )}

                  {analyse.data && (
                    <div className="space-y-3">
                      <p className="text-sm text-foreground">{analyse.data.prep.conditionsSummary}</p>
                      <p className="text-sm text-foreground">{analyse.data.prep.ballBehaviour}</p>

                      <Section title="Tactical" items={analyse.data.prep.tacticalAdjustments} />
                      <Section title="Preparation" items={analyse.data.prep.preparation} />
                      <Section title="Equipment" items={analyse.data.prep.equipmentNotes} />

                      {analyse.data.prep.cautions.length > 0 && (
                        <ul className="space-y-1">
                          {analyse.data.prep.cautions.map((c) => (
                            <li key={c} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="text-[11px] text-muted-foreground">
                        Generated by {analyse.data.provider} · {analyse.data.model}, from{" "}
                        {analyse.data.basedOn.sessions} recent session
                        {analyse.data.basedOn.sessions === 1 ? "" : "s"}. A suggestion — your
                        judgement decides.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
