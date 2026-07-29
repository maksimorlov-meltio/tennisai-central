// Tournaments — with React Query, team filter, player detail, and a map view
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search, MapPin, Calendar, Sun, Warehouse, Mountain, X, Users, Trophy, RefreshCw, Plus, Trash2, Check,
  Eye, EyeOff, LocateFixed, Loader2, Lock,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { ReadOnlyBanner, ReadOnlyBadge, StatusBadge, EmptyState, LoadingState, ErrorState } from "@/components/ui/shared";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TeamFilterSelect } from "@/components/TeamFilterSelect";
import { PlayerFilterSelect } from "@/components/PlayerFilterSelect";
import { PlayerDetailDrawer } from "@/components/PlayerDetailDrawer";
import { TournamentMap } from "@/components/tournaments/TournamentMap";
import {
  useTournaments, usePlayerTournaments, useUpdatePlayerTournament, useAddPlayerTournament, useRemovePlayerTournament, useTeams,
  useHiddenTournaments, useHideTournament, useUnhideTournament,
} from "@/hooks/api/queries";
import { queryKeys } from "@/hooks/api/queries";
import { useGeolocation } from "@/hooks/useGeolocation";
import { CITIES } from "@/lib/geo/cities";
import { haversineKm, formatDistanceKm } from "@/lib/geo/distance";
import type { TournamentStatus, ConnectedPlayer, Tournament } from "@/types";
import { toast } from "sonner";
const ALL = "__all__";
const surfaceColor: Record<string, string> = {
  Clay: "bg-primary/10 text-primary dark:text-primary",
  Hard: "bg-muted text-foreground dark:text-foreground",
  Grass: "bg-muted text-foreground dark:text-foreground",
};
const STATUS_OPTIONS: TournamentStatus[] = ["planned", "registered", "maybe", "withdrawn", "played"];
const MAX_RADIUS_KM = 20000; // ~ half the Earth's circumference — effectively "any distance"

function distanceFromUser(userCoords: { lat: number; lng: number } | null, t: Tournament): number | null {
  if (!userCoords || typeof t.latitude !== "number" || typeof t.longitude !== "number") return null;
  return haversineKm(userCoords, { lat: t.latitude, lng: t.longitude });
}

