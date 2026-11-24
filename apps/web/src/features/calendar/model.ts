/* Pure helpers over calendar items: labels, filters, grouping. Safe in components. */
import type { CalendarItem, CalendarTeam } from "@/features/calendar/api";
import {
  joinWithAnd,
  weekdayIndex,
  weekdayShort,
} from "@/features/calendar/dates";
import { ACADEMY_WIDE } from "@/features/calendar/search";
import type { TeamTone } from "@/features/calendar/tone";
import type { DateOnly, Id } from "@/features/types";

export type CalendarRole = "admin" | "coach";

const WHITESPACE = /\s+/;

const TYPE_LABELS: Record<string, string> = {
  training: "Training",
  match: "Match",
  tournament: "Tournament",
  camp: "Camp",
  trial: "Trial",
  meeting: "Meeting",
  social: "Social",
  other: "Other",
};

/** Types offered in the "All types" filter (the server's EVENT_TYPES). */
export const EVENT_TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

export function eventTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export type TeamIndex = Map<Id, CalendarTeam>;

export function indexTeams(teams: CalendarTeam[]): TeamIndex {
  return new Map(teams.map((team) => [team.id, team]));
}

export function teamOf(
  item: CalendarItem,
  teams: TeamIndex
): CalendarTeam | undefined {
  return item.teamId ? teams.get(item.teamId) : undefined;
}

export function toneOf(item: CalendarItem, teams: TeamIndex): TeamTone {
  if (!item.teamId) {
    return "academy";
  }
  return teams.get(item.teamId)?.tone ?? "ink";
}

export function isTraining(item: CalendarItem): boolean {
  return item.eventType === "training";
}

/** "Camp" on one-day events, "Camp, day 2" on a day of a longer one. */
export function titleWithDay(item: CalendarItem): string {
  return item.dayCount > 1 ? `${item.title}, day ${item.dayIndex}` : item.title;
}

/** Text inside a month-grid chip. */
export function chipLabel(
  item: CalendarItem,
  teams: TeamIndex,
  role: CalendarRole
): string {
  const team = teamOf(item, teams);
  if (item.cancelled) {
    return role === "admin" && team ? `${team.name} cancelled` : "Cancelled";
  }
  if (isTraining(item) && team) {
    return role === "coach" && item.startTime
      ? `${item.startTime} ${team.name}`
      : team.name;
  }
  return titleWithDay(item);
}

/** "U12 · Training" (agenda rows and cards). */
export function itemHeading(item: CalendarItem, teams: TeamIndex): string {
  const team = teamOf(item, teams);
  const title = titleWithDay(item);
  return team && !title.startsWith(team.name)
    ? `${team.name} · ${title}`
    : title;
}

/** "U12 training" (admin day panel). */
export function itemPhrase(item: CalendarItem, teams: TeamIndex): string {
  const team = teamOf(item, teams);
  const title = titleWithDay(item);
  if (!team || title.startsWith(team.name)) {
    return title;
  }
  return `${team.name} ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

/** "Coach Sharika" */
export function coachLine(team: CalendarTeam | undefined): string | null {
  const name = team?.coachName?.trim();
  return name ? `Coach ${name.split(WHITESPACE)[0]}` : null;
}

export interface CalendarFilters {
  team?: string;
  type?: string;
}

export function filterItems(
  items: CalendarItem[],
  filters: CalendarFilters
): CalendarItem[] {
  return items.filter((item) => {
    if (filters.type && item.eventType !== filters.type) {
      return false;
    }
    if (filters.team === ACADEMY_WIDE) {
      return item.teamId === null;
    }
    return !filters.team || item.teamId === filters.team;
  });
}

/** Items per day, in time order within the day. */
export function groupByDay(
  items: CalendarItem[]
): Map<DateOnly, CalendarItem[]> {
  const days = new Map<DateOnly, CalendarItem[]>();
  const sorted = [...items].sort((a, b) =>
    `${a.sessionDate}${a.startTime ?? ""}${a.key}`.localeCompare(
      `${b.sessionDate}${b.startTime ?? ""}${b.key}`
    )
  );
  for (const item of sorted) {
    const list = days.get(item.sessionDate);
    if (list) {
      list.push(item);
    } else {
      days.set(item.sessionDate, [item]);
    }
  }
  return days;
}

export type ItemState = "cancelled" | "live" | "upcoming" | "past";

export function itemState(item: CalendarItem, now: Date): ItemState {
  if (item.cancelled) {
    return "cancelled";
  }
  const time = now.getTime();
  const starts = item.startsAt ? Date.parse(item.startsAt) : null;
  const ends = item.endsAt ? Date.parse(item.endsAt) : null;
  if (starts !== null && time < starts) {
    return "upcoming";
  }
  if (ends !== null && time > ends) {
    return "past";
  }
  return starts === null ? "upcoming" : "live";
}

/**
 * "Mon, Wed and Fri" when the same team's session (title and start time) also runs on
 * other weekdays in the loaded range. A weekly series is one event per week on the
 * server, so this is read from the calendar rather than stored.
 */
export function repeatDays(
  item: CalendarItem,
  items: CalendarItem[]
): string | null {
  const same = items.filter(
    (other) =>
      other.teamId === item.teamId &&
      other.title === item.title &&
      other.startTime === item.startTime &&
      other.dayCount === 1
  );
  const MIN_REPEATS = 2;
  if (same.length < MIN_REPEATS) {
    return null;
  }
  const order = new Map<string, number>();
  for (const other of same) {
    order.set(weekdayShort(other.sessionDate), weekdayIndex(other.sessionDate));
  }
  const days = [...order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([day]) => day);
  return joinWithAnd(days);
}

/** Team names joined for an eyebrow: "U14, U16". */
export function teamNames(teams: CalendarTeam[]): string {
  return teams.map((team) => team.name).join(", ");
}
