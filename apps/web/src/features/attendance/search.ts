/*
 * URL state for /admin/attendance and /coach/attendance:
 *   ?period=week|month       Week or month (admin default week, coach default month)
 *   ?at=2026-11-16           Any day in the period shown
 *   ?team=<teamId>           Admin: one team. Coach: the team tab.
 *   ?page=2&size=50          "Missed the most" / "Sessions" table page
 */

import type { PeriodKind } from "@/features/attendance/periods";
import { isDateOnly } from "@/features/calendar/dates";
import type { DateOnly } from "@/features/types";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface AttendanceSearch {
  at?: DateOnly;
  page?: number;
  period?: PeriodKind;
  size?: PageSize;
  team?: string;
}

const MAX_ID_LENGTH = 200;

export function parseAttendanceSearch(
  raw: Record<string, unknown>
): AttendanceSearch {
  const page = Number(raw.page);
  const size = Number(raw.size);
  return {
    period:
      raw.period === "week" || raw.period === "month" ? raw.period : undefined,
    at: isDateOnly(raw.at) ? raw.at : undefined,
    team:
      typeof raw.team === "string" &&
      raw.team.length > 0 &&
      raw.team.length <= MAX_ID_LENGTH
        ? raw.team
        : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    size: PAGE_SIZES.find((value) => value === size),
  };
}
