import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "@/api/endpoints/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

/**
 * Request a password-reset link.
 *
 * The confirmation screen is deliberately non-committal: the API returns the same
 * response whether or not the address belongs to an account, and this page must
 * not leak the difference either.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // The server's own wording. Usually the deliberately vague "if that email is
  // registered…", but a server with no mail transport says so plainly instead —
  // and answering "check your email" to that sends someone to watch an inbox
  // nothing can ever arrive in.
  const [serverMessage, setServerMessage] = useState("");
  // Whether this server can send mail at all. A property of the server, the
  // same for every address, so showing it reveals nothing about any account.
  const [mailUnavailable, setMailUnavailable] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const address = email.trim();
    if (!address) return setError("Enter the email address you signed up with");
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(address);
      setServerMessage(res?.message ?? "");
      setMailUnavailable(res?.data?.emailConfigured === false);
      setSentTo(address);
      setSent(true);
    } catch (err: any) {
      // Only transport / rate-limit failures land here — a successful request is
      // always a generic 200, so nothing here reveals whether the account exists.
      setError(err?.message || "We couldn't send the reset link. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };


  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">
            {mailUnavailable ? "Reset isn't available yet" : "Check your email"}
          </h2>
          {mailUnavailable ? (
            <p className="text-sm text-muted-foreground">{serverMessage}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              If <span className="font-medium text-foreground">{sentTo}</span> is registered, a reset link is on its
              way. The link works once and expires in an hour.
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button asChild>
            <Link to="/login">Back to login</Link>
          </Button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError("");
            }}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Used a different email? Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to login
      </Link>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold text-foreground">Forgot your password?</h2>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a link to set a new one.
          </p>
        </div>
        {error && <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
