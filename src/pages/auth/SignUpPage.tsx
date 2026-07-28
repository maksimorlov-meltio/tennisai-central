// TODO: Implement full sign up form with role-specific fields
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { UserRole } from "@/types";

const roles: { value: UserRole; label: string; description: string }[] = [
  { value: "player", label: "Player", description: "Track your game, stats, and tournaments" },
  { value: "coach", label: "Coach", description: "Manage players, teams, and training" },
  { value: "observer", label: "Observer", description: "Follow a player's progress (read-only)" },
];

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole | null>(null);
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "", firstName: "", lastName: "" });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!role) return setError("Please select a role");
    if (form.password.length < 8) return setError("Password must be at least 8 characters");
    if (form.password !== form.confirmPassword) return setError("Passwords do not match");
    if (!ageConfirmed) return setError("You must confirm you are 13 or older");
    if (!termsAccepted) return setError("You must accept the terms");
    setLoading(true);
    try {
      const msg = await signUp({ ...form, role, ageConfirmed, termsAccepted });
      setSuccessMsg(msg || "Account created! Check your email to verify.");
    } catch (err: any) {
      setError(err?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  if (successMsg) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold text-foreground">Check your email</h2>
        <p className="text-sm text-muted-foreground">{successMsg}</p>
        <div className="flex flex-col items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/login")}>Go to login</Button>
          <button
            type="button"
            onClick={() => navigate("/verify-email")}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Didn't get the email? Resend it
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">Create your account</h2>
        <p className="text-sm text-muted-foreground">Choose your role to get started</p>
      </div>
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {/* Role selector */}
      <div className="grid grid-cols-3 gap-2">
        {roles.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRole(r.value)}
            className={`rounded-lg border p-3 text-center text-sm transition-colors ${
              role === r.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <div className="font-medium">{r.label}</div>
            <div className="mt-1 text-xs leading-tight">{r.description}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} required />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="age" checked={ageConfirmed} onCheckedChange={(v) => setAgeConfirmed(!!v)} />
        <Label htmlFor="age" className="text-sm text-muted-foreground">I confirm I am 13 years of age or older</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="terms" checked={termsAccepted} onCheckedChange={(v) => setTermsAccepted(!!v)} />
        <Label htmlFor="terms" className="text-sm text-muted-foreground">I accept the Terms of Service and Privacy Policy</Label>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating account…" : "Create account"}</Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
