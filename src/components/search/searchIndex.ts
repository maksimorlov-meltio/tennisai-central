// ============================================================
// TennisAI — Command palette search index
// ============================================================
//
// All of the palette's thinking, with no React in it: which destinations a
// role may be offered, how a query is matched and ranked, and how the hits are
// grouped. Kept separate from the component so the rules that matter — above
// all "a player is never offered a coach route" — can be tested directly
// instead of through a rendered dialog.

import type { UserRole, ConnectedPlayer, Tournament } from "@/types";
import { searchableDestinations, roleCanAccess } from "./navRegistry";
import { t } from "@/lib/i18n";

export type SearchResultType = "navigation" | "player" | "tournament";

export interface SearchResult {
  /** Stable identity for cmdk's selection state. Unique across all groups. */
  id: string;
  type: SearchResultType;
  /** What the row reads as, and the primary thing the query is matched against. */
  label: string;
  /** Secondary line — a city, a player id. Also searched, at a lower weight. */
  subtitle?: string;
  /** Where selecting the row goes. */
  to: string;
  /** Extra text worth matching that isn't shown (route path, country, …). */
  keywords: string[];
  /** Higher is a better match. 0 for a browse-mode listing with no query. */
  score: number;
}

export interface SearchGroup {
  type: SearchResultType;
  heading: string;
  results: SearchResult[];
}

/** Fixed presentation order. Destinations first: they're the reason to open it. */
const GROUP_ORDER: SearchResultType[] = ["navigation", "player", "tournament"];

const GROUP_HEADINGS: Record<SearchResultType, string> = {
  navigation: "Go to",
  player: "Players",
  tournament: "Tournaments",
};

/** Keeps one long group from burying the ones under it. */
const MAX_PER_GROUP = 8;

/**
 * Lowercase, and strip the accents off. "Sofía" has to be findable by typing
 * "sofia" on a keyboard that can't produce the í — half the player names in a
 * European tennis roster carry a diacritic.
 */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Query → whitespace-separated tokens, all of which must match (AND). */
export function tokenize(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/**
 * How well one token matches one field.
 *
 * The tiers are ordered so that a more *specific* kind of match always beats a
 * vaguer one: typing "team" should put "Teams" above "Team training request",
 * and an exact "stats" above "Player stats".
 */
function fieldScore(field: string, token: string): number {
  if (!field) return 0;
  const haystack = normalize(field);
  if (!haystack) return 0;
  if (haystack === token) return 100;
  if (haystack.startsWith(token)) return 70;
  // Start of any later word — "requests" finds "Training requests".
  if (new RegExp(`\\b${escapeRegExp(token)}`).test(haystack)) return 55;
  if (haystack.includes(token)) return 40;
  return 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Score a candidate against the whole query.
 *
 * Every token must hit something somewhere, or the row is not a result — that
 * AND semantics is what makes "madrid junior" narrow rather than widen. The
 * label is worth full weight; the subtitle and hidden keywords are worth a
 * fraction, so a city match can rank a tournament but never outrank the
 * tournament actually named for it.
 */
export function scoreResult(
  candidate: Pick<SearchResult, "label" | "subtitle" | "keywords">,
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const token of tokens) {
    const secondary = [candidate.subtitle ?? "", ...candidate.keywords];
    const best = Math.max(
      fieldScore(candidate.label, token),
      ...secondary.map((field) => fieldScore(field, token) * 0.3),
    );
    if (best <= 0) return 0;
    total += best;
  }
  return total;
}

/** The destinations `role` is allowed to reach, as unscored candidates. */
export function destinationsForRole(role: UserRole): SearchResult[] {
  return searchableDestinations
    .filter((item) => item.roles.includes(role))
    .map((item) => ({
      id: `nav:${item.to}`,
      type: "navigation" as const,
      label: t(item.labelKey),
      to: item.to,
      // The path itself is searchable, so "/teams" or "admin" find their pages.
      keywords: item.to.split("/").filter(Boolean),
      score: 0,
    }));
}

function playerCandidates(players: ConnectedPlayer[]): SearchResult[] {
  return players.map((player) => {
    const label = `${player.firstName} ${player.lastName}`.trim();
    return {
      id: `player:${player.id}`,
      type: "player" as const,
      label,
      subtitle: player.playerPublicId || undefined,
      // Deep link the Players page already supports: it opens that player's
      // stats drawer on arrival.
      to: `/players?player=${encodeURIComponent(player.id)}`,
      keywords: [player.firstName, player.lastName, player.playerPublicId ?? ""].filter(Boolean),
      score: 0,
    };
  });
}

function tournamentCandidates(tournaments: Tournament[]): SearchResult[] {
  return tournaments.map((tournament) => ({
    id: `tournament:${tournament.id}`,
    type: "tournament" as const,
    label: tournament.name,
    subtitle: [tournament.city, tournament.country].filter(Boolean).join(", ") || undefined,
    to: `/tournaments/${tournament.id}`,
    keywords: [
      tournament.city,
      tournament.country,
      tournament.federation ?? "",
      tournament.category ?? "",
      tournament.surface ?? "",
    ].filter(Boolean),
    score: 0,
  }));
}

function rank(candidates: SearchResult[], tokens: string[]): SearchResult[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreResult(candidate, tokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, MAX_PER_GROUP);
}

export interface BuildSearchArgs {
  role: UserRole;
  query: string;
  /** Connected players from the connection store. Ignored for roles without /players. */
  players?: ConnectedPlayer[];
  tournaments?: Tournament[];
}

/**
 * The whole palette, in one function.
 *
 * Role is applied to entities as well as routes, and from the same array the
 * sidebar renders: a player has no /players page to land on, so a player never
 * searches players. Groups that would be empty are dropped rather than
 * rendered as a heading over nothing.
 */
export function buildSearchResults({
  role,
  query,
  players = [],
  tournaments = [],
}: BuildSearchArgs): SearchGroup[] {
  const tokens = tokenize(query);
  const destinations = destinationsForRole(role);

  // Nothing typed yet: offer the destinations as a menu rather than an empty
  // box. Entities are not listed — an unfiltered roster is noise, not an answer.
  if (tokens.length === 0) {
    return destinations.length
      ? [{ type: "navigation", heading: GROUP_HEADINGS.navigation, results: destinations }]
      : [];
  }

  const byType: Record<SearchResultType, SearchResult[]> = {
    navigation: rank(destinations, tokens),
    player: roleCanAccess(role, "/players") ? rank(playerCandidates(players), tokens) : [],
    tournament: roleCanAccess(role, "/tournaments") ? rank(tournamentCandidates(tournaments), tokens) : [],
  };

  return GROUP_ORDER.filter((type) => byType[type].length > 0).map((type) => ({
    type,
    heading: GROUP_HEADINGS[type],
    results: byType[type],
  }));
}

/** Total hits across every group — used to decide the empty state. */
export function countResults(groups: SearchGroup[]): number {
  return groups.reduce((sum, group) => sum + group.results.length, 0);
}
