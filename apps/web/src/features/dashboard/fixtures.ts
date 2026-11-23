/*
 * Dashboard-only fixtures (numbers from "[Admin] Dashboard" YA-0 and "[Admin · Mobile]
 * Home" 5TY-0). Only dashboard/api.ts imports this file.
 */

/** Attendance this week and the four weeks before it, oldest first (bars in the tile). */
export const weeklyAttendancePercent = [56, 69, 47, 82, 86] as const;

/** "14 students for November", "RWF 420,000" (the shared fixtures hold the first four rows). */
export const outstandingSummary = {
  studentCount: 14,
  total: { amount: "420000.00", currency: "RWF" },
  periodStart: "2026-11-01",
  topTeam: { teamId: "team-u14", count: 6 },
} as const;

/** "5 records waiting for review", oldest is Aline's report card. */
export const pendingRecordsSummary = {
  count: 5,
  oldestRecordId: "record-aline-report",
} as const;

/** "U16 training on Sat 21 Nov isn't closed · 4 students never checked in". */
export const unclosedSession = {
  eventId: "event-u16-training-sat",
  teamId: "team-u16",
  title: "Training",
  sessionDate: "2026-11-21",
  missingCheckIns: 4,
} as const;

/** "3 invites have expired · 1 coach, 2 students". */
export const expiredInvitesSummary = { coaches: 1, students: 2 } as const;

/** Per-session numbers for today's events (roster size, live check-ins). */
export const sessionStats: Record<
  string,
  { live?: boolean; checkedIn?: number; rosterSize: number }
> = {
  "event-u12-morning": { live: true, checkedIn: 11, rosterSize: 16 },
  "event-u14-training": { rosterSize: 18 },
  "event-girls-u16-football": { rosterSize: 14 },
  "event-u16-shooting": { rosterSize: 12 },
};
