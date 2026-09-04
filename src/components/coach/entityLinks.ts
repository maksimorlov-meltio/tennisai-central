// ============================================================
// Where a coach lands when they pick an action for ONE player or team.
//
// The menus (EntityActionsMenu) only build links; the pages on the other end
// read `?player=` / `?team=` on mount and preset the filters they already
// have — see the deep-link effects in TrainingsPage, CalendarPage and
// TeamsPage. Keeping the param names here means a rename touches one file.
// ============================================================

export function playerScheduleHref(playerId: string): string {
  return `/trainings?player=${encodeURIComponent(playerId)}`;
}

export function playerCalendarHref(playerId: string): string {
  return `/calendar?player=${encodeURIComponent(playerId)}`;
}

export function teamScheduleHref(teamId: string): string {
  return `/trainings?team=${encodeURIComponent(teamId)}`;
}

export function teamCalendarHref(teamId: string): string {
  return `/calendar?team=${encodeURIComponent(teamId)}`;
}

export function teamManageHref(teamId: string): string {
  return `/teams?team=${encodeURIComponent(teamId)}`;
}

/**
 * Reads the entity params off a page's search params. An empty value counts as
 * absent, so `?player=` does not scope the page to a player called "".
 */
export function readEntityParams(params: URLSearchParams): { playerId: string | null; teamId: string | null } {
  return {
    playerId: params.get("player") || null,
    teamId: params.get("team") || null,
  };
}
