// Reusable player filter dropdown for coach/observer views
// Supports "view detail" action to open PlayerDetailDrawer
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { User, Eye } from "lucide-react";
import type { ConnectedPlayer } from "@/types";

const ALL = "__all__";

interface PlayerFilterSelectProps {
  players: ConnectedPlayer[];
  value: string;
  onValueChange: (value: string) => void;
  /** Called when user wants to see full detail for selected player */
  onViewDetail?: (player: ConnectedPlayer) => void;
  className?: string;
  showIcon?: boolean;
}

export function PlayerFilterSelect({ players, value, onValueChange, onViewDetail, className, showIcon }: PlayerFilterSelectProps) {
  const { t } = useT();
  if (players.length === 0) return null;

  const selectedPlayer = value !== ALL ? players.find((p) => p.id === value) : null;

  return (
    <div className="flex items-center gap-1.5">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={t("a11y.filters.player")} className={className ?? "w-[170px]"}>
          {showIcon && <User className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />}
          <SelectValue placeholder="All Players" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Players</SelectItem>
          {players.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedPlayer && onViewDetail && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          title={`View ${selectedPlayer.firstName}'s profile`}
          onClick={() => onViewDetail(selectedPlayer)}
        >
          <Eye className="h-3.5 w-3.5 text-primary" />
        </Button>
      )}
    </div>
  );
}

PlayerFilterSelect.ALL = ALL;
