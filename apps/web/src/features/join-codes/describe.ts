/*
 * Words for join codes, as the designs write them (6G1-0, 6AE-0, 6RV-0, 6WV-0).
 * Pure functions; dates are shown in the academy's time zone.
 */
import type {
  InvitationCode,
  InvitationCodeRole,
} from "@/features/join-codes/queries";
import { formatDayMonth, formatTime } from "@/lib/format";

const MS_PER_DAY = 86_400_000;
const SOON_DAYS = 7;
const LINK_PROTOCOL = /^https?:\/\//;

const ROLE_NOUN: Record<InvitationCodeRole, [string, string]> = {
  student: ["Student", "Students"],
  coach: ["Coach", "Coaches"],
};

/** "Students" for a code many people can use, "Coach" for a single-use one. */
export function roleNoun(role: InvitationCodeRole, maxUses: number | null) {
  const [one, many] = ROLE_NOUN[role];
  return maxUses === 1 ? one : many;
}

/** "Students · U14", "Coach · no team". */
export function codeFor(code: InvitationCode): string {
  return `${roleNoun(code.role, code.maxUses)} · ${code.team?.name ?? "no team"}`;
}

/** "Fri 27 Nov" */
export function formatWeekdayDayMonth(
  value: Date | string,
  timeZone?: string
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(new Date(value))
    .replace("Sept", "Sep");
}

/** "Fri 27 Nov, 23:59" */
export function formatExpiry(value: string, timeZone?: string): string {
  return `${formatWeekdayDayMonth(value, timeZone)}, ${formatTime(value, timeZone)}`;
}

/** "By you · 20 Nov", "Revoked by you · posted in a public group". */
export function codeByline(
  code: InvitationCode,
  viewerId: string,
  timeZone?: string
): string {
  if (code.status === "revoked") {
    const who =
      code.revokedById === viewerId
        ? "you"
        : (code.revokedBy?.name ?? "an admin");
    const why =
      code.revokeReason ??
      (code.revokedAt ? formatDayMonth(code.revokedAt, timeZone) : "");
    return `Revoked by ${who}${why ? ` · ${why}` : ""}`;
  }
  const who =
    code.createdById === viewerId
      ? "you"
      : (code.createdBy?.name ?? "an admin");
  return `By ${who} · ${formatDayMonth(code.createdAt, timeZone)}`;
}

/** "4 / 20", "31 / ∞" */
export function usesShort(code: InvitationCode): string {
  return `${code.useCount} / ${code.maxUses ?? "∞"}`;
}

/** "4 of 20 · 16 left", "31 · no limit" */
export function usesLong(code: InvitationCode): string {
  if (code.maxUses === null) {
    return `${code.useCount} · no limit`;
  }
  const left = Math.max(0, code.maxUses - code.useCount);
  return `${code.useCount} of ${code.maxUses} · ${left === 0 ? "none" : left} left`;
}

function calendarDay(value: Date | string, timeZone?: string): number {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
  return Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY;
}

export interface StatusLabel {
  text: string;
  tone: "soon" | "ok" | "off";
}

/** Status column: "Ends in 4 days" (orange), "Until 31 Jan" (green), "Used up" (muted). */
export function codeStatusLabel(
  code: InvitationCode,
  now: Date,
  timeZone?: string
): StatusLabel {
  if (code.status === "used_up") {
    return { text: "Used up", tone: "off" };
  }
  if (code.status === "revoked") {
    return { text: "Revoked", tone: "off" };
  }
  if (code.status === "expired") {
    return { text: "Expired", tone: "off" };
  }
  if (!code.expiresAt) {
    return { text: "No end date", tone: "ok" };
  }
  const days =
    calendarDay(code.expiresAt, timeZone) - calendarDay(now, timeZone);
  if (days > SOON_DAYS) {
    return {
      text: `Until ${formatDayMonth(code.expiresAt, timeZone)}`,
      tone: "ok",
    };
  }
  if (days <= 0) {
    return { text: "Ends today", tone: "soon" };
  }
  return {
    text: days === 1 ? "Ends tomorrow" : `Ends in ${days} days`,
    tone: "soon",
  };
}

/** "up to 20 people", "one person", "no limit" */
function usesPhrase(maxUses: number | null): string {
  if (maxUses === null) {
    return "no limit";
  }
  return maxUses === 1 ? "one person" : `up to ${maxUses} people`;
}

/** "Students on U14 · up to 20 people · until Mon 30 Nov" (footer of 6AE-0, subtitle of 6RV-0). */
export function codeSummary(input: {
  role: InvitationCodeRole;
  teamName: string | null;
  maxUses: number | null;
  expiresAt: string | null;
  timeZone?: string;
}): string {
  const who = `${roleNoun(input.role, input.maxUses)}${input.teamName ? ` on ${input.teamName}` : ""}`;
  return `${who} · ${limitsSummary(input)}`;
}

/** "up to 20 people · until Mon 30 Nov" */
export function limitsSummary(input: {
  maxUses: number | null;
  expiresAt: string | null;
  timeZone?: string;
}): string {
  const until = input.expiresAt
    ? `until ${formatWeekdayDayMonth(input.expiresAt, input.timeZone)}`
    : "no end date";
  return `${usesPhrase(input.maxUses)} · ${until}`;
}

/** "app.hoopsgenesis.com/join/K7PM-4QXR-9TWC" */
export function displayLink(link: string): string {
  return link.replace(LINK_PROTOCOL, "");
}

/** The ready-to-paste message (6RV-0; 6WV-0 leaves the code out). */
export function shareMessage(input: {
  academyName: string;
  code: InvitationCode;
  includeCode: boolean;
  timeZone?: string;
}): string {
  const { code } = input;
  const team = code.team ? ` (${code.team.name})` : "";
  const enter = input.includeCode
    ? `enter code ${code.code}`
    : "enter the code";
  const until = code.expiresAt
    ? ` Works until ${formatDayMonth(code.expiresAt, input.timeZone)}.`
    : "";
  return `Join ${input.academyName}${team}: open ${displayLink(code.link)} or ${enter} in the app.${until}`;
}

/** 23:59 on a "YYYY-MM-DD" day in `timeZone`, as an ISO timestamp. */
export function endOfDayIn(day: string, timeZone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, date, 23, 59);
  const wall = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const part = (type: string) =>
    Number(wall.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute")
  );
  return new Date(guess - (wallAsUtc - guess)).toISOString();
}

/** "YYYY-MM-DD" of `value` (plus `addDays`) in `timeZone`, for date inputs. */
export function plainDayIn(value: Date, timeZone: string, addDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value.getTime() + addDays * MS_PER_DAY));
}
