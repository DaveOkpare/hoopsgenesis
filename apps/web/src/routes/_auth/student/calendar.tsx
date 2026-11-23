import {
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { segmentedItem, segmentedTrack } from "@/components/student/segmented";
import { myAttendanceQueryOptions } from "@/features/student-attendance/queries";
import {
  AgendaView,
  MonthView,
} from "@/features/student-calendar/calendar-views";
import {
  addDays,
  firstOfMonth,
  isDateOnly,
  isMonthKey,
  lastOfMonth,
  type MonthKey,
  monthOf,
  startOfWeek,
} from "@/features/student-calendar/dates";
import {
  studentEventsQueryOptions,
  useAcademyClock,
} from "@/features/student-calendar/queries";
import type { DateOnly } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";
import { academyCountry } from "@/features/viewer/selectors";

interface CalendarSearch {
  /** Selected day in Month view. */
  day?: DateOnly;
  /** Month shown in Month view ("2026-11"). */
  month?: MonthKey;
  view?: "month";
}

export const Route = createFileRoute("/_auth/student/calendar")({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    view: search.view === "month" ? "month" : undefined,
    month: isMonthKey(search.month) ? search.month : undefined,
    day: isDateOnly(search.day) ? search.day : undefined,
  }),
  component: CalendarPage,
});

/** Agenda covers this week and the next three. */
const AGENDA_WEEKS = 4;
const DAYS_IN_WEEK = 7;

function ViewToggle({ view }: { view: "agenda" | "month" }) {
  return (
    <nav aria-label="Calendar view" className={segmentedTrack("sm")}>
      <Link
        aria-current={view === "agenda" ? "page" : undefined}
        className={segmentedItem("sm", view === "agenda")}
        search={{}}
        to="/student/calendar"
      >
        Agenda
      </Link>
      <Link
        aria-current={view === "month" ? "page" : undefined}
        className={segmentedItem("sm", view === "month")}
        search={{ view: "month" }}
        to="/student/calendar"
      >
        Month
      </Link>
    </nav>
  );
}

function CalendarPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/student/calendar" });
  const { academyId, timeZone, today } = useAcademyClock();
  const membership = useActiveMembership();
  const country = membership ? academyCountry(membership.academy) : "rwanda";
  const view = search.view ?? "agenda";

  const month =
    search.month ?? (search.day ? monthOf(search.day) : monthOf(today));
  const monthFrom = firstOfMonth(month);
  const monthTo = lastOfMonth(month);
  let selectedDay = monthOf(today) === month ? today : monthFrom;
  if (search.day && monthOf(search.day) === month) {
    selectedDay = search.day;
  }

  const range =
    view === "month"
      ? { from: monthFrom, to: monthTo }
      : {
          from: today,
          to: addDays(startOfWeek(today), AGENDA_WEEKS * DAYS_IN_WEEK - 1),
        };
  const events = useQuery(studentEventsQueryOptions(academyId, range));
  const attendance = useQuery(myAttendanceQueryOptions(academyId, range));

  const selectDay = useCallback(
    (day: DateOnly) =>
      navigate({
        search: { view: "month", month: monthOf(day), day },
        replace: true,
      }),
    [navigate]
  );

  const ready = events.data && attendance.data;

  return (
    <div
      className={cn(
        "flex flex-col gap-8 max-md:gap-5",
        view === "agenda" && "max-w-[640px]"
      )}
    >
      <PageHeader className="max-md:items-end">
        <PageHeading>
          <PageTitle className="max-md:text-[44px] max-md:leading-[95%]">
            Calendar
          </PageTitle>
        </PageHeading>
        <PageActions>
          <ViewToggle view={view} />
        </PageActions>
      </PageHeader>

      <div className="w-full">
        {ready ? null : (
          <div className="flex flex-col gap-[6px]">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-[78px] rounded-md" />
            <Skeleton className="h-[78px] rounded-md" />
            <Skeleton className="h-[78px] rounded-md" />
          </div>
        )}
        {ready && view === "agenda" ? (
          <AgendaView
            attendance={attendance.data}
            country={country}
            events={events.data}
            timeZone={timeZone}
            today={today}
          />
        ) : null}
        {ready && view === "month" ? (
          <MonthView
            attendance={attendance.data}
            country={country}
            events={events.data}
            month={month}
            monthFrom={monthFrom}
            monthTo={monthTo}
            onSelectDay={selectDay}
            selectedDay={selectedDay}
            timeZone={timeZone}
            today={today}
          />
        ) : null}
      </div>
    </div>
  );
}
