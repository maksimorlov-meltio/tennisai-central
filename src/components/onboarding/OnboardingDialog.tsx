import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { questionsForRole, ROLE_ONBOARDING_TITLE } from "@/lib/onboarding/questions";
import { onboardingApi, type OnboardingAnswers } from "@/api/endpoints/onboarding";
import type { User } from "@/types";

/**
 * Shown once after a new account is created. Steps the user through a short,
 * role-based questionnaire; every choice question also accepts a written-in
 * answer. Any dismissal (Skip / Finish / Esc) saves what's answered and marks
 * onboarding complete, so it won't nag on the next visit.
 */
export function OnboardingDialog({ user }: { user: User }) {
  const { refreshUser } = useAuth();
  const questions = useMemo(() => questionsForRole(user.role), [user.role]);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [customText, setCustomText] = useState("");
  const [saving, setSaving] = useState(false);

  if (questions.length === 0) return null;

  const q = questions[step];
  const isLast = step === questions.length - 1;
  const answer = answers[q.id];
  const hasAnswer = Array.isArray(answer) ? answer.length > 0 : Boolean(answer && String(answer).trim());
  const canAdvance = q.optional || hasAnswer;

  const setSingle = (val: string) => setAnswers((a) => ({ ...a, [q.id]: val }));
  const setText = (val: string) => setAnswers((a) => ({ ...a, [q.id]: val }));
  const toggleMulti = (val: string) =>
    setAnswers((a) => {
      const cur = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
      return { ...a, [q.id]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] };
    });
  const addCustomMulti = () => {
    const v = customText.trim();
    if (!v) return;
    setAnswers((a) => {
      const cur = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
      return cur.includes(v) ? a : { ...a, [q.id]: [...cur, v] };
    });
    setCustomText("");
  };

  const goNext = () => { setCustomText(""); setStep((s) => Math.min(s + 1, questions.length - 1)); };
  const goBack = () => { setCustomText(""); setStep((s) => Math.max(s - 1, 0)); };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onboardingApi.save(answers);
      await refreshUser();
      toast.success("Profile saved — welcome to TennisAI!");
      setOpen(false);
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Could not save your answers");
    } finally {
      setSaving(false);
    }
  };

  const customMultiValues =
    Array.isArray(answer) && q.options ? answer.filter((v) => !q.options!.includes(v)) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) submit(); }}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> {ROLE_ONBOARDING_TITLE[user.role]}
          </DialogTitle>
          <DialogDescription>
            Answer a few quick questions — pick an option or write your own. You can change these later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Question {step + 1} of {questions.length}</p>

        <div className="space-y-3">
          <Label className="text-base text-foreground">{q.prompt}</Label>

          {q.type === "text" ? (
            <Textarea
              placeholder={q.placeholder}
              value={(answer as string) ?? ""}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />
          ) : q.type === "single" ? (
            <div className="flex flex-wrap gap-2">
              {q.options!.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSingle(opt)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    answer === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
              {q.allowCustom && (
                <Input
                  className="mt-1 w-full"
                  placeholder="…or write your own answer"
                  value={q.options!.includes(answer as string) ? "" : ((answer as string) ?? "")}
                  onChange={(e) => setSingle(e.target.value)}
                />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {q.options!.map((opt) => {
                  const sel = Array.isArray(answer) && answer.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleMulti(opt)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        sel
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {customMultiValues.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customMultiValues.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleMulti(v)}
                      className="rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary"
                    >
                      {v} ✕
                    </button>
                  ))}
                </div>
              )}
              {q.allowCustom && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Add your own…"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomMulti();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addCustomMulti}>Add</Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" disabled={saving} onClick={submit}>Skip for now</Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={goBack} disabled={saving}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={submit} disabled={saving || !canAdvance}>
                <Check className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving…" : "Finish"}
              </Button>
            ) : (
              <Button size="sm" onClick={goNext} disabled={!canAdvance}>
                Next <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
