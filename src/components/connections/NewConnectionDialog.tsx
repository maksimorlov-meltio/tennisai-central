import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { mockDirectoryService, type DirectoryEntry } from "@/mock/directory";
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
import { Label } from "@/components/ui/label";
import {
  Search,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Ban,
  Sparkles,
  CornerDownLeft,
} from "lucide-react";
import type { UserRole } from "@/types";
import type { SendResult } from "@/store/ConnectionStore";

// ─── Role labels ───

const ROLE_LABEL: Record<UserRole, string> = {
  player: "Player",
  coach: "Coach",
  observer: "Parent",
  admin: "Admin",
};

const ROLE_STYLE: Record<string, string> = {
  player: "bg-muted text-foreground dark:text-foreground",
  coach: "bg-muted text-foreground dark:text-foreground",
  observer: "bg-primary/10 text-primary dark:text-primary",
};

const ROLE_ID_PREFIX: Record<UserRole, string> = {
  player: "TAI-P-",
  coach: "TAI-C-",
  observer: "TAI-F-",
  admin: "TAI-A-",
};

// ─── Allowed connection info per role ───

function getHelpText(role: UserRole): string {
  switch (role) {
    case "coach":
      return "Enter a Player ID (e.g. TAI-P-001) to request a connection.";
    case "player":
      return "Enter a Coach ID (e.g. TAI-C-001) or Parent ID (e.g. TAI-F-001) to connect.";
    case "observer":
      return "Enter a Player ID (e.g. TAI-P-001) to follow their progress.";
    default:
      return "Enter a public ID to connect.";
  }
}

function getIdPlaceholder(role: UserRole): string {
  switch (role) {
    case "coach":
      return "TAI-P-001";
    case "player":
      return "TAI-C-001 or TAI-F-001";
    case "observer":
      return "TAI-P-001";
    default:
      return "TAI-X-000";
  }
}

// ─── Component ───

interface NewConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSent: (entry: DirectoryEntry) => SendResult | void;
}

