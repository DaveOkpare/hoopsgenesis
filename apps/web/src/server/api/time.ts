/**
 * Pure date, session and distance helpers. No database, no clock unless you
 * pass `now`.
 *
 * Conventions: plain dates are `YYYY-MM-DD` strings, times of day are
 * `HH:MM` or `HH:MM:SS` strings, both local to the academy's IANA time zone
 * (`academy.timezone`). Instants are `Date`s (UTC).
 */

/**
 * Check-in/out is open from `minutesBeforeStart` before a session starts to
 * `minutesAfterEnd` after it ends. The one place to change both.
 */
export const SESSION_WINDOW = {
  minutesBeforeStart: 30,
  minutesAfterEnd: 60,
} as const;

/** Longest range `listSessionDates` walks, to bound work per request. */
export const MAX_SESSION_RANGE_DAYS = 366;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const EARTH_RADIUS_M = 6_371_008.8;
const DEGREES_TO_RADIANS = Math.PI / 180;
const ISO_DATE_LENGTH = 10;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
};

/** Is `timeZone` an IANA name this runtime knows (e.g. "Africa/Lagos")? */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
};

interface WallClock {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

const wallClockAt = (instant: Date, timeZone: string): WallClock => {
  const wall: WallClock = {
    year: 0,
    month: 0,
    day: 0,
    hour: 0,
    minute: 0,
    second: 0,
  };
  for (const part of getFormatter(timeZone).formatToParts(instant)) {
    if (Object.hasOwn(wall, part.type)) {
      wall[part.type as keyof WallClock] = Number(part.value);
    }
  }
  return wall;
};

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

/** The calendar date at `instant` in `timeZone`, as `YYYY-MM-DD`. */
export const dateInTimeZone = (instant: Date, timeZone: string): string => {
  const { year, month, day } = wallClockAt(instant, timeZone);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
};

/** Today's date in `timeZone` (the academy's "today"). */
export const todayInTimeZone = (timeZone: string, now = new Date()): string =>
  dateInTimeZone(now, timeZone);

/** `timeZone`'s offset from UTC at `instant`, in ms (Lagos: +3_600_000). */
const offsetAt = (instant: number, timeZone: string): number => {
  const wall = wallClockAt(new Date(instant), timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  );
  // formatToParts drops milliseconds; compare at whole seconds.
  return asUtc - Math.floor(instant / 1000) * 1000;
};

const parseDate = (date: string): [number, number, number] => {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new RangeError(`Expected YYYY-MM-DD, got "${date}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const parseTime = (time: string): [number, number, number] => {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    throw new RangeError(`Expected HH:MM or HH:MM:SS, got "${time}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
};

/**
 * The UTC instant of an academy-local date + time, e.g.
 * `zonedDateTimeToUtc("2026-11-23", "08:30", "Africa/Lagos")` is
 * 2026-11-23T07:30:00Z. A time skipped by a DST jump is read with the
 * pre-jump offset (New York 02:30 becomes 03:30 EDT); a time that occurs
 * twice resolves to its first occurrence.
 */
export const zonedDateTimeToUtc = (
  date: string,
  time: string,
  timeZone: string
): Date => {
  const [year, month, day] = parseDate(date);
  const [hour, minute, second] = parseTime(time);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Offsets a day either side; zones change offset at most once in that span.
  const offsetBefore = offsetAt(wallAsUtc - MS_PER_DAY, timeZone);
  const offsetAfter = offsetAt(wallAsUtc + MS_PER_DAY, timeZone);
  const matches = (instant: number): boolean =>
    instant + offsetAt(instant, timeZone) === wallAsUtc;
  const candidates = [wallAsUtc - offsetBefore, wallAsUtc - offsetAfter]
    .filter(matches)
    .sort((a, b) => a - b);
  // Earliest valid reading; in a DST gap the pre-jump offset lands just after it.
  return new Date(candidates[0] ?? wallAsUtc - offsetBefore);
};

/** `date` plus `days` (may be negative), as `YYYY-MM-DD`. */
export const addDays = (date: string, days: number): string => {
  const [year, month, day] = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, ISO_DATE_LENGTH);
};

/** Whole days from `from` to `to` (to - from). */
export const daysBetween = (from: string, to: string): number => {
  const [fy, fm, fd] = parseDate(from);
  const [ty, tm, td] = parseDate(to);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY
  );
};

