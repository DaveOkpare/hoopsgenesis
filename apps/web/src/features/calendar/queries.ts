/*
 * Query layer for the calendar (and the attendance screens, which reuse the teams and
 * sessions). Keys sit under ["academies", id, "events"] so creating an event or
 * cancelling a day (features/events, features/sessions) refreshes them.
 */
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  type CalendarRange,
  listCalendarItems,
  listCalendarTeams,
} from "@/features/calendar/api";
import type { Id } from "@/features/types";

export type {
  CalendarItem,
  CalendarRange,
  CalendarTeam,
} from "@/features/calendar/api";

export const calendarKeys = {
  items: (academyId: Id, range: CalendarRange) =>
    ["academies", academyId, "events", "calendar", range] as const,
  teams: (academyId: Id) =>
    ["academies", academyId, "teams", "calendar-teams"] as const,
};

export function calendarItemsQueryOptions(academyId: Id, range: CalendarRange) {
  return queryOptions({
    queryKey: calendarKeys.items(academyId, range),
    queryFn: () => listCalendarItems(academyId, range),
    placeholderData: keepPreviousData,
  });
}

export function calendarTeamsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: calendarKeys.teams(academyId),
    queryFn: () => listCalendarTeams(academyId),
    staleTime: 60_000,
  });
}
