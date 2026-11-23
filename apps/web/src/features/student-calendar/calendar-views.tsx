import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/student/icons";
import type { MyAttendance } from "@/features/student-attendance/queries";
import {
  addDays,
  addMonths,
  dayMonth,
  eachDay,
  type MonthKey,
  monthLabel,
  startOfWeek,
  weekdayLong,
} from "@/features/student-calendar/dates";
import { EventCard } from "@/features/student-calendar/event-card";
import {
  type DayCell,
  MonthGrid,
} from "@/features/student-calendar/month-grid";
import type { StudentEvent } from "@/features/student-calendar/queries";
import {
  agendaDay,
  eventsByDay,
  isCancelledOn,
} from "@/features/student-calendar/selectors";
import type { Country, DateOnly } from "@/features/types";

const DAYS_IN_WEEK = 7;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="py-1 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label [&:not(:first-child)]:pt-[10px]">
      {children}
    </h2>
  );
}

function weekLabel(weekStart: DateOnly, today: DateOnly): string {
  const thisWeek = startOfWeek(today);
  if (weekStart === thisWeek) {
    return "This week";
  }
  if (weekStart === addDays(thisWeek, DAYS_IN_WEEK)) {
    return "Next week";
  }
  return `Week of ${dayMonth(weekStart)}`;
}

function attendanceByDay(rows: MyAttendance[]) {
  return new Map(rows.map((row) => [`${row.eventId}:${row.sessionDate}`, row]));
}

interface ViewProps {
  attendance: MyAttendance[];
  country: Country;
  events: StudentEvent[];
  timeZone: string;
  today: DateOnly;
}

/** Agenda (default): today onwards, grouped by week, each event once. */
export function AgendaView({
  attendance,
  country,
  events,
  timeZone,
  today,
}: ViewProps) {
  const rows = attendanceByDay(attendance);
  const groups = new Map<DateOnly, { date: DateOnly; event: StudentEvent }[]>();
  for (const event of events) {
    const date = agendaDay(event, today);
    const week = startOfWeek(date);
    const list = groups.get(week) ?? [];
    list.push({ date, event });
    groups.set(week, list);
  }
  if (groups.size === 0) {
    return (
      <p className="rounded-md bg-fog p-5 text-muted text-sm leading-5">
        Nothing on the calendar for the next four weeks.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-[6px]">
      {[...groups.entries()].map(([week, items]) => (
        <section className="contents" key={week}>
          <SectionLabel>{weekLabel(week, today)}</SectionLabel>
          {items.map(({ date, event }) => (
            <EventCard
              attendance={rows.get(`${event.id}:${date}`)}
              country={country}
              date={date}
              event={event}
              key={event.id}
              timeZone={timeZone}
              today={today}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function dayDescription(dayEvents: StudentEvent[], date: DateOnly): string {
  const live = dayEvents.filter((e) => !isCancelledOn(e, date));
  const cancelled = dayEvents.length - live.length;
  const parts: string[] = [weekdayLong(date)];
  if (live.length > 0) {
    parts.push(live.length === 1 ? "1 event" : `${live.length} events`);
  }
  if (cancelled > 0) {
    parts.push(`${cancelled} cancelled`);
  }
  return parts.join(", ");
}

function dayCell(
  list: StudentEvent[],
  date: DateOnly,
  selectedDay: DateOnly,
  today: DateOnly
): DayCell {
  const live = list.filter((e) => !isCancelledOn(e, date));
  let marker: ReactNode = null;
  if (live.length > 0) {
    marker = <span className="size-2 rounded-full bg-ink" />;
  } else if (list.length > 0) {
    marker = (
      <span className="size-2 rounded-full border-[#C8C8C8] border-[1.5px]" />
    );
  }
  let highlight: DayCell["highlight"];
  if (date === selectedDay) {
    highlight = "ink";
  } else if (date === today) {
    highlight = "ring";
  }
  return {
    description: dayDescription(list, date),
    highlight,
    marker,
    muted: list.length === 0,
  };
}

/** Month grid with the selected day's events below it (beside it on wide screens). */
export function MonthView({
  attendance,
  country,
  events,
  month,
  onSelectDay,
  selectedDay,
  timeZone,
  today,
  monthFrom,
  monthTo,
}: ViewProps & {
  month: MonthKey;
  monthFrom: DateOnly;
  monthTo: DateOnly;
  onSelectDay: (day: DateOnly) => void;
  selectedDay: DateOnly;
}) {
  const byDay = eventsByDay(events, monthFrom, monthTo);
  const rows = attendanceByDay(attendance);
  const dayEvents = byDay.get(selectedDay) ?? [];
  const cells = new Map<DateOnly, DayCell>();
  for (const date of eachDay(monthFrom, monthTo)) {
    cells.set(date, dayCell(byDay.get(date) ?? [], date, selectedDay, today));
  }
  const navClass = cn(buttonVariants({ size: "icon", variant: "secondary" }));

  return (
    <div className="flex items-start gap-8 max-md:gap-5 max-lg:flex-col max-lg:items-stretch">
      <MonthGrid
        cells={cells}
        className="w-full lg:max-w-[440px] lg:shrink-0"
        header={
          <div className="flex items-center justify-between px-1 pb-3">
            <Link
              aria-label={`Previous month, ${monthLabel(addMonths(month, -1))}`}
              className={navClass}
              from="/student/calendar"
              search={{ view: "month", month: addMonths(month, -1) }}
            >
              <ChevronLeftIcon />
            </Link>
            <h2
              aria-live="polite"
              className="font-semibold text-base text-ink leading-5"
            >
              {monthLabel(month)}
            </h2>
            <Link
              aria-label={`Next month, ${monthLabel(addMonths(month, 1))}`}
              className={navClass}
              from="/student/calendar"
              search={{ view: "month", month: addMonths(month, 1) }}
            >
              <ChevronRightIcon />
            </Link>
          </div>
        }
        month={month}
        onSelect={onSelectDay}
        selected={selectedDay}
      />
      <section
        aria-labelledby="selected-day"
        className="flex min-w-0 flex-1 flex-col gap-[6px]"
      >
        <h2
          className="py-1 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label"
          id="selected-day"
        >
          {weekdayLong(selectedDay)} {dayMonth(selectedDay)}
          {selectedDay === today ? " · Today" : ""}
        </h2>
        {dayEvents.length === 0 ? (
          <p className="rounded-md bg-fog p-5 text-muted text-sm leading-5">
            Nothing on this day.
          </p>
        ) : (
          dayEvents.map((event) => (
            <EventCard
              attendance={rows.get(`${event.id}:${selectedDay}`)}
              country={country}
              date={selectedDay}
              event={event}
              key={event.id}
              timeZone={timeZone}
              today={today}
            />
          ))
        )}
      </section>
    </div>
  );
}
