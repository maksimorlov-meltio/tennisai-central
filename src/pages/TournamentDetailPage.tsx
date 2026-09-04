// One tournament, and the decision a coach makes about it.
//
// This was a stub reading "Tournament detail view coming soon", so every
// tournament on the calendar led nowhere. What belongs here is the decision:
// how long is left to enter, who from the squad is already going, and whether
// it clashes with anything they have.

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CalendarPlus, ExternalLink, MapPin, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState } from "@/components/ui/shared";
import { AddToCalendarDialog } from "@/components/tournaments/AddToCalendarDialog";
import { useAuth } from "@/auth/AuthContext";
import { useTournaments, usePlayerTournaments } from "@/hooks/api/queries";
import { timeLeft } from "@/lib/tournamentPlanning";

/** One labelled fact. Renders nothing when the feed did not publish it —
 *  an empty row is worse than an absent one. */
function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "" || value === "Unknown") return null;
  return (
    <div className="border-b border-border py-2.5 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm capitalize text-foreground">{value}</dd>
    </div>
  );
}

export default function TournamentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: tournaments = [], isLoading, error } = useTournaments();
  const { data: entries = [] } = usePlayerTournaments();
  const [addOpen, setAddOpen] = useState(false);

  const tournament = useMemo(() => tournaments.find((t) => t.id === id), [tournaments, id]);

  // Everyone the viewer may see who is already going: a coach's squad, or the
  // player themselves.
  const going = useMemo(
    () => entries.filter((e) => e.tournamentId === id && e.status !== "withdrawn"),
    [entries, id],
  );

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message="Could not load this tournament." />;

  if (!tournament) {
    return (
      <div className="space-y-4">
        <Link
          to="/tournaments"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All tournaments
        </Link>
        <ErrorState message="That tournament is not in the calendar. It may have finished, or the organiser may have withdrawn it." />
      </div>
    );
  }

  const left = timeLeft(tournament);
  const isCoach = user?.role === "coach";
  const canAdd = isCoach || user?.role === "player";

  return (
    <div className="space-y-6">
      <Link
        to="/tournaments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All tournaments
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {tournament.federation && <Badge variant="secondary">{tournament.federation}</Badge>}
            {tournament.category && <Badge variant="outline">{tournament.category}</Badge>}
          </div>
          <h1 className="text-2xl font-bold text-foreground">{tournament.name}</h1>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {tournament.city}, {tournament.country}
          </p>
        </div>

        {canAdd && (
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            {isCoach ? "Add a player" : "Add to my calendar"}
          </Button>
        )}
      </div>

      {/* The countdown gets the weight it deserves: it is the one thing on this
          page that expires. */}
      <div
        className={`rounded-xl border p-4 ${
          left.tone === "urgent" ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
        }`}
      >
        <p
          className={`text-lg font-semibold ${
            left.tone === "urgent" ? "text-destructive" : "text-foreground"
          }`}
        >
          {left.label}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {format(parseISO(tournament.startDate), "EEEE d MMMM")} –{" "}
          {format(parseISO(tournament.endDate), "EEEE d MMMM yyyy")}
          {tournament.entryDeadline && (
            <span>· entries close {format(parseISO(tournament.entryDeadline), "d MMM")}</span>
          )}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h2 className="mb-2 font-semibold text-foreground">Details</h2>
          <dl>
            <Fact label="Surface" value={tournament.surface} />
            <Fact label="Indoor / outdoor" value={tournament.indoorOutdoor} />
            <Fact label="Level" value={tournament.level} />
            <Fact label="Age category" value={tournament.ageCategory} />
            <Fact
              label="Rating band"
              value={
                tournament.utrRangeMin !== undefined && tournament.utrRangeMax !== undefined
                  ? `UTR ${tournament.utrRangeMin} – ${tournament.utrRangeMax}`
                  : undefined
              }
            />
            <Fact label="Entries so far" value={tournament.registeredCount} />
            <Fact label="Venue" value={tournament.venue} />
          </dl>

          {tournament.website && (
            <a
              href={tournament.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Organiser's page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {tournament.source && (
            // Where the row came from, so a coach can check it against the
            // source rather than trust us. A feed can be wrong.
            <p className="mt-3 text-xs text-muted-foreground">
              Listed from {tournament.source.replace(/-/g, " ")}.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <Users className="h-4 w-4" /> Going
          </h2>
          {going.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isCoach ? "Nobody from your squad yet." : "You are not entered for this one."}
            </p>
          ) : (
            <ul className="space-y-2">
              {going.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground">{e.playerName ?? "Player"}</span>
                  <Badge variant="outline" className="capitalize">
                    {e.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {tournament.latitude != null && tournament.longitude != null && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${tournament.latitude}&mlon=${tournament.longitude}#map=11/${tournament.latitude}/${tournament.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <MapPin className="h-3.5 w-3.5" /> See where it is
            </a>
          )}
        </div>
      </div>

      <AddToCalendarDialog tournament={tournament} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