/** An event's dates, as stored on calendar_event (see ./serialize.ts). */
export interface EventDates {
  /** null = a same-day event. */
  endDate: string | null;
  excludedDates: readonly string[];
  startDate: string;
}

/** Is `date` a session of the event: within its dates and not excluded? */
export const isSessionDate = (event: EventDates, date: string): boolean => {
  const lastDate = event.endDate ?? event.startDate;
  return (
    date >= event.startDate &&
    date <= lastDate &&
    !event.excludedDates.includes(date)
  );
};

/**
 * The event's session dates within `from`..`to` (both inclusive), in order.
 * Throws RangeError if the range is longer than MAX_SESSION_RANGE_DAYS;
 * validate ranges in the query schema first.
 */
export const listSessionDates = (
  event: EventDates,
  from: string,
  to: string
): string[] => {
  const lastDate = event.endDate ?? event.startDate;
  const first = from > event.startDate ? from : event.startDate;
  const last = to < lastDate ? to : lastDate;
  if (first > last) {
    return [];
  }
  if (daysBetween(first, last) > MAX_SESSION_RANGE_DAYS) {
    throw new RangeError(
      `Session range longer than ${MAX_SESSION_RANGE_DAYS} days`
    );
  }
  const excluded = new Set(event.excludedDates);
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (!excluded.has(date)) {
      dates.push(date);
    }
  }
  return dates;
};

export interface CheckInWindow {
  closesAt: Date;
  opensAt: Date;
}

/**
 * When check-in/out is accepted for one session: SESSION_WINDOW before the
 * local start time to SESSION_WINDOW after the local end time.
 */
export const getCheckInWindow = (session: {
  sessionDate: string;
  startTime: string;
  endTime: string;
  timeZone: string;
}): CheckInWindow => {
  const start = zonedDateTimeToUtc(
    session.sessionDate,
    session.startTime,
    session.timeZone
  );
  const end = zonedDateTimeToUtc(
    session.sessionDate,
    session.endTime,
    session.timeZone
  );
  return {
    opensAt: new Date(
      start.getTime() - SESSION_WINDOW.minutesBeforeStart * MS_PER_MINUTE
    ),
    closesAt: new Date(
      end.getTime() + SESSION_WINDOW.minutesAfterEnd * MS_PER_MINUTE
    ),
  };
};

/** Is `now` inside the window (both ends inclusive)? */
export const isWithinWindow = (window: CheckInWindow, now = new Date()) =>
  now.getTime() >= window.opensAt.getTime() &&
  now.getTime() <= window.closesAt.getTime();

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Great-circle (haversine) distance between two points, in metres. */
export const haversineDistanceM = (a: Coordinates, b: Coordinates): number => {
  const dLat = (b.latitude - a.latitude) * DEGREES_TO_RADIANS;
  const dLon = (b.longitude - a.longitude) * DEGREES_TO_RADIANS;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * DEGREES_TO_RADIANS) *
      Math.cos(b.latitude * DEGREES_TO_RADIANS) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * A `from`..`to` filter on a timestamp column, where `from` and `to` are
 * academy-local dates (both inclusive): `gte` is the start of `from`, `lt` the
 * start of the day after `to`, in `timeZone`. Either end may be missing.
 */
export const localDateRangeToUtc = (
  range: { from?: string; to?: string },
  timeZone: string
): { gte?: Date; lt?: Date } => ({
  ...(range.from
    ? { gte: zonedDateTimeToUtc(range.from, "00:00", timeZone) }
    : {}),
  ...(range.to
    ? { lt: zonedDateTimeToUtc(addDays(range.to, 1), "00:00", timeZone) }
    : {}),
});
