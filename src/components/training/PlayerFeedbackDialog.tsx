import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Battery, Zap } from "lucide-react";
import type { TrainingSession, PlayerSessionFeedback, PlayerFeeling, PlayerFeedbackTag } from "@/types";
import { PLAYER_FEEDBACK_TAGS } from "@/types";

const FEELINGS: { value: PlayerFeeling; emoji: string; label: string }[] = [
  { value: "awful", emoji: "😫", label: "Awful" },
  { value: "bad", emoji: "😕", label: "Bad" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "good", emoji: "🙂", label: "Good" },
  { value: "great", emoji: "🤩", label: "Great" },
];

interface PlayerFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  training: TrainingSession;
  onSave: (feedback: PlayerSessionFeedback) => void;
  saving?: boolean;
}

export function PlayerFeedbackDialog({ open, onOpenChange, training, onSave, saving }: PlayerFeedbackDialogProps) {
  const existing = training.playerSessionFeedback;
  const [feeling, setFeeling] = useState<PlayerFeeling | null>(existing?.feeling ?? null);
  const [energy, setEnergy] = useState(existing?.energyLevel ?? 3);
  const [tags, setTags] = useState<PlayerFeedbackTag[]>(existing?.tags ?? []);
  const [note, setNote] = useState(existing?.note ?? "");

  const toggleTag = (tag: PlayerFeedbackTag) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const valid = feeling !== null;

  const handleSave = () => {
    if (!feeling) return;
    onSave({
      feeling,
      energyLevel: energy,
      tags,
      note: note.trim() || undefined,
      submittedAt: new Date().toISOString(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Feedback" : "How was the session?"}</DialogTitle>
          <DialogDescription>
            Quick feedback for "{training.title}" — helps your coach improve future sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Feeling picker */}
          <div className="space-y-2">
            <Label>How did it feel? *</Label>
            <div className="flex justify-between gap-1">
              {FEELINGS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFeeling(f.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 transition-all hover:scale-105 ${
                    feeling === f.value
                      ? "bg-primary/15 ring-2 ring-primary scale-105"
                      : "bg-secondary/50 hover:bg-secondary"
                  }`}
                >
                  <span className="text-2xl">{f.emoji}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Energy level */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Energy Level
            </Label>
            <div className="flex items-center gap-3">
              <Battery className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[energy]}
                onValueChange={([v]) => setEnergy(v)}
                min={1}
                max={5}
                step={1}
                className="flex-1"
              />
              <span className="w-8 text-center text-sm font-bold text-foreground">{energy}/5</span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>Exhausted</span>
              <span>Full energy</span>
            </div>
          </div>

          {/* Quick tags */}
          <div className="space-y-2">
            <Label>Quick tags <span className="text-muted-foreground font-normal">(select all that apply)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {PLAYER_FEEDBACK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tags.includes(tag)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Optional note */}
          <div className="space-y-1.5">
            <Label htmlFor="feedback-note">Anything else? <span className="text-muted-foreground font-normal">(optional, max 200 chars)</span></Label>
            <Textarea id="feedback-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Quick note for your coach…"
              rows={2}
              maxLength={200}
            />
            <p className="text-right text-[10px] text-muted-foreground">{note.length}/200</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving ? "Saving…" : existing ? "Update Feedback" : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
