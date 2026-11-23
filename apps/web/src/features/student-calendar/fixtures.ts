/*
 * Aline's (U14) calendar, as in "[Student] Calendar" (49N-0) and "My attendance" (46Z-0):
 * U14 trains Monday and Wednesday 16:00–17:30 on Court 2 and Saturday mornings on Court 1.
 * Today's training, Wednesday's training and Saturday's match come from the shared
 * fixtures; earlier sessions, the cancelled 30 Nov session and the holiday camp are added
 * here. Only student-calendar/api.ts and student-attendance/fixtures.ts import this file.
 */
import { events } from "@/features/fixtures";
import {
  addDays,
  eachDay,
  weekdayIndex,
} from "@/features/student-calendar/dates";
import type { CalendarEvent, DateOnly } from "@/features/types";

export const STUDENT_TEAM_ID = "team-u14";

/** First day of Aline's sessions (she joined on 4 Sep). */
const SEASON_START = "2026-09-05";
/** Last generated session; 23, 25 and 28 Nov are the shared fixtures. */
const GENERATED_UNTIL = "2026-11-21";

const MONDAY = 0;
const WEDNESDAY = 2;
const SATURDAY = 5;

const CREATED = "2026-08-20T08:00:00Z";

function teamEvent(
  date: DateOnly,
  overrides: Partial<CalendarEvent> = {}
): CalendarEvent {
  return {
    id: `event-u14-${date}`,
    academyId: "acad-kigali",
    teamId: STUDENT_TEAM_ID,
    eventType: "training",
    title: "Training",
    description: null,
    location: "Court 2",
    startDate: date,
    endDate: null,
    startTime: "16:00",
    endTime: "17:30",
    excludedDates: [],
    collectAttendance: true,
    createdBy: "user-patrick",
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

function generatedSessions(): CalendarEvent[] {
  return eachDay(SEASON_START, GENERATED_UNTIL).flatMap((date) => {
    const weekday = weekdayIndex(date);
    if (weekday === MONDAY || weekday === WEDNESDAY) {
      return [teamEvent(date)];
    }
    if (weekday === SATURDAY) {
      return [
        teamEvent(date, {
          title: "Weekend training",
          location: "Court 1",
          startTime: "09:00",
          endTime: "11:00",
        }),
      ];
    }
    return [];
  });
}

/** The reason a coach gave when cancelling (CO-6). Not stored on the event yet. */
export const cancelReasons: Record<string, string> = {
  "event-u14-2026-11-30": "court maintenance",
};

const sharedTeamEvents = events.filter((e) => e.teamId === STUDENT_TEAM_ID);

export const studentCalendarEvents: CalendarEvent[] = [
  ...generatedSessions(),
  ...sharedTeamEvents,
  teamEvent("2026-11-30", {
    excludedDates: ["2026-11-30"],
    updatedAt: "2026-11-20T09:00:00Z",
  }),
  {
    ...teamEvent("2026-12-05", {
      id: "event-kigali-holiday-camp",
      teamId: null,
      eventType: "camp",
      title: "Kigali holiday camp",
      location: "Court 1",
      endDate: addDays("2026-12-05", 2),
      startTime: "09:00",
      endTime: "15:00",
      collectAttendance: false,
      createdBy: "user-sharika",
    }),
  },
];

/** Coach shown on team sessions ("Coach Patrick"). */
export const TEAM_COACH_ID = "user-patrick";
