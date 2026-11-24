/* Side panel beside the month grid: admin "Today" list (8BX-0), coach day card + Next up (8M9-0). */
import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import type { CalendarItem } from "@/features/calendar/api";
import { ChevronIcon } from "@/features/calendar/controls";
import {
  dayMonth,
  dayOfMonth,
  monthName,
  monthOf,
  timeIn,
  weekdayDay,
  weekdayLong,
} from "@/features/calendar/dates";
import { ItemLink } from "@/features/calendar/item-link";
import {
  coachLine,
  itemHeading,
  itemPhrase,
  itemState,
  repeatDays,
  type TeamIndex,
  teamOf,
  toneOf,
} from "@/features/calendar/model";
import { TONE_BG } from "@/features/calendar/tone";
import type { DateOnly } from "@/features/types";

function timeRange(item: CalendarItem, separator: string): string | null {
  if (!item.startTime) {
    return null;
  }
  return item.endTime
    ? `${item.startTime}${separator}${item.endTime}`
    : item.startTime;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function StateLabel({ item, now }: { item: CalendarItem; now: Date }) {
  const state = itemState(item, now);
  if (state === "cancelled") {
    return (
      <span className="shrink-0 self-start font-semibold text-[13px] text-orange-deep leading-[17px]">
        Cancelled
      </span>
    );
  }
  if (state === "live") {
    return (
      <span className="shrink-0 self-start font-semibold text-[13px] text-orange-deep leading-[17px]">
        Live now
      </span>
    );
  }
  if (state === "upcoming" && item.startTime) {
    return (
      <span className="shrink-0 self-start font-semibold text-[13px] text-success leading-[17px]">
        Starts {item.startTime}
      </span>
    );
  }
  return null;
}

/** Admin: the selected day (default today) with its sessions. */
export function AdminDayPanel({
  date,
  today,
  items,
  teams,
  now,
}: {
  date: DateOnly;
  today: DateOnly;
  items: CalendarItem[];
  teams: TeamIndex;
  now: Date;
}) {
  const live = items.filter((item) => !item.cancelled);
  const teamCount = new Set(live.map((item) => item.teamId ?? "academy")).size;
  const isToday = date === today;
  return (
    <aside
      aria-label="Selected day"
      className="flex w-[300px] shrink-0 flex-col gap-4 max-lg:w-full"
    >
      <div className="flex flex-col gap-[6px] rounded-[20px] bg-fog px-[22px] py-5">
        <p className="font-semibold text-[13px] text-orange-deep uppercase leading-4 tracking-label">
          {isToday ? "Today" : weekdayLong(date)}
        </p>
        <h2 className="font-display text-[34px] text-ink uppercase leading-[95%]">
          {weekdayLong(date)} {dayMonth(date)}
        </h2>
        <p className="text-muted text-sm leading-[18px]">
          {live.length === 0
            ? "Nothing on this day"
            : `${plural(live.length, "session")}, ${plural(teamCount, "team")}`}
        </p>
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((item) => {
            const team = teamOf(item, teams);
            const details = [timeRange(item, " to "), item.location]
              .filter(Boolean)
              .join(", ");
            const coach = coachLine(team);
            return (
              <li key={item.key}>
                <ItemLink
                  audience="admin"
                  className="flex items-center gap-3 border-line border-b py-[14px] outline-none transition-colors hover:bg-[#FAFAF8] focus-visible:ring-2 focus-visible:ring-ink"
                  item={item}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "w-1 self-stretch rounded-full",
                      item.cancelled ? "bg-line" : TONE_BG[toneOf(item, teams)]
                    )}
                  />
                  <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[3px]">
                    <span
                      className={cn(
                        "font-semibold text-[15px] text-ink leading-5",
                        item.cancelled && "text-muted line-through"
                      )}
                    >
                      {itemPhrase(item, teams)}
                    </span>
                    {details ? (
                      <span className="text-[13px] text-muted leading-[17px]">
                        {details}
                      </span>
                    ) : null}
                    {coach ? (
                      <span className="text-[13px] text-muted leading-[17px]">
                        {coach}
                      </span>
                    ) : null}
                  </span>
                  {isToday || item.cancelled ? (
                    <StateLabel item={item} now={now} />
                  ) : null}
                  <span className="flex w-4 shrink-0 justify-end text-[#9A9A9A]">
                    <ChevronIcon />
                  </span>
                </ItemLink>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-col gap-2">
        <Link
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto w-full py-3 font-semibold"
          )}
          search={{ date }}
          to="/admin/calendar/new"
        >
          Add an event on this day
        </Link>
        <p className="text-[13px] text-muted leading-[18px]">
          Open a session to edit it or cancel one day. A cancelled day stays on
          the calendar, struck through, so students can see it.
        </p>
      </div>
    </aside>
  );
}