export function NewConnectionDialog({
  open,
  onOpenChange,
  onRequestSent,
}: NewConnectionDialogProps) {
  const { user } = useAuth();
  const myRole = user?.role ?? "player";

  const [publicId, setPublicId] = useState("");
  const [lookupResult, setLookupResult] = useState<DirectoryEntry | null>(null);
  const [error, setError] = useState("");
  const [roleMismatch, setRoleMismatch] = useState<{
    entry: DirectoryEntry;
    reason: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestedPrefix, setSuggestedPrefix] = useState<string | null>(null);

  const reset = () => {
    setPublicId("");
    setLookupResult(null);
    setError("");
    setRoleMismatch(null);
    setLoading(false);
    setSent(false);
    setSuggestedPrefix(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleLookup = async () => {
    if (!publicId.trim()) return;
    setError("");
    setRoleMismatch(null);
    setLookupResult(null);
    setLoading(true);

    try {
      const entry = await mockDirectoryService.lookupByPublicId(publicId);
      if (!entry) {
        setError("No user found with that ID. Please double-check and try again.");
        return;
      }

      // Self-check
      if (entry.id === user?.id) {
        setError("You cannot send a connection request to yourself.");
        return;
      }

      // Role validation
      const validation = mockDirectoryService.validateConnection(myRole, entry.role);
      if (!validation.valid) {
        setRoleMismatch({ entry, reason: validation.reason! });
        return;
      }

      setLookupResult(entry);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = () => {
    if (!lookupResult) return;
    const res = onRequestSent(lookupResult);
    if (res && "ok" in res && !res.ok) {
      setError(res.reason);
      return;
    }
    setSent(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            New Connection Request
          </DialogTitle>
          <DialogDescription>{getHelpText(myRole)}</DialogDescription>
        </DialogHeader>

        {sent ? (
          /* ─── Success state ─── */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Request Sent!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your connection request to{" "}
                <span className="font-medium text-foreground">
                  {lookupResult?.firstName} {lookupResult?.lastName}
                </span>{" "}
                has been sent. They'll be notified and can approve or decline.
              </p>
            </div>
            <Button onClick={() => handleClose(false)}>Done</Button>
          </div>
        ) : (
          /* ─── Lookup form ─── */
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleLookup();
            }}
          >
            {/* ID Input */}
            <div className="space-y-2">
              <Label htmlFor="publicId">Public ID</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="publicId"
                    ref={inputRef}
                    value={publicId}
                    onChange={(e) => {
                      setPublicId(e.target.value.toUpperCase());
                      setError("");
                    setRoleMismatch(null);
                      setLookupResult(null);
                      setSuggestedPrefix(null);
                    }}
                    placeholder={getIdPlaceholder(myRole)}
                    className="pl-9 font-mono"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!publicId.trim() || loading}
                  variant="outline"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Lookup"
                  )}
                </Button>
              </div>
              {suggestedPrefix && publicId === suggestedPrefix && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CornerDownLeft className="h-3 w-3" />
                  Type the rest of the ID, then press
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                    Enter
                  </kbd>
                  to search.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Role mismatch — clear inline messaging with reason + alternatives */}
            {roleMismatch && (
              <div
                role="alert"
                className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
              >
                <div className="flex items-start gap-2 text-destructive">
                  <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold">Connection not allowed</p>
                    <p className="text-destructive/90">{roleMismatch.reason}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-background/60 p-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                    {roleMismatch.entry.firstName[0]}
                    {roleMismatch.entry.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {roleMismatch.entry.firstName} {roleMismatch.entry.lastName}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {roleMismatch.entry.publicId}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      ROLE_STYLE[roleMismatch.entry.role] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ROLE_LABEL[roleMismatch.entry.role]}
                  </span>
                </div>

                <div className="border-t border-destructive/20 pt-2 text-xs text-foreground">
                  {(() => {
                    const allowed = mockDirectoryService.getAllowedTargetRoles(myRole);
                    if (allowed.length === 0) {
                      return (
                        <p className="text-muted-foreground">
                          Your role does not support sending connection requests.
                        </p>
                      );
                    }
                    const handleSuggest = (target: UserRole) => {
                      const prefix = ROLE_ID_PREFIX[target];
                      setRoleMismatch(null);
                      setError("");
                      setLookupResult(null);
                      setPublicId(prefix);
                      setSuggestedPrefix(prefix);
                      // Focus input and place caret at the end
                      requestAnimationFrame(() => {
                        const el = inputRef.current;
                        if (el) {
                          el.focus();
                          el.setSelectionRange(prefix.length, prefix.length);
                        }
                      });
                    };
                    return (
                      <div className="space-y-2">
                        <p className="font-medium">
                          Try searching for a role you can connect with:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {allowed.map((r, i) => (
                            <Button
                              key={r}
                              type="button"
                              size="sm"
                              variant={i === 0 ? "default" : "outline"}
                              onClick={() => handleSuggest(r)}
                              className="h-7 gap-1.5 text-xs"
                            >
                              <Sparkles className="h-3 w-3" />
                              Search a {ROLE_LABEL[r]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Lookup Result */}
            {lookupResult && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {lookupResult.firstName[0]}
                    {lookupResult.lastName[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {lookupResult.firstName} {lookupResult.lastName}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          ROLE_STYLE[lookupResult.role] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {ROLE_LABEL[lookupResult.role]}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {lookupResult.publicId}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Allowed connections hint */}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <span className="font-semibold">Allowed connections: </span>
              {mockDirectoryService
                .getAllowedTargetRoles(myRole)
                .map((r) => ROLE_LABEL[r])
                .join(", ") || "None"}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendRequest}
                disabled={!lookupResult}
                className="gap-1.5"
              >
                Send Request
                <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
