// ============================================================
// A coach's view of one player's equipment — read-only by design.
//
// The server lets whoever may act for a player (their connected coach, a
// consenting guardian) READ this list; adding, editing and deleting stay the
// player's alone, so there is deliberately no control here that would be
// refused. The grouping and condition styling are the player's own Equipment
// page's, shared through components/equipment/categories.
// ============================================================
import { useMemo } from "react";
import { Package } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEquipment } from "@/hooks/api/queries";
import type { ConnectedPlayer, EquipmentCategory, EquipmentItem } from "@/types";
import { CATEGORY_CONFIG, CATEGORY_ORDER, CONDITION_STYLES, getConditionLevel } from "./categories";

interface PlayerEquipmentDrawerProps {
  player: ConnectedPlayer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlayerEquipmentDrawer({ player, open, onOpenChange }: PlayerEquipmentDrawerProps) {
  const playerId = player?.id ?? "";
  const { data: items = [], isLoading, error, refetch } = useEquipment(playerId);

  const grouped = useMemo(() => {
    const map: Record<EquipmentCategory, EquipmentItem[]> = { racket: [], string: [], shoes: [], balls: [], accessories: [] };
    items.forEach((item) => map[item.category]?.push(item));
    return map;
  }, [items]);

  if (!player) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {player.firstName} {player.lastName} — Equipment
          </SheetTitle>
          <SheetDescription>
            Read-only. Only {player.firstName} can add or change items.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading equipment…</p>
          ) : error ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load {player.firstName}'s equipment.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {player.firstName} hasn't added any equipment yet.
            </p>
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const catItems = grouped[cat];
              if (catItems.length === 0) return null;
              const cfg = CATEGORY_CONFIG[cat];
              return (
                <section key={cat} className="border border-border bg-card">
                  <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                    <div className="flex h-7 w-7 items-center justify-center bg-primary/10 text-primary">{cfg.icon}</div>
                    <span className="text-sm font-semibold text-foreground">{cfg.plural}</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{catItems.length}</Badge>
                  </header>
                  <ul className="divide-y divide-border">
                    {catItems.map((item) => {
                      const level = getConditionLevel(item.category, item.condition);
                      return (
                        <li key={item.id} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                            {item.condition && (
                              <span className={`inline-flex border px-2 py-0 text-[10px] font-medium ${CONDITION_STYLES[level]}`}>
                                {item.condition}
                              </span>
                            )}
                          </div>
                          {(item.brand || item.model || item.notes) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                              {item.brand && <span>{item.brand}</span>}
                              {item.brand && item.model && <span>·</span>}
                              {item.model && <span>{item.model}</span>}
                              {item.notes && <span className="text-muted-foreground/60">— {item.notes}</span>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
