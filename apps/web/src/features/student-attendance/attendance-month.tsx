import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import {
  dayOfMonth,
  type MonthKey,
  monthLabel,
  monthWeeks,
} from "@/features/student-calendar/dates";
import type { DayCell } from "@/features/student-calendar/month-grid";
import type { DateOnly, Id } from "@/features/types";

/*
 * The month in "[Student] My attendance" (46Z-0): the calendar feature's grid (Monday
 * first, a 28px day number over a 10px marker row), where each day with a session links
 * to that session ("Tap a day to open that session", /student/sessions/$eventId).
 */

const WEEKDAYS = [
  { short: "M", long: "Monday" },
  { short: "T", long: "Tuesday" },
  { short: "W", long: "Wednesday" },
  { short: "T", long: "Thursday" },
  { short: "F", long: "Friday" },
  { short: "S", long: "Saturday" },
  { short: "S", long: "Sunday" },
] as const;

const EMPTY_CELL: DayCell = { muted: true };

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

export function AttendanceMonth({
  month,
  cells,
  sessionOn,
}: {
  month: MonthKey;
  cells: ReadonlyMap<DateOnly, DayCell>;
  /** The session to open for a day, if it has one. */
  sessionOn: ReadonlyMap<DateOnly, Id>;
}) {
  const weeks = monthWeeks(month);
  return (
    <div className="flex flex-col gap-[2px] rounded-[20px] border border-line px-[10px] py-[14px]">
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
                const eventId = sessionOn.get(date);
                return (
                  <td className="h-[54px] p-0 align-top" key={date}>
                    {eventId ? (
                      <Link
                        aria-label={`${label}. Open the session`}
                        className="flex h-[52px] w-full flex-col items-center gap-1 rounded-[12px] outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink"
                        params={{ eventId }}
                        search={{ date }}
                        to="/student/sessions/$eventId"
                      >
                        <DayContent cell={cell} date={date} />
                      </Link>
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
