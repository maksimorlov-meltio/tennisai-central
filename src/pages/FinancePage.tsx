// Finance — Transaction list + category breakdown via React Query
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { useT } from "@/lib/i18n";
import { useFinanceEntries, useFinanceSummary, useCreateFinanceEntry } from "@/hooks/api/queries";
import { ReadOnlyBanner, ReadOnlyBadge, LoadingState, ErrorState, EmptyState } from "@/components/ui/shared";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { PlayerFilterSelect } from "@/components/PlayerFilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Wallet, Plus, Dumbbell, Plane, Trophy, Package } from "lucide-react";
import type { FinanceCategory } from "@/types";
import { format } from "date-fns";

const ALL_PLAYERS = "__all__";

const CATEGORIES: { value: FinanceCategory; label: string; icon: React.ReactNode }[] = [
  { value: "training", label: "Training", icon: <Dumbbell className="h-4 w-4" /> },
  { value: "travel", label: "Travel", icon: <Plane className="h-4 w-4" /> },
  { value: "tournament", label: "Tournament", icon: <Trophy className="h-4 w-4" /> },
  { value: "equipment", label: "Equipment", icon: <Package className="h-4 w-4" /> },
];

export default function FinancePage() {
  const { t } = useT();
  const { user } = useAuth();
  const { connectedPlayers } = useConnections();
  const role = user?.role ?? "player";
  const isObserver = role === "observer";

  // Observer views a connected player's finances — defaults to the first connected player.
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const observerPlayerId =
    selectedPlayerId && selectedPlayerId !== ALL_PLAYERS
      ? selectedPlayerId
      : connectedPlayers[0]?.id ?? "";
  const playerId = !user ? "" : role === "player" ? user.id : observerPlayerId;

  const { data: entries = [], isLoading, error } = useFinanceEntries(playerId);
  const { data: summary } = useFinanceSummary(playerId);
  const createMut = useCreateFinanceEntry();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", category: "training" as FinanceCategory, date: "", currency: "USD" });

  const handleAdd = () => {
    if (!playerId) return;
    createMut.mutate({ playerId, data: { description: form.description, amount: parseFloat(form.amount), category: form.category, date: form.date || new Date().toISOString().slice(0, 10), currency: form.currency } }, {
      onSuccess: () => { setAddOpen(false); setForm({ description: "", amount: "", category: "training", date: "", currency: "USD" }); },
    });
  };

  if (!user) return <LoadingState message="Loading…" />;

  // Observer with nothing connected yet — no player to show finances for, no fake numbers.
  if (isObserver && connectedPlayers.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-foreground">Finance</h1><ReadOnlyBadge /></div>
            <p className="text-muted-foreground">Track training, travel, tournament, and equipment costs.</p>
          </div>
        </div>
        <ReadOnlyBanner />
        <EmptyState
          icon={<Wallet className="h-6 w-6 text-muted-foreground" />}
          title={t("empty.finance.noPlayers.title")}
          description={t("empty.finance.noPlayers.description")}
          action={<Button asChild className="gap-1.5"><Link to="/connections">{t("empty.finance.noPlayers.action")}</Link></Button>}
        />
      </div>
    );
  }

  if (isLoading) return <LoadingState message="Loading finance data…" />;
  if (error) return <ErrorState message="Failed to load finance data" onRetry={() => window.location.reload()} />;

  const total = summary ? summary.totalTraining + summary.totalTravel + summary.totalTournament + summary.totalEquipment : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-foreground">Finance</h1>{isObserver && <ReadOnlyBadge />}</div>
          <p className="text-muted-foreground">Track training, travel, tournament, and equipment costs.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {isObserver && connectedPlayers.length > 1 && (
            <PlayerFilterSelect
              players={connectedPlayers}
              value={selectedPlayerId || connectedPlayers[0]?.id || ALL_PLAYERS}
              onValueChange={setSelectedPlayerId}
            />
          )}
          {!isObserver && <Button className="gap-2" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Expense</Button>}
        </div>
      </div>

      {isObserver && <ReadOnlyBanner />}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c) => {
            const val = c.value === "training" ? summary.totalTraining : c.value === "travel" ? summary.totalTravel : c.value === "tournament" ? summary.totalTournament : summary.totalEquipment;
            return (
              <div key={c.value} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{c.icon}</div>
                <div><div className="text-lg font-bold text-foreground">${val.toLocaleString()}</div><div className="text-xs text-muted-foreground">{c.label}</div></div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wallet className="h-4 w-4" /></div>
            <div><div className="text-lg font-bold text-foreground">${total.toLocaleString()}</div><div className="text-xs text-muted-foreground">Total</div></div>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6 text-muted-foreground" />}
          title={t("empty.finance.title")}
          description={isObserver ? t("empty.finance.observer.description") : t("empty.finance.player.description")}
          // A parent is read-only here: their player logs the expenses.
          action={!isObserver ? <Button onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> {t("empty.finance.player.action")}</Button> : undefined}
        />
      ) : (
        <DashboardCard title="Transactions" description={`${entries.length} entries`} icon={<Wallet className="h-4 w-4" />}>
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{e.description}</p>
                  <p className="text-xs capitalize text-muted-foreground">{e.category} · {format(new Date(e.date), "MMM d, yyyy")}</p>
                </div>
                <span className="font-semibold text-foreground">${e.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </DashboardCard>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Expense</DialogTitle><DialogDescription>Track a new tennis-related expense.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label htmlFor="finance-description">Description *</Label><Input id="finance-description" aria-required="true" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Weekly coaching" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="finance-amount">Amount *</Label><Input id="finance-amount" aria-required="true" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></div>
              <div className="space-y-1.5"><Label htmlFor="finance-category">Category</Label><Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as FinanceCategory }))}><SelectTrigger id="finance-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}</SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="finance-date">Date</Label><Input id="finance-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.description.trim() || !form.amount || createMut.isPending}>{createMut.isPending ? "Adding…" : "Add Expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
