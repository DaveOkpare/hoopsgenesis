import { formatDayMonth, formatTime } from "@/lib/format";

const LOCALE = "en-GB";
const MS_PER_HOUR = 3_600_000;

function shortWeekday(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone }).format(
    typeof value === "string" ? new Date(value) : value
  );
}

/** "Wed 25 Nov, 10:14" (62J-0). */
export function formatInviteDeadline(expiresAt: string, timeZone: string) {
  return `${shortWeekday(expiresAt, timeZone)} ${formatDayMonth(expiresAt, timeZone)}, ${formatTime(expiresAt, timeZone)}`;
}

/** Hours an invite link stays valid, e.g. 48 (5BQ-0). */
export function inviteLifetimeHours(createdAt: string, expiresAt: string) {
  return Math.round(
    (Date.parse(expiresAt) - Date.parse(createdAt)) / MS_PER_HOUR
  );
}

/** "Wed 16:00 · Court 2" (59H-0). `startDate` is a plain YYYY-MM-DD date. */
export function formatSessionSlot(session: {
  location: string | null;
  startDate: string;
  startTime: string | null;
}) {
  const day = shortWeekday(`${session.startDate}T12:00:00Z`, "UTC");
  const when = session.startTime ? `${day} ${session.startTime}` : day;
  return session.location ? `${when} · ${session.location}` : when;
}
