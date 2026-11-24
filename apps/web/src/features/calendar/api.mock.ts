/* Fixture twin of ./api.ts for dev preview (see lib/preview.ts). */
import type {
  CalendarItem,
  CalendarRange,
  CalendarTeam,
} from "@/features/calendar/api";
import { FIXTURE_ITEMS, FIXTURE_TEAMS } from "@/features/calendar/fixtures";
import { fixtureDelay } from "@/features/fixtures";
import type { Id } from "@/features/types";
import { previewPersonaFor } from "@/lib/preview";

/** The preview coach (Sharika as coach) is on U12, U14 and U16. */
const COACH_TEAM_IDS = new Set(["team-u12", "team-u14", "team-u16"]);

function visibleTeamIds(): Set<Id> | null {
  const persona = previewPersonaFor(window.location.pathname, {});
  return persona === "coach" ? COACH_TEAM_IDS : null;
}

export async function listCalendarItems(
  _academyId: Id,
  range: CalendarRange
): Promise<CalendarItem[]> {
  await fixtureDelay();
  const teams = visibleTeamIds();
  return FIXTURE_ITEMS.filter(
    (item) =>
      item.sessionDate >= range.from &&
      item.sessionDate <= range.to &&
      (item.teamId === null || !teams || teams.has(item.teamId))
  );
}

export async function listCalendarTeams(
  _academyId: Id
): Promise<CalendarTeam[]> {
  await fixtureDelay();
  const teams = visibleTeamIds();
  return FIXTURE_TEAMS.filter((team) => !teams || teams.has(team.id));
}