export default function TournamentsPage() {
  const { user } = useAuth();
  const { connectedPlayers } = useConnections();
  const queryClient = useQueryClient();
  const role = user?.role ?? "player";
  const isCoach = role === "coach";
  const isObserver = role === "observer";
  const isPlayer = role === "player";

  const { data: tournaments = [], isLoading: loadingT, error: errorT, refetch: refetchTournaments, isFetching: isRefetchingTournaments } = useTournaments();
  const { data: playerTournaments = [], isLoading: loadingPT, error: errorPT } = usePlayerTournaments();
  const { data: teams = [] } = useTeams();
  const { data: hiddenIds = [] } = useHiddenTournaments();
  const updatePT = useUpdatePlayerTournament();
  const addPT = useAddPlayerTournament();
  const removePT = useRemovePlayerTournament();
  const hideTournament = useHideTournament();
  const unhideTournament = useUnhideTournament();
  const { status: geoStatus, coords: userCoords, request: requestLocation, setManual: setManualLocation, clear: clearLocation } = useGeolocation();

  // The current user's own tournament entry for a given tournament (if any).
  const myEntryFor = (tournamentId: string) =>
    playerTournaments.find((pt) => pt.tournamentId === tournamentId && pt.playerId === user?.id);

  const connectedIds = new Set(connectedPlayers.map((p) => p.id));
  const showPlayerTournaments = isCoach || isObserver;

  const surfaces = useMemo(() => [...new Set(tournaments.map((t) => t.surface))], [tournaments]);
  const countries = useMemo(() => [...new Set(tournaments.map((t) => t.country))].sort(), [tournaments]);
  const categories = useMemo(() => [...new Set(tournaments.map((t) => t.category).filter(Boolean))] as string[], [tournaments]);

  const [search, setSearch] = useState("");
  const [surface, setSurface] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [country, setCountry] = useState(ALL);
  const [playerFilter, setPlayerFilter] = useState(ALL);
  const [teamFilter, setTeamFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [viewMode, setViewMode] = useState<"tournaments" | "players" | "map">(showPlayerTournaments || isPlayer ? "players" : "tournaments");

  // Map view controls
  const [radiusKm, setRadiusKm] = useState(MAX_RADIUS_KM);
  const [sortByNearest, setSortByNearest] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Player detail drawer
  const [playerDetailOpen, setPlayerDetailOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<ConnectedPlayer | null>(null);

  // Team filter → restrict player filter
  const teamPlayerIds = useMemo(() => {
    if (teamFilter === ALL) return null;
    const team = teams.find((t) => t.id === teamFilter);
    return new Set(team?.players.map((p) => p.id) ?? []);
  }, [teamFilter, teams]);

  const filteredPlayers = useMemo(() => {
    if (!teamPlayerIds) return connectedPlayers;
    return connectedPlayers.filter((p) => teamPlayerIds.has(p.id));
  }, [connectedPlayers, teamPlayerIds]);

  const filteredPlayerTournaments = useMemo(() => {
    return playerTournaments.filter((pt) => {
      if (isCoach && !connectedIds.has(pt.playerId)) return false;
      if (isObserver && !connectedIds.has(pt.playerId)) return false;
      if (isPlayer && pt.playerId !== user?.id) return false;
      if (teamPlayerIds && !teamPlayerIds.has(pt.playerId)) return false;
      const t = pt.tournament;
      const q = search.toLowerCase();
      if (q && !t.name.toLowerCase().includes(q) && !t.city.toLowerCase().includes(q) && !t.country.toLowerCase().includes(q)) return false;
      if (surface !== ALL && t.surface !== surface) return false;
      if (category !== ALL && t.category !== category) return false;
      if (country !== ALL && t.country !== country) return false;
      if (playerFilter !== ALL && pt.playerId !== playerFilter) return false;
      if (statusFilter !== ALL && pt.status !== statusFilter) return false;
      return true;
    });
  }, [playerTournaments, search, surface, category, country, playerFilter, statusFilter, teamFilter, isCoach, isObserver, isPlayer, connectedIds, user?.id, teamPlayerIds]);

  // Shared catalog filters (search/surface/category/country) — used by both the
  // Browse tab and the Map tab. Hidden-tournament exclusion is applied
  // per-view below, since the Map tab can reveal hidden tournaments again.
  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      const q = search.toLowerCase();
      if (q && !t.name.toLowerCase().includes(q) && !t.city.toLowerCase().includes(q) && !t.country.toLowerCase().includes(q)) return false;
      if (surface !== ALL && t.surface !== surface) return false;
      if (category !== ALL && t.category !== category) return false;
      if (country !== ALL && t.country !== country) return false;
      return true;
    });
  }, [tournaments, search, surface, category, country]);

  // Browse tab: hidden tournaments never show here (that's what "eliminate
  // from suggestions" means) — revealing them again happens from the Map tab.
  const visibleBrowseTournaments = useMemo(
    () => filteredTournaments.filter((t) => !hiddenIds.includes(t.id)),
    [filteredTournaments, hiddenIds],
  );

  // Map tab: hidden tournaments respect the "Show hidden" toggle, and results
  // are further narrowed by the radius when a location is set. Tournaments
  // missing coordinates can't be distance-checked, so they're never excluded
  // by the radius filter (they simply won't render as a map marker).
  const mapVisibleTournaments = useMemo(() => {
    return filteredTournaments.filter((t) => {
      if (!showHidden && hiddenIds.includes(t.id)) return false;
      if (userCoords) {
        const d = distanceFromUser(userCoords, t);
        if (d != null && d > radiusKm) return false;
      }
      return true;
    });
  }, [filteredTournaments, hiddenIds, showHidden, userCoords, radiusKm]);

  const sortedMapTournaments = useMemo(() => {
    if (!sortByNearest || !userCoords) return mapVisibleTournaments;
    return [...mapVisibleTournaments].sort((a, b) => {
      const da = distanceFromUser(userCoords, a) ?? Infinity;
      const db = distanceFromUser(userCoords, b) ?? Infinity;
      return da - db;
    });
  }, [mapVisibleTournaments, sortByNearest, userCoords]);

  const hasFilters = surface !== ALL || category !== ALL || country !== ALL || playerFilter !== ALL || teamFilter !== ALL || statusFilter !== ALL || search !== "";
  const clearFilters = () => { setSearch(""); setSurface(ALL); setCategory(ALL); setCountry(ALL); setPlayerFilter(ALL); setTeamFilter(ALL); setStatusFilter(ALL); };

  const handleViewPlayerDetail = (player: ConnectedPlayer) => {
    setDetailPlayer(player);
    setPlayerDetailOpen(true);
  };

  const handleRefreshTournaments = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    await refetchTournaments();
    toast.success("Tournaments refreshed");
  };

  const handleAddToSchedule = (t: Tournament) => {
    if (!isPlayer || !user) return;
    if (myEntryFor(t.id)) return; // already scheduled
    addPT.mutate({ tournamentId: t.id, tournament: t, playerId: user.id, playerName: `${user.firstName} ${user.lastName}`, status: "registered" });
  };

  if (loadingT || loadingPT) return <LoadingState message="Loading tournaments…" />;
  if (errorT || errorPT) return <ErrorState message="Failed to load tournaments" onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-foreground">Tournaments</h1>{isObserver && <ReadOnlyBadge />}</div>
          <p className="text-muted-foreground">{isCoach ? "View tournaments and your connected players' participation." : isObserver ? "Read-only view of connected player tournaments." : "Browse upcoming tournaments and manage your entries."}</p>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
          <TabsList>
            {(showPlayerTournaments || isPlayer) && (
              <TabsTrigger value="players" className="gap-1.5"><Users className="h-3.5 w-3.5" /> {isPlayer ? "My Schedule" : "Player View"}</TabsTrigger>
            )}
            <TabsTrigger value="tournaments" className="gap-1.5"><Trophy className="h-3.5 w-3.5" /> {isPlayer ? "Add Tournaments" : "Browse All"}</TabsTrigger>
            <TabsTrigger value="map" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Map</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isObserver && <ReadOnlyBanner />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search by name, city, or country…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={surface} onValueChange={setSurface}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Surface" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All Surfaces</SelectItem>{surfaces.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All Categories</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={country} onValueChange={setCountry}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Country" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All Countries</SelectItem>{countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        {(showPlayerTournaments && viewMode === "players") && (
          <>
            {isCoach && <TeamFilterSelect teams={teams} value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setPlayerFilter(ALL); }} />}
            <PlayerFilterSelect players={filteredPlayers} value={playerFilter} onValueChange={setPlayerFilter} onViewDetail={isCoach ? handleViewPlayerDetail : undefined} />
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All Statuses</SelectItem>{STATUS_OPTIONS.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>))}</SelectContent></Select>
          </>
        )}
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground"><X className="mr-1 h-4 w-4" /> Reset</Button>}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefreshTournaments}
          disabled={isRefetchingTournaments}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetchingTournaments ? "animate-spin" : ""}`} />
          {isRefetchingTournaments ? "Refreshing…" : "Refresh tournaments"}
        </Button>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap gap-2">
          {search && <Badge variant="secondary" className="gap-1">Search: "{search}" <X className="h-3 w-3 cursor-pointer" onClick={() => setSearch("")} /></Badge>}
          {surface !== ALL && <Badge variant="secondary" className="gap-1">{surface} <X className="h-3 w-3 cursor-pointer" onClick={() => setSurface(ALL)} /></Badge>}
          {category !== ALL && <Badge variant="secondary" className="gap-1">{category} <X className="h-3 w-3 cursor-pointer" onClick={() => setCategory(ALL)} /></Badge>}
          {country !== ALL && <Badge variant="secondary" className="gap-1">{country} <X className="h-3 w-3 cursor-pointer" onClick={() => setCountry(ALL)} /></Badge>}
          {teamFilter !== ALL && <Badge variant="secondary" className="gap-1">{teams.find((t) => t.id === teamFilter)?.name ?? "Team"}<X className="h-3 w-3 cursor-pointer" onClick={() => setTeamFilter(ALL)} /></Badge>}
          {playerFilter !== ALL && <Badge variant="secondary" className="gap-1">{connectedPlayers.find((p) => p.id === playerFilter)?.firstName ?? "Player"}<X className="h-3 w-3 cursor-pointer" onClick={() => setPlayerFilter(ALL)} /></Badge>}
          {statusFilter !== ALL && <Badge variant="secondary" className="gap-1 capitalize">{statusFilter} <X className="h-3 w-3 cursor-pointer" onClick={() => setStatusFilter(ALL)} /></Badge>}
        </div>
      )}

      {/* Player tournament view */}
      {(showPlayerTournaments || isPlayer) && viewMode === "players" && (
        filteredPlayerTournaments.length === 0 ? (
          <EmptyState icon={<Trophy className="h-6 w-6 text-muted-foreground" />} title="No player tournaments" description={hasFilters ? "No results match your filters." : "No tournament entries yet."} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Tournament</th>
                  {!isPlayer && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Player</th>}
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Surface</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {filteredPlayerTournaments.map((pt) => (
                    <tr key={pt.id} className="transition-colors hover:bg-secondary/20">
                      <td className="px-4 py-3"><div><p className="font-medium text-foreground">{pt.tournament.name}</p>{pt.tournament.category && <p className="text-xs text-muted-foreground">{pt.tournament.category}</p>}</div></td>
                      {!isPlayer && <td className="px-4 py-3">
                        <button
                          className="flex items-center gap-2 hover:opacity-80"
                          onClick={() => {
                            const p = connectedPlayers.find((cp) => cp.id === pt.playerId);
                            if (p && isCoach) handleViewPlayerDetail(p);
                          }}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{(pt.playerName ?? "?")[0]}</div>
                          <span className="text-foreground">{pt.playerName ?? pt.playerId}</span>
                        </button>
                      </td>}
                      <td className="px-4 py-3 text-muted-foreground">{pt.tournament.city}, {pt.tournament.country}</td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(pt.tournament.startDate), "MMM d")} – {format(new Date(pt.tournament.endDate), "MMM d")}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={surfaceColor[pt.tournament.surface] ?? ""}>{pt.tournament.surface}</Badge></td>
                      <td className="px-4 py-3">
                        {isPlayer ? (
                          <div className="flex items-center gap-2">
                            <Select value={pt.status} onValueChange={(v) => updatePT.mutate({ id: pt.id, data: { status: v as TournamentStatus } })}>
                              <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{STATUS_OPTIONS.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>))}</SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Remove from schedule"
                              disabled={removePT.isPending}
                              onClick={() => removePT.mutate(pt.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <StatusBadge status={pt.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {viewMode === "tournaments" && (
        visibleBrowseTournaments.length === 0 ? (
          <EmptyState icon={<Trophy className="h-6 w-6 text-muted-foreground" />} title="No tournaments found" description="No tournaments match your filters." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBrowseTournaments.map((t) => {
              const distance = distanceFromUser(userCoords, t);
              return (
              <Card key={t.id} className="flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{t.name}</CardTitle>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="outline" className={surfaceColor[t.surface] ?? ""}>{t.surface}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        title="Hide from suggestions"
                        disabled={hideTournament.isPending}
                        onClick={() => hideTournament.mutate(t.id)}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{t.city}, {t.country}</div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-3.5 w-3.5" />{format(new Date(t.startDate), "MMM d")} – {format(new Date(t.endDate), "MMM d, yyyy")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.category && <Badge variant="secondary">{t.category}</Badge>}
                    {t.level && <Badge variant="secondary">{t.level}</Badge>}
                    <Badge variant="outline" className="capitalize">{t.indoorOutdoor === "indoor" ? <><Warehouse className="mr-1 h-3 w-3" />Indoor</> : <><Sun className="mr-1 h-3 w-3" />Outdoor</>}</Badge>
                    {t.altitude != null && t.altitude > 0 && <Badge variant="outline"><Mountain className="mr-1 h-3 w-3" />{t.altitude}m</Badge>}
                    {distance != null && <Badge variant="outline" className="border-primary/40 text-primary"><MapPin className="mr-1 h-3 w-3" />{formatDistanceKm(distance)} away</Badge>}
                  </div>
                  {isCoach && (() => {
                    const pts = playerTournaments.filter((pt) => pt.tournamentId === t.id && connectedIds.has(pt.playerId));
                    if (pts.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-border bg-secondary/30 p-2">
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Your Players</p>
                        <div className="space-y-1">{pts.map((pt) => (<div key={pt.id} className="flex items-center justify-between"><span className="text-xs text-foreground">{pt.playerName}</span><StatusBadge status={pt.status} /></div>))}</div>
                      </div>
                    );
                  })()}
                  {t.weatherSummary && <p className="text-xs text-muted-foreground">🌤 {t.weatherSummary}</p>}
                  {isPlayer && (() => {
                    const entry = myEntryFor(t.id);
                    return entry ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-destructive hover:text-destructive"
                        disabled={removePT.isPending}
                        onClick={() => removePT.mutate(entry.id)}
                      >
                        <Check className="h-3.5 w-3.5" /> In schedule — remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        disabled={addPT.isPending}
                        onClick={() => handleAddToSchedule(t)}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add to schedule
                      </Button>
                    );
                  })()}
                </CardContent>
              </Card>
              );
            })}
          </div>
        )
      )}

      {viewMode === "map" && (
        <div className="space-y-4">
          <div className="space-y-3 border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={requestLocation}
                disabled={geoStatus === "prompting"}
              >
                {geoStatus === "prompting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                {geoStatus === "prompting" ? "Locating…" : "Use my location"}
              </Button>

              <Select
                value=""
                onValueChange={(name) => {
                  const city = CITIES.find((c) => c.name === name);
                  if (city) setManualLocation({ lat: city.lat, lng: city.lng }, `${city.name}, ${city.country}`);
                }}
              >
                <SelectTrigger className="w-[190px]"><SelectValue placeholder="Or pick a city…" /></SelectTrigger>
                <SelectContent>
                  {CITIES.map((c) => (<SelectItem key={c.name} value={c.name}>{c.name}, {c.country}</SelectItem>))}
                </SelectContent>
              </Select>

              {userCoords && (
                <Badge variant="secondary" className="gap-1.5">
                  <MapPin className="h-3 w-3" /> {userCoords.label ?? "Your location"}
                  <X className="h-3 w-3 cursor-pointer" onClick={clearLocation} />
                </Badge>
              )}

              {geoStatus === "denied" && <p className="text-xs text-muted-foreground">Location access denied — pick a city instead.</p>}
              {geoStatus === "unsupported" && <p className="text-xs text-muted-foreground">Geolocation isn't available in this browser — pick a city instead.</p>}
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Label className="whitespace-nowrap text-xs text-muted-foreground">
                  Within {radiusKm >= MAX_RADIUS_KM ? "any distance" : `${radiusKm.toLocaleString()} km`}
                </Label>
                <Slider
                  className="w-[160px]"
                  min={100}
                  max={MAX_RADIUS_KM}
                  step={100}
                  value={[radiusKm]}
                  onValueChange={(v) => setRadiusKm(v[0])}
                  disabled={!userCoords}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch id="sort-nearest" checked={sortByNearest} onCheckedChange={setSortByNearest} disabled={!userCoords} />
                <Label htmlFor="sort-nearest" className="text-xs text-muted-foreground">Sort by nearest</Label>
              </div>

              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                Hidden ({hiddenIds.length}) — {showHidden ? "Hide" : "Show"}
              </Button>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Your location stays on your device.
            </p>
          </div>

          {!userCoords && (
            <div className="border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Set your location to see distances from you.
            </div>
          )}

          {sortedMapTournaments.length === 0 ? (
            <EmptyState icon={<MapPin className="h-6 w-6 text-muted-foreground" />} title="No tournaments found" description="No tournaments match your filters." />
          ) : (
            <div className="space-y-4">
              <TournamentMap
                tournaments={sortedMapTournaments}
                userCoords={userCoords}
                radiusKm={userCoords ? radiusKm : null}
                onAdd={handleAddToSchedule}
                onHide={(id) => hideTournament.mutate(id)}
                canAdd={isPlayer}
              />

              <div className="divide-y divide-border border border-border">
                {sortedMapTournaments.map((t) => {
                  const distance = distanceFromUser(userCoords, t);
                  const isHidden = hiddenIds.includes(t.id);
                  const entry = myEntryFor(t.id);
                  return (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-[220px] flex-1">
                        <p className="font-medium text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.city}, {t.country} · {format(new Date(t.startDate), "MMM d")} – {format(new Date(t.endDate), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={surfaceColor[t.surface] ?? ""}>{t.surface}</Badge>
                        {distance != null && <Badge variant="outline" className="border-primary/40 text-primary">{formatDistanceKm(distance)}</Badge>}
                        {isPlayer && (
                          entry ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-destructive hover:text-destructive"
                              disabled={removePT.isPending}
                              onClick={() => removePT.mutate(entry.id)}
                            >
                              <Check className="h-3.5 w-3.5" /> In schedule
                            </Button>
                          ) : (
                            <Button size="sm" className="gap-1" disabled={addPT.isPending} onClick={() => handleAddToSchedule(t)}>
                              <Plus className="h-3.5 w-3.5" /> Add
                            </Button>
                          )
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground"
                          disabled={hideTournament.isPending || unhideTournament.isPending}
                          onClick={() => (isHidden ? unhideTournament.mutate(t.id) : hideTournament.mutate(t.id))}
                        >
                          {isHidden ? <><Eye className="h-3.5 w-3.5" /> Unhide</> : <><EyeOff className="h-3.5 w-3.5" /> Hide</>}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <PlayerDetailDrawer player={detailPlayer} open={playerDetailOpen} onOpenChange={setPlayerDetailOpen} readOnly={isObserver} />
    </div>
  );
}
