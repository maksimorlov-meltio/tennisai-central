// ============================================================
// One menu per player or team, the same wherever a coach meets them — the
// Players page, the Teams page and the dashboard.
//
// Two kinds of item live here. Schedule and Calendar NAVIGATE: they deep-link
// into pages that already know how to filter by player or team (entityLinks).
// Stats and Equipment OPEN A DRAWER over the current page, so the coach does
// not lose their place; the page owning the menu owns that drawer and passes
// the setter in. An item whose callback is not supplied is simply not shown —
// a menu never offers something that would do nothing.
// ============================================================
import { useNavigate } from "react-router-dom";
import { BarChart3, CalendarDays, ChevronDown, ListChecks, MoreHorizontal, Package, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ConnectedPlayer, Team } from "@/types";
import {
  playerCalendarHref, playerScheduleHref, teamCalendarHref, teamManageHref, teamScheduleHref,
} from "./entityLinks";

interface TriggerProps {
  /** Accessible name — says WHOSE menu this is, since a page shows many. */
  label: string;
  /** Icon-only trigger for dense rows; the default is a labelled button for cards. */
  compact?: boolean;
  className?: string;
}

/**
 * The trigger reads as one thing on a card ("Actions") and as a discreet "…"
 * on a row. Both keep the 44px touch target the rest of the app promises.
 */
function MenuTrigger({ label, compact, className }: TriggerProps) {
  if (compact) {
    return (
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          className={cn("h-8 w-8 shrink-0 coarse:min-h-11 coarse:min-w-11", className)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
    );
  }
  return (
    <DropdownMenuTrigger asChild>
      <Button size="sm" variant="outline" aria-label={label} className={cn("gap-1 text-xs coarse:min-h-11", className)}>
        Actions <ChevronDown className="h-3 w-3" />
      </Button>
    </DropdownMenuTrigger>
  );
}

const ITEM = "gap-2 coarse:min-h-11";

export interface PlayerActionsMenuProps {
  player: ConnectedPlayer;
  /** Opens the training-stats drawer for this player. Omit to hide the item. */
  onViewStats?: (player: ConnectedPlayer) => void;
  /** Opens the read-only equipment drawer for this player. Omit to hide the item. */
  onViewEquipment?: (player: ConnectedPlayer) => void;
  compact?: boolean;
  className?: string;
}

export function PlayerActionsMenu({ player, onViewStats, onViewEquipment, compact, className }: PlayerActionsMenuProps) {
  const navigate = useNavigate();
  const name = `${player.firstName} ${player.lastName}`;

  return (
    <DropdownMenu>
      <MenuTrigger label={`Actions for ${name}`} compact={compact} className={className} />
      <DropdownMenuContent align="end" className="w-[13rem]">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} onSelect={() => navigate(playerScheduleHref(player.id))}>
          <ListChecks className="h-4 w-4" /> Schedule
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={() => navigate(playerCalendarHref(player.id))}>
          <CalendarDays className="h-4 w-4" /> Calendar
        </DropdownMenuItem>
        {onViewStats && (
          <DropdownMenuItem className={ITEM} onSelect={() => onViewStats(player)}>
            <BarChart3 className="h-4 w-4" /> Stats
          </DropdownMenuItem>
        )}
        {onViewEquipment && (
          <DropdownMenuItem className={ITEM} onSelect={() => onViewEquipment(player)}>
            <Package className="h-4 w-4" /> Equipment
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface TeamActionsMenuProps {
  team: Team;
  /**
   * What "Manage team" does. On the Teams page that is opening the roster in
   * place; elsewhere it falls back to navigating to /teams?team=<id>.
   */
  onManage?: (team: Team) => void;
  compact?: boolean;
  className?: string;
}

export function TeamActionsMenu({ team, onManage, compact, className }: TeamActionsMenuProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <MenuTrigger label={`Actions for ${team.name}`} compact={compact} className={className} />
      <DropdownMenuContent align="end" className="w-[13rem]">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{team.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} onSelect={() => navigate(teamScheduleHref(team.id))}>
          <ListChecks className="h-4 w-4" /> Schedule
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={() => navigate(teamCalendarHref(team.id))}>
          <CalendarDays className="h-4 w-4" /> Calendar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={ITEM}
          onSelect={() => (onManage ? onManage(team) : navigate(teamManageHref(team.id)))}
        >
          <Settings2 className="h-4 w-4" /> Manage team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
