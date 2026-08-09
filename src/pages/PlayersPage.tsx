// TODO: Integrate with GET /api/coach/players endpoint
import { useConnections } from "@/store/ConnectionStore";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { EmptyState, StatusBadge } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, UserPlus, BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlayerStatsDrawer } from "@/components/players/PlayerStatsDrawer";
import type { ConnectedPlayer } from "@/types";

export default function PlayersPage() {
  const { connectedPlayers } = useConnections();
  const [search, setSearch] = useState("");
  const [statsPlayer, setStatsPlayer] = useState<ConnectedPlayer | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep link: /players?player=<id> opens that player's stats drawer. The coach
  // dashboard's "View" links point here.
  const requestedPlayerId = searchParams.get("player");
  useEffect(() => {
    if (!requestedPlayerId) return;
    const match = connectedPlayers.find((p) => p.id === requestedPlayerId);
    if (match) setStatsPlayer(match);
  }, [requestedPlayerId, connectedPlayers]);

  /** Closing also drops the deep-link param, so a reload doesn't reopen it. */
  const closeStats = () => {
    setStatsPlayer(null);
    if (searchParams.has("player")) {
      const next = new URLSearchParams(searchParams);
      next.delete("player");
      setSearchParams(next, { replace: true });
    }
  };

  const filtered = connectedPlayers.filter((p) =>
    !search || `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Players</h1>
          <p className="text-sm text-muted-foreground">Players with active connections to you.</p>
        </div>
        <Button className="gap-2 self-start" asChild>
          <Link to="/connections"><UserPlus className="h-4 w-4" /> Connect Player</Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-muted-foreground" />}
          title="No connected players"
          description="Send connection requests to players to start managing them."
        >
          <Button asChild><Link to="/connections">Send Request</Link></Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((player) => (
            <DashboardCard key={player.id} title={`${player.firstName} ${player.lastName}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {player.firstName[0]}{player.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">{player.playerPublicId}</p>
                  <p className="text-xs text-muted-foreground">Connected since {new Date(player.connectedSince).toLocaleDateString()}</p>
                </div>
              </div>
              {/*
                One real action per card. The old ghost "View" button had no
                handler and duplicated this one, so it is gone.
              */}
              <div className="mt-3 flex items-center gap-2">
                <StatusBadge status="active" />
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto gap-1 text-xs"
                  onClick={() => setStatsPlayer(player)}
                >
                  <BarChart3 className="h-3 w-3" /> View stats
                </Button>
              </div>
            </DashboardCard>
          ))}
        </div>
      )}

      <PlayerStatsDrawer player={statsPlayer} open={!!statsPlayer} onOpenChange={(o) => { if (!o) closeStats(); }} />
    </div>
  );
}
