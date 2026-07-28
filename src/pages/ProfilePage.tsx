// Profile — Edit profile with save via service layer
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthContext";
import { useUpdateProfile } from "@/hooks/api/queries";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { RoleBadge } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Copy, Check, ClipboardList, Pencil } from "lucide-react";
import { toast } from "sonner";
import { onboardingApi } from "@/api/endpoints/onboarding";
import { questionsForRole } from "@/lib/onboarding/questions";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";

export default function ProfilePage() {
  const { user } = useAuth();
  const updateMut = useUpdateProfile();
  // Real shareable ID from the API (was a hardcoded map that showed "TAI-X-000"
  // for every non-seeded account, which broke new users' ability to connect).
  const publicId = user?.publicId ?? "—";
  const [copied, setCopied] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const { data: onboarding, refetch: refetchOnboarding } = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => (await onboardingApi.get()).data,
    enabled: !!user,
  });
  const [editOpen, setEditOpen] = useState(false);
  const answers = useMemo(() => onboarding?.answers ?? {}, [onboarding]);
  const roleQuestions = user ? questionsForRole(user.role) : [];
  const answeredQuestions = roleQuestions.filter((q) => {
    const a = answers[q.id];
    return Array.isArray(a) ? a.length > 0 : Boolean(a && String(a).trim());
  });
  const fmtAnswer = (a: string | string[] | undefined) => (Array.isArray(a) ? a.join(", ") : (a ?? ""));

  const copyId = () => {
    navigator.clipboard.writeText(publicId);
    setCopied(true);
    toast.success("Public ID copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    updateMut.mutate({ firstName, lastName, email });
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">My Profile</h1><p className="text-sm text-muted-foreground">Manage your personal information.</p></div>
      <DashboardCard title="Profile Information" icon={<User className="h-4 w-4" />}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
            <div>
              <p className="text-lg font-semibold text-foreground">{user?.firstName} {user?.lastName}</p>
              <div className="flex items-center gap-2 mt-1"><RoleBadge role={user?.role ?? "player"} /><span className="text-sm text-muted-foreground">{user?.email}</span></div>
            </div>
          </div>
          {user?.role !== "admin" && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <Label className="text-xs text-muted-foreground">Your Public ID</Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 font-mono text-lg font-bold tracking-wider text-foreground">{publicId}</code>
                <Button variant="outline" size="icon" onClick={copyId}>{copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}</Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Share this ID so others can connect with you.</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
          </div>
          <Button onClick={handleSave} disabled={updateMut.isPending}>{updateMut.isPending ? "Saving…" : "Save Changes"}</Button>
        </div>
      </DashboardCard>

      <DashboardCard
        title="Profile questionnaire"
        description="Your onboarding answers"
        icon={<ClipboardList className="h-4 w-4" />}
        action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit answers
          </Button>
        }
      >
        {answeredQuestions.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">You haven't completed your profile questionnaire yet.</p>
            <Button size="sm" className="mt-3" onClick={() => setEditOpen(true)}>Complete setup</Button>
          </div>
        ) : (
          <dl className="space-y-3">
            {answeredQuestions.map((q) => (
              <div key={q.id} className="border-b border-border pb-2 last:border-0">
                <dt className="text-xs text-muted-foreground">{q.prompt}</dt>
                <dd className="text-sm font-medium text-foreground">{fmtAnswer(answers[q.id])}</dd>
              </div>
            ))}
          </dl>
        )}
      </DashboardCard>

      {user && (
        <OnboardingDialog
          user={user}
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o) refetchOnboarding();
          }}
          initialAnswers={answers}
        />
      )}
    </div>
  );
}
