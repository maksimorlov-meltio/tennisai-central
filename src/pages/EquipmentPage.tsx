// Equipment — Grouped by category with condition tracking & AI upgrade suggestions
import { useState, useMemo } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useEquipment, useCreateEquipment, useUpdateEquipment, useDeleteEquipment } from "@/hooks/api/queries";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Package, Plus, Trash2, ChevronDown, Lightbulb,
} from "lucide-react";
import type { EquipmentCategory, EquipmentItem } from "@/types";
import { CATEGORY_CONFIG, CATEGORY_ORDER, CONDITION_STYLES, getConditionLevel } from "@/components/equipment/categories";

// ─── AI Upgrade Suggestions ───

const UPGRADE_SUGGESTIONS: Record<EquipmentCategory, string[]> = {
  racket: [
    "Consider upgrading to a newer frame — modern rackets offer better dampening and power transfer",
    "A cracked or dead-feeling frame affects shot control. Look at the Wilson Clash or Babolat Pure Aero for replacements",
    "Schedule a demo day at your local pro shop to test newer models before buying",
  ],
  string: [
    "Fraying strings lose tension unpredictably — restring before your next match",
    "Consider switching to a more durable polyester like Luxilon ALU Power or Solinco Hyper-G",
    "If you break strings frequently, try a hybrid setup (poly mains, synthetic gut crosses)",
  ],
  shoes: [
    "Worn treads significantly increase slip risk on hard courts — prioritize replacing shoes",
    "Look into shoes with reinforced toe caps if you drag your feet on serves",
    "Consider the ASICS Gel-Resolution or adidas Barricade for maximum court durability",
  ],
  balls: [
    "Dead balls alter bounce patterns and can develop bad timing habits — use fresh balls for match practice",
    "Keep a rotation: new balls for match play, used for warm-up, dead for ball machine drills",
  ],
  accessories: [
    "Worn overgrips reduce racket control — replace every 3-5 sessions",
    "Check dampeners, wristbands, and bags for wear that could affect your game or comfort",
  ],
};

function getUpgradeSuggestions(items: EquipmentItem[]): { category: EquipmentCategory; itemName: string; suggestions: string[] }[] {
  const results: { category: EquipmentCategory; itemName: string; suggestions: string[] }[] = [];
  for (const item of items) {
    const level = getConditionLevel(item.category, item.condition);
    if (level === "poor" || level === "fair") {
      results.push({
        category: item.category,
        itemName: item.name,
        suggestions: UPGRADE_SUGGESTIONS[item.category] ?? [],
      });
    }
  }
  return results;
}

// ─── Main Page ───

