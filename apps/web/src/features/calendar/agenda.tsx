/* Agenda rows, the phone week strip and the phone month (Paper 7HO-0, C3W-0). */
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useCallback } from "react";

import type { CalendarItem } from "@/features/calendar/api";
import { ChevronIcon } from "@/features/calendar/controls";
import {
  addDays,
  DAYS_IN_WEEK,
  dayMonth,
  dayOfMonth,
  gridWeeks,
  type MonthKey,
  monthOf,
  startOfWeek,
  weekdayDayMonth,
  weekdayLong,
  weekdayShort,
} from "@/features/calendar/dates";
import { ItemLink } from "@/features/calendar/item-link";
import {
  type CalendarRole,
  coachLine,
  itemHeading,
  itemState,
  type TeamIndex,
  teamOf,
  toneOf,
} from "@/features/calendar/model";
import { TONE_BG } from "@/features/calendar/tone";
import type { DateOnly } from "@/features/types";

function subline(
  item: CalendarItem,
  teams: TeamIndex,
  role: CalendarRole
): string {
  const parts = [item.location];
  if (role === "admin") {
    parts.push(coachLine(teamOf(item, teams)));
  } else if (item.collectAttendance) {
    parts.push("takes attendance");
  }
  return parts.filter(Boolean).join(" · ");
}

export function AgendaRow({
  item,
  teams,
  role,
  now,
}: {
  item: CalendarItem;
  teams: TeamIndex;
  role: CalendarRole;
  now: Date;
}) {
  const state = itemState(item, now);
  const struck = item.cancelled && "text-muted line-through";
  return (
    <ItemLink
      audience={role}
      className="flex items-center gap-3 border-line border-b py-3 outline-none transition-colors hover:bg-[#FAFAF8] focus-visible:ring-2 focus-visible:ring-ink max-md:min-h-11"
      item={item}
    >
      <span className="flex w-12 shrink-0 flex-col">
        <span
          className={cn("font-semibold text-[15px] text-ink leading-5", struck)}
        >
          {item.startTime ?? "All day"}
        </span>
        {item.endTime ? (
          <span className={cn("text-[13px] text-muted leading-4", struck)}>
            {item.endTime}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "w-[3px] self-stretch rounded-full",
          item.cancelled ? "bg-line" : TONE_BG[toneOf(item, teams)]
        )}
      />
      <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[2px]">
        <span
          className={cn("font-semibold text-[15px] text-ink leading-5", struck)}
        >
          {itemHeading(item, teams)}
        </span>
        {item.cancelled ? (
          <span className="text-[13px] text-orange-deep leading-4">
            Cancelled
          </span>
        ) : (
          <span className="truncate text-[13px] text-muted leading-4">
            {subline(item, teams, role)}
          </span>
        )}
      </span>
      {state === "live" ? (
        <span className="shrink-0 rounded-full bg-orange px-[9px] py-1 font-bold text-[11px] text-white leading-[14px] tracking-[0.06em]">
          LIVE
        </span>
      ) : null}
      <span className="flex w-4 shrink-0 justify-end text-[#9A9A9A]">
        <ChevronIcon />
      </span>
    </ItemLink>
  );
}

function dayHeading(date: DateOnly, today: DateOnly, role: CalendarRole) {
  if (role === "coach") {
    if (date === today) {
      return "Today";
    }
    return `${weekdayLong(date)} ${dayOfMonth(date)}`;
  }
  return date === today
    ? `Today · ${weekdayDayMonth(date)}`
    : weekdayDayMonth(date);
}

