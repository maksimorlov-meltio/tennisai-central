// Maps a raw tournament record (from the AWS REST API) to a TournamentFederation.
// The upstream feed aggregates events from multiple sanctioning bodies and may
// expose the federation under different keys (`federation`, `tour`, `sanction`,
// `circuit`, `organization`). When absent, we infer it from category / name.
import type { Tournament, TournamentFederation } from "@/types";

const VALID: readonly TournamentFederation[] = ["ITF", "WTA", "ATP", "UTR", "USTA"];

function normalize(value: unknown): TournamentFederation | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toUpperCase();
  if ((VALID as readonly string[]).includes(v)) return v as TournamentFederation;
  if (v === "WTF") return "WTA"; // common typo upstream
  return undefined;
}

export function inferFederation(raw: Partial<Tournament> & Record<string, unknown>): TournamentFederation {
  const direct =
    normalize(raw.federation) ??
    normalize(raw.tour) ??
    normalize(raw.sanction) ??
    normalize(raw.circuit) ??
    normalize(raw.organization);
  if (direct) return direct;

  const haystack = `${raw.category ?? ""} ${raw.name ?? ""} ${raw.level ?? ""}`.toUpperCase();
  if (/\bATP\b|\bMASTERS\b/.test(haystack)) return "ATP";
  if (/\bWTA\b/.test(haystack)) return "WTA";
  if (/\bUSTA\b|\bUS OPEN\b/.test(haystack)) return "USTA";
  if (/\bUTR\b/.test(haystack)) return "UTR";
  if (/\bITF\b|\bFUTURES\b|\bJUNIOR\b|\bWORLD TENNIS TOUR\b/.test(haystack)) return "ITF";
  return "ITF";
}

export function mapTournament(raw: Record<string, unknown>): Tournament {
  const t = raw as Partial<Tournament> & Record<string, unknown>;
  return {
    id: String(t.id ?? raw.tournamentId ?? raw._id ?? crypto.randomUUID()),
    name: String(t.name ?? raw.title ?? "Untitled tournament"),
    city: String(t.city ?? raw.location ?? ""),
    country: String(t.country ?? ""),
    surface: String(t.surface ?? "Hard"),
    indoorOutdoor: (t.indoorOutdoor as Tournament["indoorOutdoor"]) ?? "outdoor",
    altitude: typeof t.altitude === "number" ? t.altitude : undefined,
    ballBrand: t.ballBrand as string | undefined,
    weatherSummary: t.weatherSummary as string | undefined,
    category: t.category as string | undefined,
    level: t.level as string | undefined,
    startDate: String(t.startDate ?? raw.start ?? raw.startsAt ?? ""),
    endDate: String(t.endDate ?? raw.end ?? raw.endsAt ?? t.startDate ?? ""),
    description: t.description as string | undefined,
    federation: inferFederation(t),
    latitude: typeof t.latitude === "number" ? t.latitude : null,
    longitude: typeof t.longitude === "number" ? t.longitude : null,
  };
}

export function mapTournaments(payload: unknown): Tournament[] {
  // Accept either a bare array or a `{ data: [...] }` envelope.
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];
  return arr.map((r) => mapTournament(r as Record<string, unknown>));
}