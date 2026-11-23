/*
 * Fixtures only the Teams list needs (Paper 72W-0). Rosters, coaches and sports come from
 * features/team-detail/fixtures.ts so the list and the team page agree.
 * Only api.ts files import this module.
 */
import type { Id } from "@/features/types";

/** Attendance this month per team, as on the Teams cards (GET /teams/:teamId/attendance-summary). */
export const teamAttendancePercent: Record<Id, number> = {
  "team-u12": 88,
  "team-u14": 86,
  "team-u16": 81,
  "team-girls-u16": 79,
};
