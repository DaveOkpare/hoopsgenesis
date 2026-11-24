/* Desktop / tablet month grid (Paper 8BX-0 admin, 8M9-0 coach). */
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useCallback } from "react";

import type { CalendarItem } from "@/features/calendar/api";
import {
  dayMonth,
  dayOfMonth,
  gridWeeks,
  type MonthKey,
  monthOf,
  weekdayLong,
} from "@/features/calendar/dates";
import {
  type CalendarRole,
  chipLabel,
  isTraining,
  type TeamIndex,
  toneOf,
} from "@/features/calendar/model";
import { TONE_BG, TONE_BORDER } from "@/features/calendar/tone";
import type { DateOnly } from "@/features/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** Chips a cell shows before "+N more". */
const MAX_CHIPS = 2;

function Chip({
  item,
  teams,
  role,
}: {
  item: CalendarItem;
  teams: TeamIndex;
  role: CalendarRole;
}) {
  const tone = toneOf(item, teams);
  const label = chipLabel(item, teams, role);
  const base =
    "flex min-w-0 items-center gap-[5px] rounded-[6px] text-[12px] leading-[15px]";
  const text = "min-w-0 truncate";
  if (item.cancelled) {
    return (
      <span
        className={cn(
          base,
          "border border-[#BDBDBD] border-dashed bg-white px-[5px] py-[2px]"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-[6px] shrink-0 rounded-full",
            role === "coach" ? "bg-[#BDBDBD]" : TONE_BG[tone]
          )}
        />
        <span className={cn(text, "font-medium text-muted line-through")}>
          {label}
        </span>
      </span>
    );
  }
  if (isTraining(item)) {
    return (
      <span className={cn(base, "bg-fog px-[6px] py-[3px]")}>
        <span
          aria-hidden="true"
          className={cn("size-[6px] shrink-0 rounded-full", TONE_BG[tone])}
        />
        <span className={cn(text, "font-medium text-ink")}>{label}</span>
      </span>
    );
  }
  if (role === "coach") {
    return (
      <span className={cn(base, "bg-ink px-[6px] py-[3px]")}>
        <span className={cn(text, "font-semibold text-white")}>{label}</span>
      </span>
    );
  }
  const multiDay = item.dayCount > 1;
  return (
    <span
      className={cn(
        base,
        multiDay
          ? "bg-[#FEF4D6] px-[6px] py-[3px]"
          : cn("border bg-white px-[5px] py-[2px]", TONE_BORDER[tone])
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-[6px] shrink-0 rounded-full", TONE_BG[tone])}
      />
      <span className={cn(text, "font-semibold text-ink")}>{label}</span>
    </span>
  );
}

function DayNumber({
  date,
  month,
  isToday,
  role,
}: {
  date: DateOnly;
  month: MonthKey;
  isToday: boolean;
  role: CalendarRole;
}) {
  const inMonth = monthOf(date) === month;
  const label = dayOfMonth(date) === 1 ? dayMonth(date) : `${dayOfMonth(date)}`;
  if (isToday) {
    return (
      <span className="flex items-center gap-[6px]">
        <span
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-full bg-orange font-bold text-[12px] leading-4",
            role === "admin" ? "text-white" : "text-ink"
          )}
        >
          {dayOfMonth(date)}
        </span>
        {role === "coach" ? (
          <span className="font-semibold text-[12px] text-orange-deep leading-4">
            Today
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-semibold text-[13px] leading-4",
        // Admin greys only the days before the month (Paper 8BX-0); coach greys both ends.
        inMonth || (role === "admin" && date > month)
          ? "text-ink"
          : "font-normal text-[#B5B5B5]"
      )}
    >
      {label}
    </span>
  );
}

function DayCell({
  date,
  month,
  items,
  teams,
  role,
  today,
  selected,
  onSelect,
  lastColumn,
}: {
  date: DateOnly;
  month: MonthKey;
  items: CalendarItem[];
  teams: TeamIndex;
  role: CalendarRole;
  today: DateOnly;
  selected: boolean;
  onSelect: (date: DateOnly) => void;
  lastColumn: boolean;
}) {
  const handleClick = useCallback(() => onSelect(date), [date, onSelect]);
  const isToday = date === today;
  const shown = items.slice(0, MAX_CHIPS);
  const hidden = items.length - shown.length;
  const count = items.filter((item) => !item.cancelled).length;
  const summary = count === 1 ? "1 event" : `${count} events`;
  return (
    <button
      aria-label={`${weekdayLong(date)} ${dayMonth(date)}, ${summary}`}
      aria-pressed={selected}
      className={cn(
        "flex h-[112px] min-w-0 flex-1 basis-0 cursor-pointer flex-col gap-1 overflow-hidden p-2 text-left outline-none transition-colors hover:bg-[#FAFAF8] focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]",
        role === "coach" && "h-auto min-h-[104px] gap-[6px] p-[10px]",
        !lastColumn && "border-line border-r",
        isToday &&
          role === "admin" &&
          "bg-[#FFF6EE] shadow-[inset_0_0_0_2px_#EB7724] hover:bg-[#FFF6EE]",
        selected &&
          !(isToday && role === "admin") &&
          "bg-orange-soft shadow-[inset_0_0_0_2px_var(--color-ink)] hover:bg-orange-soft"
      )}
      onClick={handleClick}
      type="button"
    >
      <DayNumber date={date} isToday={isToday} month={month} role={role} />
      {shown.map((item) => (
        <Chip item={item} key={item.key} role={role} teams={teams} />
      ))}
      {hidden > 0 ? (
        <span className="pl-[6px] font-medium text-[12px] text-muted leading-[15px]">
          +{hidden} more
        </span>
      ) : null}
    </button>
  );
}

export function MonthGrid({
  month,
  days,
  teams,
  role,
  today,
  selected,
  onSelect,
  loading,
}: {
  month: MonthKey;
  days: Map<DateOnly, CalendarItem[]>;
  teams: TeamIndex;
  role: CalendarRole;
  today: DateOnly;
  selected: DateOnly;
  onSelect: (date: DateOnly) => void;
  loading?: boolean;
}) {
  const weeks = gridWeeks(month);
  return (
    <div
      aria-busy={loading}
      className={cn(
        "flex min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-[20px] border border-line max-lg:w-full max-lg:flex-none",
        loading && "opacity-60"
      )}
    >
      <div
        className={cn(
          "flex border-line border-b",
          role === "admin" ? "bg-fog" : "bg-white"
        )}
      >
        {WEEKDAYS.map((day) => (
          <span
            className={cn(
              "flex-1 basis-0 p-[10px] font-medium text-[12px] text-muted uppercase leading-4 tracking-label",
              role === "coach" && "px-[14px] py-3"
            )}
            key={day}
          >
            {day}
          </span>
        ))}
      </div>
      {weeks.map((week, index) => (
        <div
          className={cn(
            "flex",
            index < weeks.length - 1 && "border-line border-b"
          )}
          key={week[0]}
        >
          {week.map((date, column) => (
            <DayCell
              date={date}
              items={days.get(date) ?? []}
              key={date}
              lastColumn={column === week.length - 1}
              month={month}
              onSelect={onSelect}
              role={role}
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
