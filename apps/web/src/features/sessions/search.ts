/* Search params shared by the admin and coach session routes. */
import { parseAtParam } from "@/features/sessions/clock";

import type { SessionSheet } from "./components/session-screen";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUERY = 80;

export interface SessionSearch {
  /** Preview clock, "HH:mm" (dev preview only). */
  at?: string;
  /** Session day (YYYY-MM-DD); defaults to today or the event's first day. */
  date?: string;
  /** "Find a student" on the web live view. */
  q?: string;
  /** Deep-linkable sheets: ?sheet=check-in|change&student=<id>, ?sheet=cancel. */
  sheet?: SessionSheet;
  student?: string;
}

export function validateSessionSearch(
  search: Record<string, unknown>
): SessionSearch {
  const { date, q, sheet, student } = search;
  return {
    at: parseAtParam(search.at),
    date: typeof date === "string" && PLAIN_DATE.test(date) ? date : undefined,
    q: typeof q === "string" && q ? q.slice(0, MAX_QUERY) : undefined,
    sheet:
      sheet === "check-in" || sheet === "cancel" || sheet === "change"
        ? sheet
        : undefined,
    student: typeof student === "string" ? student : undefined,
  };
}
