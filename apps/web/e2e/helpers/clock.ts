/**
 * Wall-clock helpers for the academy's time zone, and coordinates near and
 * far from it. Independent of the product's own time code on purpose.
 */
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const LAST_MINUTE = MINUTES_PER_DAY - 1;
const MS_PER_DAY = 86_400_000;
/** Minutes before "now" that an open session starts. */
const OPEN_LEAD_MINUTES = 10;
/** Minutes after "now" that an open session ends. */
const OPEN_TAIL_MINUTES = 20;
const EARLY_CLOSED_END = 30;
const LATE_CLOSED_START = 23 * MINUTES_PER_HOUR;
const LATE_CLOSED_END = LATE_CLOSED_START + 30;
/** Past 03:00 local, a session ending 00:30 has closed (window +60 min). */
const SAFE_CLOSED_AFTER = 3 * MINUTES_PER_HOUR;

export interface LocalNow {
  /** YYYY-MM-DD in the zone. */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
}

export const localNow = (timeZone: string, now = new Date()): LocalNow => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * MINUTES_PER_HOUR + Number(get("minute")),
  };
};

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);

export const utcToday = (): string => new Date().toISOString().slice(0, 10);

const clampMinutes = (minutes: number): number =>
  Math.min(LAST_MINUTE, Math.max(0, minutes));

export const toTime = (minutes: number): string => {
  const clamped = clampMinutes(minutes);
  const hours = Math.floor(clamped / MINUTES_PER_HOUR);
  const mins = clamped % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

/** Start and end times today that put "now" inside the check-in window. */
export const openWindowTimes = (
  timeZone: string
): { startTime: string; endTime: string } => {
  const { minutes } = localNow(timeZone);
  let start = clampMinutes(minutes - OPEN_LEAD_MINUTES);
  let end = clampMinutes(minutes + OPEN_TAIL_MINUTES);
  if (end <= start) {
    end = LAST_MINUTE;
    start = LAST_MINUTE - OPEN_TAIL_MINUTES;
  }
  return { startTime: toTime(start), endTime: toTime(end) };
};

/** Start and end times today whose check-in window does not contain "now". */
export const closedWindowTimes = (
  timeZone: string
): { startTime: string; endTime: string; closed: "before" | "after" } => {
  const { minutes } = localNow(timeZone);
  if (minutes >= SAFE_CLOSED_AFTER) {
    return {
      startTime: "00:00",
      endTime: toTime(EARLY_CLOSED_END),
      closed: "after",
    };
  }
  return {
    startTime: toTime(LATE_CLOSED_START),
    endTime: toTime(LATE_CLOSED_END),
    closed: "before",
  };
};

/** Academy coordinates used by every seeded academy. */
export const ACADEMY_LOCATION = { latitude: 6.5244, longitude: 3.3792 };

/** About 33 m north of the academy. */
export const NEAR = {
  latitude: ACADEMY_LOCATION.latitude + 0.0003,
  longitude: ACADEMY_LOCATION.longitude,
};

/** About 1.1 km north of the academy. */
export const FAR = {
  latitude: ACADEMY_LOCATION.latitude + 0.01,
  longitude: ACADEMY_LOCATION.longitude,
};
