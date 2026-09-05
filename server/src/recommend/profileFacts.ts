// ============================================================================
// TennisAI — derive the handful of plain facts the engines read from a profile
//
// Pure. The raw PlayerProfile / User rows are wide and mostly free text; the
// engines want a few things: a normalised level, an age band, whether the
// player prefers comfort, whether pain or an injury is mentioned at all, and a
// couple of style numbers. Everything else on the profile is deliberately
// ignored.
//
// PAIN AND INJURY TEXT BECOMES A BOOLEAN HERE, NEVER A STRING. The text itself
// is not passed on, not quoted, not classified: it becomes `painMentioned:
// true`, which makes an engine emit exactly one caution recommending a
// qualified assessment, and `prefersComfort: true`, which nudges the strings
// engine towards softer setups. The engine never sees — and so can never
// name — the condition.
// ============================================================================

export type PlayerLevel = "beginner" | "intermediate" | "advanced" | "competitive";

/** Junior bands follow the usual tournament age categories; adult is 19+. */
export type AgeBand = "u12" | "u14" | "u16" | "u18" | "adult";

export interface ProfileFacts {
  level?: PlayerLevel;
  ageYears?: number;
  ageBand?: AgeBand;
  preferredSurface?: string;
  styleAggression?: number;
  suit?: { clay?: number; hard?: number; grass?: number; indoor?: number };
  prefersComfort: boolean;
  painMentioned: boolean;
}

/** The raw shapes the route hands in — a subset of the Prisma rows. */
export interface ProfileSource {
  user: { dateOfBirth: string | null } | null;
  profile: {
    dateOfBirth: string | null;
    playingLevel: string | null;
    preferredSurface: string | null;
    injuryRestrictions: string | null;
    physicalLimitations: string[];
    styleAggression: number | null;
    suitClay: number | null;
    suitHard: number | null;
    suitGrass: number | null;
    suitIndoor: number | null;
  } | null;
}

/**
 * `playingLevel` is free text from the onboarding picker ("Beginner",
 * "Intermediate", "Advanced", "Competitive / tournament") with a custom
 * option, so it is matched loosely. Anything unrecognised is `undefined` — an
 * unknown level lowers confidence; a mis-read one would silently mis-advise.
 */
export function normalisePlayingLevel(text: string | null | undefined): PlayerLevel | undefined {
  const s = text?.trim().toLowerCase();
  if (!s) return undefined;
  if (/begin|novice|starter/.test(s)) return "beginner";
  if (/intermed|club|recreat/.test(s)) return "intermediate";
  if (/compet|tourn|\bpro\b|professional|elite|national|ranked/.test(s)) return "competitive";
  if (/advanc/.test(s)) return "advanced";
  return undefined;
}

/** Whole years between an ISO date of birth and `now`. Undefined if unparseable. */
export function ageYearsAt(dobIso: string | null | undefined, nowIso: string): number | undefined {
  if (!dobIso) return undefined;
  const dob = new Date(dobIso);
  const now = new Date(nowIso);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(now.getTime())) return undefined;
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years >= 0 && years < 120 ? years : undefined;
}

export function ageBandFromYears(age: number): AgeBand {
  if (age < 12) return "u12";
  if (age < 14) return "u14";
  if (age < 16) return "u16";
  if (age < 19) return "u18";
  return "adult";
}

/**
 * Words that mean a physical concern is being described. Applied only to the
 * `physicalLimitations` list, where an entry can equally be "low stamina";
 * `injuryRestrictions` is about injuries by definition, so any text there
 * counts. Word-bounded so "backhand" does not match "back".
 */
const PAIN_PATTERN =
  /\b(pain\w*|injur\w*|hurt\w*|sore\w*|ache\w*|tendin\w*|elbow|shoulder|wrist|knee|ankle|strain\w*|sprain\w*|surgery|rehab\w*|inflam\w*|fracture\w*|tear|torn)\b/i;

export function mentionsPain(source: ProfileSource["profile"]): boolean {
  if (!source) return false;
  if (source.injuryRestrictions && source.injuryRestrictions.trim().length > 0) return true;
  return source.physicalLimitations.some((s) => PAIN_PATTERN.test(s));
}

export function deriveProfileFacts(source: ProfileSource, nowIso: string): ProfileFacts {
  const p = source.profile;
  // Two places hold a date of birth: the profile, and the account itself (the
  // minor check at signup runs before any profile exists). Either will do.
  const dob = p?.dateOfBirth ?? source.user?.dateOfBirth ?? null;
  const ageYears = ageYearsAt(dob, nowIso);
  const painMentioned = mentionsPain(p);

  const suit = p
    ? {
        clay: p.suitClay ?? undefined,
        hard: p.suitHard ?? undefined,
        grass: p.suitGrass ?? undefined,
        indoor: p.suitIndoor ?? undefined,
      }
    : undefined;

  return {
    level: normalisePlayingLevel(p?.playingLevel),
    ageYears,
    ageBand: ageYears === undefined ? undefined : ageBandFromYears(ageYears),
    preferredSurface: p?.preferredSurface ?? undefined,
    styleAggression: p?.styleAggression ?? undefined,
    suit: suit && Object.values(suit).some((v) => v !== undefined) ? suit : undefined,
    // Comfort is a preference the engine may act on; the pain flag only ever
    // produces the single caution. Both derive from the same text, once, here.
    prefersComfort: painMentioned,
    painMentioned,
  };
}
