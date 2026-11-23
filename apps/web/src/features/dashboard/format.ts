/* Date helpers for the dashboard. Dates are read in the academy's time zone. */

const MS_PER_DAY = 86_400_000;
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(PLAIN_DATE.test(value) ? `${value}T12:00:00Z` : value);
}

/** "2026-11-23" for the given moment in the academy's time zone. */
export function plainDateIn(value: Date | string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(value));
}

/** Whole calendar days from `from` to `to` in the academy's time zone. */
export function calendarDaysBetween(
  from: Date | string,
  to: Date | string,
  timeZone?: string
): number {
  const start = Date.parse(`${plainDateIn(from, timeZone)}T00:00:00Z`);
  const end = Date.parse(`${plainDateIn(to, timeZone)}T00:00:00Z`);
  return Math.round((end - start) / MS_PER_DAY);
}

/** "6 Sep" (three-letter months, as in the designs; en-GB would say "Sept"). */
export function dayShortMonth(value: Date | string, timeZone?: string): string {
  const date = toDate(value);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
  }).format(date);
  return `${day} ${month}`;
}

/** "October · 3 Oct" (last payment column). */
export function monthAndDay(value: Date | string, timeZone?: string): string {
  return `${monthName(value, timeZone)} · ${dayShortMonth(value, timeZone)}`;
}

/** "Sat 21 Nov". */
export function shortWeekdayDayMonth(
  value: Date | string,
  timeZone?: string
): string {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
  }).format(toDate(value));
  return `${weekday} ${dayShortMonth(value, timeZone)}`;
}

/** "November" for a period start date. */
export function monthName(value: Date | string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, month: "long" }).format(
    toDate(value)
  );
}

/** "16:00" minus 30 minutes -> "15:30" (check-in opens half an hour before). */
export function minutesBefore(time: string, minutes: number): string {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  const total = (hours * 60 + mins - minutes + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