/** Days with their items; `emptyDays` keeps a day that has none (the selected one). */
export function AgendaDays({
  days,
  dates,
  today,
  teams,
  role,
  now,
  keepEmpty,
}: {
  days: Map<DateOnly, CalendarItem[]>;
  dates: DateOnly[];
  today: DateOnly;
  teams: TeamIndex;
  role: CalendarRole;
  now: Date;
  keepEmpty?: DateOnly;
}) {
  const shown = dates.filter(
    (date) => (days.get(date)?.length ?? 0) > 0 || date === keepEmpty
  );
  return (
    <div className="flex flex-col gap-5">
      {shown.map((date) => {
        const items = days.get(date) ?? [];
        return (
          <section aria-label={weekdayDayMonth(date)} key={date}>
            <h2 className="pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
              {dayHeading(date, today, role)}
            </h2>
            {items.length === 0 ? (
              <p className="border-line border-b py-3 text-muted text-sm leading-[18px]">
                Nothing on this day.
              </p>
            ) : (
              items.map((item) => (
                <AgendaRow
                  item={item}
                  key={item.key}
                  now={now}
                  role={role}
                  teams={teams}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Up to three dots: the tones of the day's events (grey when all are cancelled). */
function dayDots(items: CalendarItem[], teams: TeamIndex): string[] {
  const MAX_DOTS = 3;
  const live = items.filter((item) => !item.cancelled);
  if (live.length === 0) {
    return items.length > 0 ? ["bg-[#C8C8C8]"] : [];
  }
  return [...new Set(live.map((item) => TONE_BG[toneOf(item, teams)]))].slice(
    0,
    MAX_DOTS
  );
}

function StripDay({
  date,
  items,
  teams,
  today,
  selected,
  role,
  onSelect,
}: {
  date: DateOnly;
  items: CalendarItem[];
  teams: TeamIndex;
  today: DateOnly;
  selected: boolean;
  role: CalendarRole;
  onSelect: (date: DateOnly) => void;
}) {
  const handleClick = useCallback(() => onSelect(date), [date, onSelect]);
  const dots = dayDots(items, teams);
  const past = date < today;
  return (
    <button
      aria-label={`${weekdayLong(date)} ${dayMonth(date)}`}
      aria-pressed={selected}
      className={cn(
        "flex w-11 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-[14px] py-2 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        role === "coach" && "gap-[6px]",
        selected ? "bg-ink" : "bg-transparent"
      )}
      onClick={handleClick}
      type="button"
    >
      <span
        className={cn(
          "font-semibold text-[11px] uppercase leading-[14px]",
          role === "admin" && "tracking-label",
          selected ? "text-[#FFFFFFB3]" : "text-muted"
        )}
      >
        {weekdayShort(date)}
      </span>
      <span
        className={cn(
          role === "admin"
            ? "font-display text-[22px] leading-6"
            : "font-semibold text-[17px] leading-5",
          selected && "text-white",
          !selected && date === today && "text-orange-deep",
          !(selected || date === today) &&
            (past ? "text-[#B5B5B5]" : "text-ink"),
          selected && role === "coach" && "font-bold"
        )}
      >
        {dayOfMonth(date)}
      </span>
      <span className="flex h-[5px] gap-[3px]">
        {dots.map((dot) => (
          <span
            aria-hidden="true"
            className={cn(
              "size-[5px] rounded-full",
              selected && dot === "bg-ink" ? "bg-white" : dot
            )}
            key={dot}
          />
        ))}
      </span>
    </button>
  );
}

export function WeekStrip({
  selected,
  today,
  days,
  teams,
  role,
  onSelect,
}: {
  selected: DateOnly;
  today: DateOnly;
  days: Map<DateOnly, CalendarItem[]>;
  teams: TeamIndex;
  role: CalendarRole;
  onSelect: (date: DateOnly) => void;
}) {
  const start = startOfWeek(selected);
  const dates = Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    addDays(start, index)
  );
  return (
    <div className="flex justify-between">
      {dates.map((date) => (
        <StripDay
          date={date}
          items={days.get(date) ?? []}
          key={date}
          onSelect={onSelect}
          role={role}
          selected={date === selected}
          teams={teams}
          today={today}
        />
      ))}
    </div>
  );
}

function PhoneMonthDay({
  date,
  month,
  items,
  teams,
  today,
  selected,
  onSelect,
}: {
  date: DateOnly;
  month: MonthKey;
  items: CalendarItem[];
  teams: TeamIndex;
  today: DateOnly;
  selected: boolean;
  onSelect: (date: DateOnly) => void;
}) {
  const handleClick = useCallback(() => onSelect(date), [date, onSelect]);
  const dots = dayDots(items, teams);
  return (
    <button
      aria-label={`${weekdayLong(date)} ${dayMonth(date)}`}
      aria-pressed={selected}
      className={cn(
        "flex h-12 min-w-0 flex-1 basis-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ink",
        selected ? "bg-ink" : "bg-transparent"
      )}
      onClick={handleClick}
      type="button"
    >
      <span
        className={cn(
          "font-semibold text-[15px] leading-5",
          monthOf(date) === month ? "text-ink" : "text-[#B5B5B5]",
          date === today && "text-orange-deep",
          selected && "text-white"
        )}
      >
        {dayOfMonth(date)}
      </span>
      <span className="flex h-[5px] gap-[2px]">
        {dots.map((dot) => (
          <span
            aria-hidden="true"
            className={cn(
              "size-[5px] rounded-full",
              selected && dot === "bg-ink" ? "bg-white" : dot
            )}
            key={dot}
          />
        ))}
      </span>
    </button>
  );
}

/** Phone "Month": a compact grid with dots; tapping a day lists it below. */
export function PhoneMonth({
  month,
  days,
  teams,
  today,
  selected,
  onSelect,
}: {
  month: MonthKey;
  days: Map<DateOnly, CalendarItem[]>;
  teams: TeamIndex;
  today: DateOnly;
  selected: DateOnly;
  onSelect: (date: DateOnly) => void;
}) {
  const weeks = gridWeeks(month);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex">
        {(weeks[0] ?? []).map((date) => (
          <span
            className="flex-1 basis-0 text-center font-semibold text-[11px] text-muted uppercase leading-[14px] tracking-label"
            key={date}
          >
            {weekdayShort(date).slice(0, 1)}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div className="flex" key={week[0]}>
          {week.map((date) => (
            <PhoneMonthDay
              date={date}
              items={days.get(date) ?? []}
              key={date}
              month={month}
              onSelect={onSelect}
              selected={date === selected}
              teams={teams}
              today={today}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
