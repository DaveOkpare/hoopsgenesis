/*
 * URL state for /admin/calendar and /coach/calendar, so every view can be linked to:
 *   ?view=agenda                       Agenda instead of the month grid
 *   ?month=2026-12                     The month shown (default: the selected day's)
 *   ?day=2026-11-25                    Selected day (default: today)
 *   ?team=team-u14 | ?team=academy     One team, or academy-wide events only
 *   ?type=match                        One event type
 *   ?cancel=<eventId>:<date>           "Cancel this day" dialog (coach)
 */
import {
  isDateOnly,
  isMonthKey,
  type MonthKey,
} from "@/features/calendar/dates";
import type { DateOnly } from "@/features/types";

export type CalendarView = "month" | "agenda";

/** `team` value for events without a team. */
export const ACADEMY_WIDE = "academy";

export interface CalendarSearch {
  cancel?: string;
  day?: DateOnly;
  month?: MonthKey;
  team?: string;
  type?: string;
  view?: CalendarView;
}

const MAX_PARAM_LENGTH = 200;

function text(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PARAM_LENGTH
    ? value
    : undefined;
}

export function parseCalendarSearch(
  raw: Record<string, unknown>
): CalendarSearch {
  return {
    view: raw.view === "agenda" || raw.view === "month" ? raw.view : undefined,
    month: isMonthKey(raw.month) ? raw.month : undefined,
    day: isDateOnly(raw.day) ? raw.day : undefined,
    team: text(raw.team),
    type: text(raw.type),
    cancel: text(raw.cancel),
  };
}
