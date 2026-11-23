import { cn } from "@hoops-genesis/ui/lib/utils";
import { type MouseEvent, type ReactNode, useCallback } from "react";

import {
  dayOfMonth,
  type MonthKey,
  monthLabel,
  monthWeeks,
} from "@/features/student-calendar/dates";
import type { DateOnly } from "@/features/types";

/*
 * Month grid from "[Student] My attendance" (46Z-0): Monday first, a 28px day number
 * with a 10px marker row under it. Used by Attendance (read-only) and the Calendar's
 * Month view (days are buttons that select a day).
 */

export interface DayCell {
  /** Accessible description of the day ("Present, coach confirmed"). */
  description?: string;
  /** ink = filled circle (today / selected), ring = outlined circle. */
  highlight?: "ink" | "ring";
  marker?: ReactNode;
  /** Days with something on them are ink; empty days grey. */
  muted?: boolean;
}

const EMPTY_CELL: DayCell = { muted: true };

const WEEKDAYS = [
  { short: "M", long: "Monday" },
  { short: "T", long: "Tuesday" },
  { short: "W", long: "Wednesday" },
  { short: "T", long: "Thursday" },
  { short: "F", long: "Friday" },
  { short: "S", long: "Saturday" },
  { short: "S", long: "Sunday" },
] as const;

function DayContent({ date, cell }: { date: DateOnly; cell: DayCell }) {
  return (
    <>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-sm leading-[18px]",
          cell.muted ? "text-[#8A8A8A]" : "text-ink",
          cell.highlight === "ink" && "bg-ink font-bold text-white",
          cell.highlight === "ring" && "ring-[1.5px] ring-ink ring-inset"
        )}
      >
        {dayOfMonth(date)}
      </span>
      <span className="flex h-[10px] shrink-0 items-center gap-[2px]">
        {cell.marker}
      </span>
    </>
  );
}

export function MonthGrid({
  month,
  cells,
  onSelect,
  selected,
  header,
  className,
}: {
  month: MonthKey;
  /** Per-day content; days not in the map are plain grey numbers. */
  cells: ReadonlyMap<DateOnly, DayCell>;
  /** When set, days are buttons. */
  onSelect?: (date: DateOnly) => void;
  selected?: DateOnly;
  header?: ReactNode;
  className?: string;
}) {
  const weeks = monthWeeks(month);
  const handleSelect = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { date } = event.currentTarget.dataset;
      if (date) {
        onSelect?.(date);
      }
    },
    [onSelect]
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-[2px] rounded-[20px] border border-line px-[10px] py-[14px]",
        className
      )}
    >
      {header}
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{monthLabel(month)}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th
                abbr={day.long}
                className="pb-[6px] text-center font-semibold text-[#8A8A8A] text-[12px] leading-4"
                key={day.long}
                scope="col"
              >
                {day.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.find(Boolean) ?? "empty"}>
              {WEEKDAYS.map((weekday, column) => {
                const date = week[column];
                if (!date) {
                  // A padding cell has no date; its weekday column is its identity.
                  return (
                    <td className="h-[54px]" key={`pad-${weekday.long}`} />
                  );
                }
                const cell = cells.get(date) ?? EMPTY_CELL;
                const label = [String(dayOfMonth(date)), cell.description]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <td className="h-[54px] p-0 align-top" key={date}>
                    {onSelect ? (
                      <button
                        aria-label={label}
                        aria-pressed={selected === date}
                        className="flex h-[52px] w-full cursor-pointer flex-col items-center gap-1 rounded-[12px] pt-0 outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink"
                        data-date={date}
                        onClick={handleSelect}
                        type="button"
                      >
                        <DayContent cell={cell} date={date} />
                      </button>
                    ) : (
                      <div className="flex h-[52px] flex-col items-center gap-1">
                        <span className="sr-only">{label}</span>
                        <span
                          aria-hidden="true"
                          className="flex flex-col items-center gap-1"
                        >
                          <DayContent cell={cell} date={date} />
                        </span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
