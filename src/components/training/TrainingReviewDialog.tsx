import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Star } from "lucide-react";
import { DiscardChangesDialog } from "@/components/training/DiscardChangesDialog";
import type { TrainingSession, TrainingReview } from "@/types";

interface TrainingReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  training: TrainingSession;
  /** Rejects when the save fails — the dialog then stays open with the text intact. */
  onSave: (review: TrainingReview) => void | Promise<void>;
  saving?: boolean;
}

export function TrainingReviewDialog({ open, onOpenChange, training, onSave, saving }: TrainingReviewDialogProps) {
  const existing = training.review;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [workedOn, setWorkedOn] = useState(existing?.workedOn ?? "");
  const [nextSteps, setNextSteps] = useState(existing?.nextSteps ?? "");
  const [playerFeedback, setPlayerFeedback] = useState(existing?.playerFeedback ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const valid = rating > 0 && workedOn.trim();

  // Anything typed that isn't already saved on the session counts as dirty —
  // an accidental tap outside must never bin it.
  const dirty =
    rating !== (existing?.rating ?? 0) ||
    workedOn !== (existing?.workedOn ?? "") ||
    nextSteps !== (existing?.nextSteps ?? "") ||
    playerFeedback !== (existing?.playerFeedback ?? "");

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaveError(null);
    try {
      await onSave({
        rating,
        workedOn: workedOn.trim(),
        nextSteps: nextSteps.trim(),
        playerFeedback: playerFeedback.trim() || undefined,
        reviewedAt: new Date().toISOString(),
      });
      onOpenChange(false);
    } catch (e) {
      setSaveError((e as { message?: string })?.message ?? "Could not save the review. Your text is still here — try again.");
    }
  };

  /** Any close attempt goes through here so a dirty form asks first. */
  const requestClose = () => {
    if (saving) return;
    if (dirty) { setConfirmDiscard(true); return; }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); else onOpenChange(true); }}>
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={(e) => { if (dirty || saving) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{existing ? "Edit Review" : "Review Training Session"}</DialogTitle>
            <DialogDescription>
              Rate "{training.title}" and note what was covered and what to focus on next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Rating *</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Rate ${star} out of 5`}
                    aria-pressed={star === rating}
                    className="p-0.5 transition-transform hover:scale-110"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= (hoverRating || rating)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  </button>
                ))}
                {rating > 0 && <span className="ml-2 self-center text-sm text-muted-foreground">{rating}/5</span>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>What was worked on *</Label>
              <Textarea
                value={workedOn}
                onChange={(e) => setWorkedOn(e.target.value)}
                placeholder="e.g. Lateral footwork drills, split-step timing, recovery steps"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>What to do next</Label>
              <Textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                placeholder="e.g. Increase drill speed, add weighted vest, focus on backhand"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Player feedback <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                value={playerFeedback}
                onChange={(e) => setPlayerFeedback(e.target.value)}
                placeholder="Any feedback from the player about the session"
                rows={2}
              />
            </div>
            {saveError && (
              <p className="flex items-start gap-1.5 border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {saveError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!valid || saving}>
              {saving ? "Saving…" : existing ? "Update Review" : "Save Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        what="review"
        onConfirm={() => onOpenChange(false)}
      />
    </>
  );
}