export default function EquipmentPage() {
  const { user } = useAuth();
  const playerId = user?.id ?? "";
  const { data: items = [], isLoading, error } = useEquipment(playerId);
  const createMut = useCreateEquipment();
  const deleteMut = useDeleteEquipment();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<EquipmentCategory>("racket");
  const [form, setForm] = useState({ name: "", category: "racket" as EquipmentCategory, brand: "", model: "", condition: "", notes: "" });
  const [openGroups, setOpenGroups] = useState<Set<EquipmentCategory>>(new Set(CATEGORY_ORDER));

  // Group items by category
  const grouped = useMemo(() => {
    const map: Record<EquipmentCategory, EquipmentItem[]> = { racket: [], string: [], shoes: [], balls: [], accessories: [] };
    items.forEach((item) => map[item.category]?.push(item));
    return map;
  }, [items]);

  // AI suggestions for items in poor/fair condition
  const aiSuggestions = useMemo(() => getUpgradeSuggestions(items), [items]);

  const toggleGroup = (cat: EquipmentCategory) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleAdd = () => {
    createMut.mutate({
      playerId, name: form.name, category: form.category,
      brand: form.brand || undefined, model: form.model || undefined,
      condition: form.condition || undefined, notes: form.notes || undefined,
    }, {
      onSuccess: () => { setAddOpen(false); setForm({ name: "", category: "racket", brand: "", model: "", condition: "", notes: "" }); },
    });
  };

  const openAddDialog = (category?: EquipmentCategory) => {
    setForm({ name: "", category: category ?? "racket", brand: "", model: "", condition: "", notes: "" });
    setSelectedCategory(category ?? "racket");
    setAddOpen(true);
  };

  if (!user) return <LoadingState message="Loading…" />;
  if (isLoading) return <LoadingState message="Loading equipment…" />;
  if (error) return <ErrorState message="Failed to load equipment" onRetry={() => window.location.reload()} />;

  const currentConditions = CATEGORY_CONFIG[form.category].conditions;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipment</h1>
          <p className="text-muted-foreground">Manage your rackets, strings, shoes, and more.</p>
        </div>
        <Button className="gap-2 self-start" onClick={() => openAddDialog()}>
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      {/* AI Upgrade Suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary dark:text-primary">
            <Lightbulb className="h-4 w-4" />
            Equipment Upgrade Recommendations
          </div>
          <div className="space-y-3">
            {aiSuggestions.map((s, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  <Badge variant="outline" className={`mr-2 text-[10px] ${CONDITION_STYLES[getConditionLevel(s.category, undefined)]}`}>
                    {CATEGORY_CONFIG[s.category].label}
                  </Badge>
                  {s.itemName}
                  <span className={`ml-2 inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${CONDITION_STYLES.poor}`}>Needs attention</span>
                </p>
                <ul className="space-y-1 pl-4">
                  {s.suggestions.slice(0, 2).map((tip, j) => (
                    <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped equipment */}
      {items.length === 0 ? (
        <EmptyState icon={<Package className="h-6 w-6 text-muted-foreground" />} title="No equipment" description="Start tracking your tennis equipment.">
          <Button onClick={() => openAddDialog()} className="gap-1.5"><Plus className="h-4 w-4" /> Add Item</Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {CATEGORY_ORDER.map((cat) => {
            const catItems = grouped[cat];
            const cfg = CATEGORY_CONFIG[cat];
            if (catItems.length === 0) return null;
            const isOpen = openGroups.has(cat);

            return (
              <Collapsible key={cat} open={isOpen} onOpenChange={() => toggleGroup(cat)}>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-accent/10">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{cfg.icon}</div>
                        <span className="text-sm font-semibold text-foreground">{cfg.plural}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{catItems.length}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={(e) => { e.stopPropagation(); openAddDialog(cat); }}>
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border divide-y divide-border">
                      {catItems.map((item) => {
                        const level = getConditionLevel(item.category, item.condition);
                        return (
                          <div key={item.id} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-foreground truncate">{item.name}</h3>
                                {item.condition && (
                                  <span className={`inline-flex rounded-full border px-2 py-0 text-[10px] font-medium ${CONDITION_STYLES[level]}`}>
                                    {item.condition}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                {item.brand && <span>{item.brand}</span>}
                                {item.brand && item.model && <span>·</span>}
                                {item.model && <span>{item.model}</span>}
                                {item.notes && <span className="text-muted-foreground/60">— {item.notes}</span>}
                              </div>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 shrink-0" aria-label={`Delete ${item.name}`} onClick={() => deleteMut.mutate({ id: item.id, playerId })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Add Equipment Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Equipment</DialogTitle>
            <DialogDescription>Track a new piece of tennis equipment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Wilson Pro Staff 97" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as EquipmentCategory, condition: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ORDER.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-2">{CATEGORY_CONFIG[c].icon}{CATEGORY_CONFIG[c].label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} placeholder="Wilson, Babolat…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setForm((f) => ({ ...f, condition: v }))}>
                <SelectTrigger><SelectValue placeholder="Select condition…" /></SelectTrigger>
                <SelectContent>
                  {currentConditions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${CONDITION_STYLES[c.level].split(" ")[0].replace("/10", "")}`} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. Tension: 52 lbs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.name.trim() || createMut.isPending}>
              {createMut.isPending ? "Adding…" : "Add Equipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