function CoachDayCard({
  item,
  items,
  teams,
  timeZone,
  now,
  onCancel,
}: {
  item: CalendarItem;
  items: CalendarItem[];
  teams: TeamIndex;
  timeZone: string;
  now: Date;
  onCancel: (key: string) => void;
}) {
  const handleCancel = useCallback(
    () => onCancel(item.key),
    [item.key, onCancel]
  );
  const team = teamOf(item, teams);
  const repeats = repeatDays(item, items);
  const lines = [
    [timeRange(item, " – "), item.location].filter(Boolean).join(" · "),
    repeats ? `Repeats every ${repeats}` : null,
    item.collectAttendance && !item.cancelled
      ? [
          "Takes attendance",
          team ? plural(team.studentCount, "student") : null,
          item.checkInOpensAt
            ? `check-in opens ${timeIn(item.checkInOpensAt, timeZone)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
    item.cancelled ? "Cancelled. Students see it struck through." : null,
  ].filter((line): line is string => Boolean(line));
  const canCancel = !item.cancelled && itemState(item, now) === "upcoming";
  return (
    <div className="flex flex-col gap-3 rounded-md bg-white p-[18px]">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            item.cancelled ? "bg-[#BDBDBD]" : TONE_BG[toneOf(item, teams)]
          )}
        />
        <h3
          className={cn(
            "font-semibold text-base text-ink leading-5",
            item.cancelled && "text-muted line-through"
          )}
        >
          {itemHeading(item, teams)}
        </h3>
      </div>
      <div className="flex flex-col gap-[6px]">
        {lines.map((line) => (
          <p className="text-ink-soft text-sm leading-[18px]" key={line}>
            {line}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <ItemLink
          audience="coach"
          className={cn(
            buttonVariants({ size: "sm" }),
            "h-auto gap-[6px] px-4 py-[9px]"
          )}
          item={item}
        >
          Open
          <ChevronIcon size={14} />
        </ItemLink>
        {canCancel ? (
          <button
            className="cursor-pointer rounded-full border border-orange-deep px-4 py-[9px] font-semibold text-orange-deep text-sm leading-[18px] outline-none transition-colors hover:bg-orange-soft focus-visible:ring-2 focus-visible:ring-ink"
            onClick={handleCancel}
            type="button"
          >
            Cancel this day
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Coach: the selected day's events with Open / Cancel this day. */
export function CoachDayPanel({
  date,
  today,
  dayItems,
  items,
  teams,
  timeZone,
  now,
  onCancel,
}: {
  date: DateOnly;
  today: DateOnly;
  dayItems: CalendarItem[];
  items: CalendarItem[];
  teams: TeamIndex;
  timeZone: string;
  now: Date;
  onCancel: (key: string) => void;
}) {
  const studentsSeeing = dayItems
    .map((item) => teamOf(item, teams))
    .find((team) => team !== undefined);
  return (
    <div className="flex flex-col gap-6 rounded-lg bg-fog p-6">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
          {date === today ? `Today · ${weekdayLong(date)}` : weekdayLong(date)}
        </p>
        <h2 className="font-display text-2xl text-ink uppercase leading-10">
          {`${dayOfMonth(date)} ${monthName(monthOf(date))}`}
        </h2>
      </div>
      {dayItems.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-md bg-white p-[18px]">
          <p className="font-semibold text-base text-ink leading-5">
            Nothing on this day
          </p>
          <Link
            className={cn(buttonVariants({ size: "sm" }), "w-fit")}
            search={{ date }}
            to="/coach/calendar/new"
          >
            New event
          </Link>
        </div>
      ) : (
        dayItems.map((item) => (
          <CoachDayCard
            item={item}
            items={items}
            key={item.key}
            now={now}
            onCancel={onCancel}
            teams={teams}
            timeZone={timeZone}
          />
        ))
      )}
      {studentsSeeing ? (
        <p className="text-[13px] text-muted leading-[18px]">
          You can cancel a day until the first student checks in. The{" "}
          {plural(studentsSeeing.studentCount, "student")} on{" "}
          {studentsSeeing.name} see it struck through on their calendar.
        </p>
      ) : null}
    </div>
  );
}

/** Coach: the next three events after today. */
export function NextUp({
  items,
  teams,
  now,
  today,
}: {
  items: CalendarItem[];
  today: DateOnly;
  teams: TeamIndex;
  now: Date;
}) {
  const NEXT_COUNT = 3;
  const next = items
    .filter(
      (item) => item.sessionDate > today && itemState(item, now) === "upcoming"
    )
    .slice(0, NEXT_COUNT);
  if (next.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="next-up"
      className="flex flex-col rounded-lg border border-line px-6 py-5"
    >
      <h2
        className="pb-2 font-semibold text-base text-ink leading-[22px]"
        id="next-up"
      >
        Next up
      </h2>
      {next.map((item) => (
        <ItemLink
          audience="coach"
          className="flex items-center gap-[14px] border-line border-t py-3 outline-none last:pb-0 hover:bg-[#FAFAF8] focus-visible:ring-2 focus-visible:ring-ink"
          item={item}
          key={item.key}
        >
          <span className="w-[52px] shrink-0 font-semibold text-[13px] text-ink leading-4">
            {weekdayDay(item.sessionDate)}
          </span>
          <span className="flex-1 basis-0 text-ink-soft text-sm leading-[18px]">
            {[item.startTime, itemHeading(item, teams)]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="flex w-4 shrink-0 justify-end text-[#9A9A9A]">
            <ChevronIcon />
          </span>
        </ItemLink>
      ))}
    </section>
  );
}
