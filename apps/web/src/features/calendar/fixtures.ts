/*
 * Preview fixtures for the calendar and attendance screens, drawn from Paper 8BX-0,
 * 7HO-0, 8M9-0 and C3W-0 (Kigali, "today" Mon 23 Nov 2026). Imported only by api.mock.ts
 * files, so none of this reaches a production bundle.
 */
import type { CalendarItem, CalendarTeam } from "@/features/calendar/api";
import { addDays, eachDay, weekdayIndex } from "@/features/calendar/dates";
import type { DateOnly } from "@/features/types";

export const FIXTURE_TEAMS: CalendarTeam[] = [
  {
    id: "team-u12",
    name: "U12",
    tone: "blue",
    coachName: "Sharika D.",
    studentCount: 16,
  },
  {
    id: "team-u14",
    name: "U14",
    tone: "orange",
    coachName: "Patrick Habimana",
    studentCount: 18,
  },
  {
    id: "team-u16",
    name: "U16",
    tone: "ink",
    coachName: "Patrick Habimana",
    studentCount: 15,
  },
  {
    id: "team-girls-u16",
    name: "Girls U16",
    tone: "green",
    coachName: null,
    studentCount: 14,
  },
];

/** Kigali is UTC+2 all year. */
const KIGALI_OFFSET_H = 2;

function instant(date: DateOnly, time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const utc = new Date(`${date}T00:00:00Z`);
  utc.setUTCHours(hours - KIGALI_OFFSET_H, minutes);
  return utc.toISOString();
}

function minus30(value: string): string {
  const HALF_HOUR_MS = 1_800_000;
  return new Date(Date.parse(value) - HALF_HOUR_MS).toISOString();
}

interface Series {
  collect: boolean;
  end: string;
  eventType: string;
  location: string;
  slug: string;
  start: string;
  teamId: string | null;
  title: string;
  /** 0 = Monday. */
  weekdays: number[];
}

const SERIES: Series[] = [
  {
    slug: "u12",
    teamId: "team-u12",
    title: "Training",
    eventType: "training",
    start: "16:00",
    end: "17:30",
    location: "Court 2",
    weekdays: [0, 2, 4],
    collect: true,
  },
  {
    slug: "u14",
    teamId: "team-u14",
    title: "Training",
    eventType: "training",
    start: "16:00",
    end: "17:30",
    location: "Main court",
    weekdays: [0, 2, 4],
    collect: true,
  },
  {
    slug: "u16",
    teamId: "team-u16",
    title: "Training",
    eventType: "training",
    start: "17:00",
    end: "18:30",
    location: "Main court",
    weekdays: [0, 2],
    collect: true,
  },
  {
    slug: "girls",
    teamId: "team-girls-u16",
    title: "Football",
    eventType: "training",
    start: "17:00",
    end: "18:30",
    location: "Pitch",
    weekdays: [1, 3],
    collect: true,
  },
];

/** Cancelled days: `${slug}:${date}` → reason (the server keeps reasons only in the audit log). */
export const CANCELLED: Record<string, string> = {
  "u12:2026-11-18": "rain",
};

const SERIES_FROM = "2026-11-02";
const SERIES_TO = "2026-11-30";

function item(
  id: string,
  base: Omit<
    CalendarItem,
    | "key"
    | "eventId"
    | "sessionDate"
    | "startsAt"
    | "endsAt"
    | "checkInOpensAt"
    | "cancelled"
    | "dayIndex"
    | "dayCount"
  >,
  date: DateOnly,
  extra: Partial<CalendarItem> = {}
): CalendarItem {
  const startsAt = base.startTime ? instant(date, base.startTime) : null;
  const cancelled = extra.cancelled ?? false;
  return {
    ...base,
    key: `${id}:${date}`,
    eventId: id,
    sessionDate: date,
    startsAt,
    endsAt: base.endTime ? instant(date, base.endTime) : null,
    checkInOpensAt:
      base.collectAttendance && startsAt && !cancelled
        ? minus30(startsAt)
        : null,
    cancelled,
    dayIndex: 1,
    dayCount: 1,
    ...extra,
  };
}

function seriesItems(): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const date of eachDay(SERIES_FROM, SERIES_TO)) {
    for (const series of SERIES) {
      if (!series.weekdays.includes(weekdayIndex(date))) {
        continue;
      }
      items.push(
        item(
          `event-${series.slug}-${date}`,
          {
            title: series.title,
            eventType: series.eventType,
            teamId: series.teamId,
            startTime: series.start,
            endTime: series.end,
            location: series.location,
            collectAttendance: series.collect,
          },
          date,
          { cancelled: `${series.slug}:${date}` in CANCELLED }
        )
      );
    }
  }
  return items;
}

function oneOff(
  id: string,
  date: DateOnly,
  title: string,
  teamId: string | null,
  eventType: string,
  collectAttendance: boolean,
  location: string
): CalendarItem {
  return item(
    id,
    {
      title,
      eventType,
      teamId,
      startTime: "10:00",
      endTime: "12:00",
      location,
      collectAttendance,
    },
    date
  );
}

const CAMP_START = "2026-12-01";
const CAMP_DAYS = 3;

function campItems(): CalendarItem[] {
  return Array.from({ length: CAMP_DAYS }, (_, index) =>
    item(
      "event-camp-dec",
      {
        title: "Camp",
        eventType: "camp",
        teamId: null,
        startTime: "09:00",
        endTime: "15:00",
        location: "Main court",
        collectAttendance: false,
      },
      addDays(CAMP_START, index),
      { dayIndex: index + 1, dayCount: CAMP_DAYS }
    )
  );
}

export const FIXTURE_ITEMS: CalendarItem[] = [
  ...seriesItems(),
  oneOff(
    "event-u14-match-1107",
    "2026-11-07",
    "U14 match",
    "team-u14",
    "match",
    true,
    "Amahoro Arena"
  ),
  oneOff(
    "event-girls-match-1114",
    "2026-11-14",
    "Girls match",
    "team-girls-u16",
    "match",
    true,
    "Pitch"
  ),
  oneOff(
    "event-u16-match-1121",
    "2026-11-21",
    "U16 match",
    "team-u16",
    "match",
    true,
    "Main court"
  ),
  oneOff(
    "event-open-day-1128",
    "2026-11-28",
    "Open day",
    null,
    "other",
    false,
    "Main court"
  ),
  ...campItems(),
].sort((a, b) =>
  `${a.sessionDate}${a.startTime ?? ""}`.localeCompare(
    `${b.sessionDate}${b.startTime ?? ""}`
  )
);
