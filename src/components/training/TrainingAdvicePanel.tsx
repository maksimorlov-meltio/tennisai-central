// Advice for the session a coach is currently creating, derived from the
// sessions they already ran — the coach's own reviews and the players' own
// feedback. Lives inside the create/edit dialog because the useful moment is
// while the form is still empty, and applying a suggestion just fills it in.
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, Loader2, Wand2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { aiAdviceApi, type AdviceSession } from "@/api/endpoints/aiAdvice";

export function TrainingAdvicePanel({
  playerIds,
  teamId,
  onApply,
}: {
  playerIds: string[];
  teamId?: string;
  /** Fills the surrounding form with a suggestion. The coach can still edit it. */
  onApply: (session: AdviceSession) => void;
}) {
  // Cheap, cacheable, and never throws — an unconfigured server is a normal state.
  const { data: status } = useQuery({
    queryKey: ["ai", "status"],
    queryFn: aiAdviceApi.status,
    staleTime: 5 * 60_000,
  });

  const advise = useMutation({
    mutationFn: () => aiAdviceApi.trainingAdvice({ playerIds, teamId: teamId || undefined }),
  });

  const hasTarget = playerIds.length > 0 || Boolean(teamId);

  return (
    <div className="space-y-3 border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Advice from past sessions</span>
      </div>

      {status && !status.configured ? (
        // Said plainly rather than hidden: the feature exists, this server just
        // has no AI provider configured. Never silently substitute canned text.
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Not enabled on this server — an administrator needs to configure an AI provider.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Reads your completed sessions with the selected players, your reviews, and their
            feedback, then suggests what to train next.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!hasTarget || advise.isPending}
            onClick={() => advise.mutate()}
          >
            {advise.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading past sessions…
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5" /> Suggest from history
              </>
            )}
          </Button>

          {!hasTarget && (
            <p className="text-xs text-muted-foreground">Pick a player or a team first.</p>
          )}

          {advise.isError && (
            <p className="flex items-start gap-1.5 border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {(advise.error as { message?: string })?.message ?? "Could not generate advice."}
            </p>
          )}

          {advise.data && (
            <div className="space-y-3">
              {/* Provenance first: the coach should see what this was derived
                  from before reading what it concluded. */}
              <p className="text-xs text-muted-foreground">
                Based on {advise.data.basedOn.sessions} completed session
                {advise.data.basedOn.sessions === 1 ? "" : "s"} · {advise.data.basedOn.reviewed}{" "}
                reviewed · {advise.data.basedOn.withPlayerFeedback} with player feedback
              </p>

              {advise.data.basedOn.thin && (
                <p className="flex items-start gap-1.5 border border-border bg-background p-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  That is a small sample — treat this as a starting point, not a plan.
                </p>
              )}

              <p className="text-sm text-foreground">{advise.data.advice.summary}</p>

              {advise.data.advice.focusAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {advise.data.advice.focusAreas.map((f) => (
                    <Badge key={f} variant="secondary" className="text-xs font-normal">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}

              {advise.data.advice.suggestedSessions.map((s, i) => (
                <div key={i} className="space-y-2 border border-border bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.trainingType.replace("_", " ")} · {s.intensity} · {s.durationMinutes} min
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onApply(s)}>
                      Use this
                    </Button>
                  </div>
                  <p className="text-xs text-foreground">{s.goal}</p>
                  <p className="text-xs text-muted-foreground">{s.rationale}</p>
                  {s.drills.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {s.drills.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {advise.data.advice.cautions.length > 0 && (
                <ul className="space-y-1">
                  {advise.data.advice.cautions.map((c) => (
                    <li key={c} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}

              {/* Attribution, not decoration: a coach acting on this deserves to
                  know it came from a model, and which one. */}
              <p className="text-[11px] text-muted-foreground">
                Generated by {advise.data.provider} · {advise.data.model}. A suggestion — your
                judgement decides.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
