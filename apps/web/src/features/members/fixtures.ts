/*
 * Members-screen fixtures that only this feature needs. Only api.ts imports this file.
 */

/**
 * Head counts from the Members design (1I2-0): "48 people · 4 teams",
 * "All 48 · Students 40 · Coaches 6 · Admins 1 · Invites 5". The shared fixtures hold a
 * slice of these people (the rows the designs show), so totals come from here, the way
 * the server would return a total alongside a page of rows.
 */
export const memberTotals = {
  people: 48,
  students: 40,
  coaches: 6,
  admins: 1,
  invites: 5,
} as const;
