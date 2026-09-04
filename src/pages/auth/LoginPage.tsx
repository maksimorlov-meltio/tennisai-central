import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // The one login failure with a next step: the account exists and the password
  // was right, but the address was never confirmed.
  const [needsVerification, setNeedsVerification] = useState(false);
  // The other one: an under-age account whose parent or guardian has not
  // approved it yet. Nothing the person at the keyboard can do about it, so the
  // screen must not push them into the password-reset loop.
  const [awaitingGuardian, setAwaitingGuardian] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setAwaitingGuardian(false);
    setLoading(true);
    try {
      await login({ email, password });
      navigate("/dashboard");
    } catch (err: any) {
      const message = err?.message || "Login failed";
      setError(message);
      // Three distinguishable outcomes, by status:
      //   401 — the uniform "invalid email or password" (could be either).
      //   403 — correct credentials, unverified email.
      //   423 — correct credentials, waiting on a guardian's approval.
      // The last has its own status precisely so it is never shown as a
      // credential failure to a 14-year-old who typed everything correctly.
      setNeedsVerification(err?.status === 403);
      setAwaitingGuardian(err?.status === 423);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
      <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Sign in to your account</p>
      </div>
      {/* Waiting on a guardian is not an error the person made — it gets its own
          neutral panel rather than the red "you got it wrong" one. */}
      {awaitingGuardian ? (
        <div
          role="status"
          className="space-y-1 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
        >
          <p className="font-medium text-foreground">Almost there</p>
          <p>{error}</p>
          <p className="text-xs">
            Ask them to check their inbox — including junk mail — for an email from TennisAI.
          </p>
        </div>
      ) : (
        error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          {/* Being told to check an inbox is useless without a way to make the
              email arrive again — the first one expires, or never came. */}
          {needsVerification && (
            <>
              {" "}
              <Link to="/verify-email" className="font-medium underline underline-offset-4">
                Send it again
              </Link>
            </>
          )}
        </div>
        )
      )}
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between text-sm">
        <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">Forgot your password?</Link>
        <Link to="/signup" className="text-primary hover:underline">Create account</Link>
      </div>
    </form>
    </div>
  );
}
