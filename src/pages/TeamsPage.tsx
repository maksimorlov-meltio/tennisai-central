// Team Management — Full Coach CRUD via React Query
import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Users, Pencil, Trash2, UserPlus, UserMinus, ArrowLeft, Search, Check } from "lucide-react";
import type { Team, ConnectedPlayer } from "@/types";
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, useAddTeamMember, useRemoveTeamMember } from "@/hooks/api/queries";
import { PlayerActionsMenu, TeamActionsMenu } from "@/components/coach/EntityActionsMenu";
import { PlayerStatsDrawer } from "@/components/players/PlayerStatsDrawer";
import { PlayerEquipmentDrawer } from "@/components/equipment/PlayerEquipmentDrawer";
import { format } from "date-fns";

function PlayerAvatar({ player, size = "md" }: { player: ConnectedPlayer; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary`}>
      {player.firstName[0]}{player.lastName[0]}
    </div>
  );
}

function TeamCard({ team, onSelect, onRename, onDelete }: {
  team: Team; onSelect: () => void; onRename: () => void; onDelete: () => void;
}) {
  return (
    <div className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/20 hover:bg-accent/20">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
          <div>
            <h3 className="font-semibold text-foreground">{team.name}</h3>
            <p className="text-xs text-muted-foreground">{team.players.length} player{team.players.length !== 1 ? "s" : ""} · Created {format(new Date(team.createdAt), "MMM yyyy")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onRename(); }}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          <TeamActionsMenu team={team} onManage={onSelect} compact />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">{team.players.slice(0, 5).map((p) => (<PlayerAvatar key={p.id} player={p} size="sm" />))}</div>
        {team.players.length > 5 && <span className="text-xs text-muted-foreground">+{team.players.length - 5} more</span>}
        {team.players.length === 0 && <span className="text-xs text-muted-foreground">No players yet</span>}
      </div>
      <Button variant="outline" className="w-full gap-1.5" onClick={onSelect}>Manage Team<ArrowLeft className="h-3.5 w-3.5 rotate-180" /></Button>
    </div>
  );
}

function TeamDetail({ team, connectedPlayers, onBack, onAddPlayer, onRemovePlayer, onRename, addingPlayer, removingPlayer }: {
  team: Team; connectedPlayers: ConnectedPlayer[]; onBack: () => void;
  onAddPlayer: (player: ConnectedPlayer) => void; onRemovePlayer: (playerId: string) => void;
  onRename: () => void; addingPlayer?: boolean; removingPlayer?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statsPlayer, setStatsPlayer] = useState<ConnectedPlayer | null>(null);
  const [equipmentPlayer, setEquipmentPlayer] = useState<ConnectedPlayer | null>(null);
  const teamPlayerIds = new Set(team.players.map((p) => p.id));
  const availablePlayers = connectedPlayers.filter(
    (p) => !teamPlayerIds.has(p.id) && (!search || `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">{team.name}</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRename}><Pencil className="h-3.5 w-3.5" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">{team.players.length} player{team.players.length !== 1 ? "s" : ""} · Created {format(new Date(team.createdAt), "MMM d, yyyy")}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard title="Team Roster" description={`${team.players.length} player${team.players.length !== 1 ? "s" : ""}`} icon={<Users className="h-4 w-4" />}>
          {team.players.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No players in this team yet.</p>
          ) : (
            <div className="space-y-2">
              {team.players.map((player) => (
                <div key={player.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30">
                  <PlayerAvatar player={player} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{player.firstName} {player.lastName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{player.playerPublicId}</p>
                  </div>
                  <PlayerActionsMenu player={player} compact onViewStats={setStatsPlayer} onViewEquipment={setEquipmentPlayer} />
                  <Button size="sm" variant="ghost" disabled={removingPlayer} className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onRemovePlayer(player.id)}>
                    <UserMinus className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
        <DashboardCard title="Add Connected Players" description="Only players with accepted connections" icon={<UserPlus className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search connected players…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
            {connectedPlayers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No connected players yet.</p>
            ) : availablePlayers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{search ? "No matching players found." : "All connected players are already in this team."}</p>
            ) : (
              <div className="space-y-2">
                {availablePlayers.map((player) => (
                  <div key={player.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30">
                    <PlayerAvatar player={player} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{player.firstName} {player.lastName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{player.playerPublicId}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={addingPlayer} className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/10" onClick={() => onAddPlayer(player)}>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DashboardCard>
      </div>

      <PlayerStatsDrawer player={statsPlayer} open={!!statsPlayer} onOpenChange={(o) => { if (!o) setStatsPlayer(null); }} />
      <PlayerEquipmentDrawer player={equipmentPlayer} open={!!equipmentPlayer} onOpenChange={(o) => { if (!o) setEquipmentPlayer(null); }} />
    </div>
  );
}

function TeamNameDialog({ open, onOpenChange, title, description, initialName, onSubmit, loading }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string;
  initialName: string; onSubmit: (name: string) => void; loading?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const handleSubmit = () => { if (!name.trim()) return; onSubmit(name.trim()); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="space-y-2"><Label htmlFor="team-name">Team Name</Label><Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="e.g. Junior Elite Squad" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || loading}><Check className="mr-1.5 h-4 w-4" /> {loading ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTeamDialog({ open, onOpenChange, teamName, onConfirm, loading }: {
  open: boolean; onOpenChange: (open: boolean) => void; teamName: string; onConfirm: () => void; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Delete Team</DialogTitle><DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">{teamName}</span>? This won't affect the player connections.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={loading} onClick={() => { onConfirm(); onOpenChange(false); }}><Trash2 className="mr-1.5 h-4 w-4" /> {loading ? "Deleting…" : "Delete Team"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamsPage() {
  const { user } = useAuth();
  const coachId = user?.id ?? "";
  const { connectedPlayers } = useConnections();

  const { data: allTeams = [], isLoading, error } = useTeams();
  const teams = useMemo(() => allTeams.filter((t) => t.coachId === coachId), [allTeams, coachId]);

  const createMut = useCreateTeam();
  const updateMut = useUpdateTeam();
  const deleteMut = useDeleteTeam();
  const addMemberMut = useAddTeamMember();
  const removeMemberMut = useRemoveTeamMember();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Deep link: /teams?team=<id> opens that team's roster. The dashboard's team
  // menu points here; an id that is not one of this coach's teams is ignored.
  const [searchParams] = useSearchParams();
  const requestedTeamId = searchParams.get("team");
  useEffect(() => {
    if (requestedTeamId && teams.some((t) => t.id === requestedTeamId)) setSelectedTeamId(requestedTeamId);
  }, [requestedTeamId, teams]);
  const [renameTarget, setRenameTarget] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId) ?? null, [teams, selectedTeamId]);

  if (isLoading) return <LoadingState message="Loading teams…" />;
  if (error) return <ErrorState message="Failed to load teams" onRetry={() => window.location.reload()} />;

  if (selectedTeam) {
    return (
      <div className="space-y-6">
        <TeamDetail
          team={selectedTeam}
          connectedPlayers={connectedPlayers}
          onBack={() => setSelectedTeamId(null)}
          onAddPlayer={(p) => addMemberMut.mutate({ teamId: selectedTeam.id, player: p })}
          onRemovePlayer={(pid) => removeMemberMut.mutate({ teamId: selectedTeam.id, playerId: pid })}
          onRename={() => setRenameTarget(selectedTeam)}
          addingPlayer={addMemberMut.isPending}
          removingPlayer={removeMemberMut.isPending}
        />
        {renameTarget && <TeamNameDialog open={!!renameTarget} onOpenChange={(v) => !v && setRenameTarget(null)} title="Rename Team" description="Enter a new name for this team." initialName={renameTarget.name} onSubmit={(name) => { updateMut.mutate({ id: renameTarget.id, data: { name } }); setRenameTarget(null); }} loading={updateMut.isPending} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">Teams</h1><p className="text-sm text-muted-foreground">Create teams and organize your connected players into groups.</p></div>
        <Button className="gap-2 self-start" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create Team</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-4 w-4" /></div><div><div className="text-xl font-bold text-foreground">{teams.length}</div><div className="text-xs text-muted-foreground">Teams</div></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserPlus className="h-4 w-4" /></div><div><div className="text-xl font-bold text-foreground">{connectedPlayers.length}</div><div className="text-xs text-muted-foreground">Connected Players</div></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-4 w-4" /></div><div><div className="text-xl font-bold text-foreground">{new Set(teams.flatMap((t) => t.players.map((p) => p.id))).size}</div><div className="text-xs text-muted-foreground">Players in Teams</div></div></div>
      </div>

      {teams.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6 text-muted-foreground" />} title="No teams yet" description="Create your first team to organize players.">
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Create Team</Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (<TeamCard key={team.id} team={team} onSelect={() => setSelectedTeamId(team.id)} onRename={() => setRenameTarget(team)} onDelete={() => setDeleteTarget(team)} />))}
          <button onClick={() => setCreateOpen(true)} className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"><Plus className="h-8 w-8" /><span className="text-sm font-medium">Create New Team</span></button>
        </div>
      )}

      <TeamNameDialog open={createOpen} onOpenChange={setCreateOpen} title="Create Team" description="Give your new team a name." initialName="" onSubmit={(name) => createMut.mutate({ name, coachId })} loading={createMut.isPending} />
      {renameTarget && <TeamNameDialog open={!!renameTarget} onOpenChange={(v) => !v && setRenameTarget(null)} title="Rename Team" description="Enter a new name for this team." initialName={renameTarget.name} onSubmit={(name) => { updateMut.mutate({ id: renameTarget.id, data: { name } }); setRenameTarget(null); }} loading={updateMut.isPending} />}
      {deleteTarget && <DeleteTeamDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)} teamName={deleteTarget.name} onConfirm={() => { deleteMut.mutate(deleteTarget.id); setDeleteTarget(null); }} loading={deleteMut.isPending} />}
    </div>
  );
}
