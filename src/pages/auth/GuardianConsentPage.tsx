// ============================================================================
// The page a parent or guardian lands on from the approval email.
//
// WHY IT ASKS FOR A CLICK INSTEAD OF APPROVING ON LOAD
// The email-verification page consumes its token the moment it mounts, which is
// fine for confirming an address. Consent is not that: it is a deliberate act
// by a named person, and corporate mail scanners and link prefetchers open
// links without a human ever seeing them. So the token is only spent when the
// guardian presses the button, after reading what they are agreeing to.
// ============================================================================

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";
import type { ApiResponse } from "@/types";

interface ConsentResult {
  childFirstName: string;
  accountRole: string;
}

type Status = "ready" | "submitting" | "approved" | "error" | "no-token";

export default function GuardianConsentPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>(token ? "ready" : "no-token");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ConsentResult | null>(null);

  const approve = async () => {
    if (!token) return;
    setStatus("submitting");
    setMessage("");
    try {
      const res = await apiClient.post<ApiResponse<ConsentResult>>("/auth/guardian-consent", { token });
      setResult(res.data ?? null);
      setMessage(res.message || "Thank you — the account is approved.");
      setStatus("approved");
    } catch (err: any) {
      setMessage(err?.message || "This approval link is invalid or has expired.");
      setStatus("error");
    }
  };

  if (status === "approved") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Approved</h2>
          <p className="text-sm text-muted-foreground">
            {result?.childFirstName
              ? `${result.childFirstName} can now sign in to TennisAI${
                  result.accountRole ? ` as a ${result.accountRole}` : ""
                }.`
              : "The account can now be used."}
          </p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <p className="max-w-sm text-xs text-muted-foreground">
          You can withdraw this at any time by contacting the coach or academy that runs this TennisAI
          account, and asking them to close it.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Go to TennisAI</Link>
        </Button>
      </div>
    );
  }

  if (status === "error" || status === "no-token") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">This link didn't work</h2>
          <p className="text-sm text-muted-foreground">
            {status === "no-token"
              ? "This page needs the approval link from the email we sent you."
              : message}
          </p>
        </div>
        {/* Deliberately does NOT say "sign up again": the email is already
            registered, so a second attempt is refused. There is no self-service
            way to re-issue a consent link yet — see the note in
            server/src/auth/guardianConsent.ts. */}
        <p className="max-w-sm text-xs text-muted-foreground">
          Approval links stop working after 30 days, and each one can only be used once. If you have
          already approved this account, nothing more is needed. Otherwise ask your child's coach, or
          whoever set up TennisAI for them, to send a new approval link.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Go to TennisAI</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ShieldQuestion className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Approve your child's account</h2>
          <p className="text-sm text-muted-foreground">
            Your child gave your address as their parent or guardian when they signed up for TennisAI.
            Their account is locked until you approve it.
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">What you're agreeing to</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            A TennisAI account they use to plan training, log matches, and follow tournament
            calendars.
          </li>
          <li>
            We store the details they entered — name, email, date of birth — and whatever they add
            themselves: training sessions, matches, and tournaments they're entering.
          </li>
          <li>
            They can connect with a coach, who will then see the training and match data they share.
          </li>
          <li>
            You can withdraw this later by asking their coach or academy to close the account, and you
            can ask us for a copy of their data or its deletion at any time.
          </li>
        </ul>
        <p>
          The{" "}
          <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          has the full detail.
        </p>
      </div>

      <Button className="w-full" onClick={approve} disabled={status === "submitting"}>
        {status === "submitting" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "I'm their parent or guardian — approve this account"
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Weren't expecting this? Close this page. Without your approval the account stays locked and
        cannot be used.
      </p>
    </div>
  );
}
