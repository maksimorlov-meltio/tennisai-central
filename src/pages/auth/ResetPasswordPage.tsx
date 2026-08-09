import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "@/api/endpoints/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Set a new password from an emailed reset link (`/reset-password?token=…`).
 *
 * Three terminal states: no/invalid token, success, and a recoverable form error.
 * The token is only ever passed straight to the API — never displayed or stored.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  /** True once the server rejected the attempt — offer a fresh link, not just a retry. */
  const [serverRejected, setServerRejected] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setServerRejected(false);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    try {
      const res = await authApi.resetPassword(token, password);
      setMessage(res.message || "Your password has been updated.");
      setSuccess(true);
    } catch (err: any) {
      setServerRejected(true);
      setError(err?.message || "We couldn't reset your password. Please request a new link.");
    } finally {
      setLoading(false);
    }
  };

  // Arrived without a token — the link was mangled or copied incompletely.
  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Reset link problem</h2>
          <p className="text-sm text-muted-foreground">
            This page needs a valid reset link. Request a new one and open it straight from your email.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button asChild>
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
          <Link
            to="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Password updated</h2>
          <p className="text-sm text-muted-foreground">{message} Sign in with your new password.</p>
        </div>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">Set a new password</h2>
        <p className="text-sm text-muted-foreground">Choose a password you haven't used before.</p>
      </div>
      {error && (
        <div className="space-y-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <p>{error}</p>
          {serverRejected && (
            <Link to="/forgot-password" className="inline-block font-medium underline underline-offset-4">
              Request a new reset link
            </Link>
          )}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          placeholder="••••••••"
        />
        <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !password || !confirm}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating password…
          </>
        ) : (
          "Update password"
        )}
      </Button>
      <p className="text-center text-sm">
        <Link to="/login" className="text-muted-foreground hover:text-foreground">
          Back to login
        </Link>
      </p>
    </form>
  );
}
