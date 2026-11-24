import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { AttendanceMonth } from "@/features/student-attendance/attendance-month";
import {
  AttendanceLegend,
  AttendanceSummaryTiles,
  attendanceCell,
  MonthPicker,
} from "@/features/student-attendance/attendance-views";
import {
  myAttendanceQueryOptions,
  sessionDaysQueryOptions,
} from "@/features/student-attendance/queries";
import { summarizeAttendance } from "@/features/student-attendance/summary";
import {
  addMonths,
  eachDay,
  firstOfMonth,
  isMonthKey,
  lastOfMonth,
  type MonthKey,
  monthLabel,
  monthName,
  monthOf,
} from "@/features/student-calendar/dates";
import type { DayCell } from "@/features/student-calendar/month-grid";
import { useAcademyClock } from "@/features/student-calendar/queries";
import { ProgressSwitch } from "@/features/student-progress/progress-switch";
import type { DateOnly, Id } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";

interface AttendanceSearch {
  month?: MonthKey;
}

export const Route = createFileRoute("/_auth/student/attendance")({
  validateSearch: (search: Record<string, unknown>): AttendanceSearch =>
    isMonthKey(search.month) ? { month: search.month } : {},
  component: AttendancePage,
});

/** Months from the one the student joined in up to now, newest first. */
function monthsSince(joined: DateOnly, current: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let m = current; m >= monthOf(joined); m = addMonths(m, -1)) {
    months.push(m);
  }
  return months;
}

function AttendancePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/student/attendance" });
  const viewer = useViewer();
  const { academyId, today } = useAcademyClock();
  const currentMonth = monthOf(today);
  const months = monthsSince(
    viewer.user.createdAt.slice(0, 10) || today,
    currentMonth
  );
  const month =
    search.month && months.includes(search.month) ? search.month : currentMonth;
  const range = { from: firstOfMonth(month), to: lastOfMonth(month) };

  const rows = useQuery(myAttendanceQueryOptions(academyId, range));
  const sessions = useQuery(sessionDaysQueryOptions(academyId, range));

  const changeMonth = useCallback(
    (next: MonthKey) =>
      navigate({
        search: next === currentMonth ? {} : { month: next },
        replace: true,
      }),
    [navigate, currentMonth]
  );

  const isCurrent = month === currentMonth;
  const periodLabel = isCurrent ? "This month" : monthName(month);
  const past = (rows.data ?? []).filter((row) => row.sessionDate <= today);
  const summary = summarizeAttendance(past);

  const rowByDay = new Map(past.map((row) => [row.sessionDate, row]));
  const liveSessions = (sessions.data ?? []).filter((s) => !s.cancelled);
  const upcomingDays = new Set(
    liveSessions.filter((s) => s.sessionDate > today).map((s) => s.sessionDate)
  );
  // Each day opens its session: the one attended, else the first that day.
  const sessionOn = new Map<DateOnly, Id>();
  for (const s of liveSessions) {
    if (!sessionOn.has(s.sessionDate)) {
      sessionOn.set(s.sessionDate, s.eventId);
    }
  }
  for (const row of past) {
    sessionOn.set(row.sessionDate, row.eventId);
  }
  const cells = new Map<DateOnly, DayCell>();
  for (const date of eachDay(range.from, range.to)) {
    cells.set(
      date,
      attendanceCell(rowByDay.get(date), {
        isToday: date === today,
        upcoming: upcomingDays.has(date),
      })
    );
  }
  const ready = Boolean(rows.data && sessions.data);

  return (
    <div className="flex flex-col gap-8 max-md:gap-5 lg:max-w-[912px]">
      <ProgressSwitch current="attendance" />
      <PageHeader>
        <PageHeading>
          <Eyebrow className="max-md:hidden">{monthLabel(month)}</Eyebrow>
          <PageTitle className="max-md:text-[44px] max-md:leading-[95%]">
            Attendance
          </PageTitle>
        </PageHeading>
        <PageActions>
          <MonthPicker month={month} months={months} onChange={changeMonth} />
        </PageActions>
      </PageHeader>

      {ready ? (
        <div className="flex gap-8 max-md:gap-5 max-lg:flex-col lg:items-start">
          <AttendanceSummaryTiles
            className="lg:order-2 lg:w-[320px] lg:flex-col"
            periodLabel={periodLabel}
            summary={summary}
          />
          <div className="flex w-full flex-col gap-5 lg:order-1 lg:max-w-[560px]">
            <AttendanceMonth
              cells={cells}
              month={month}
              sessionOn={sessionOn}
            />
            <AttendanceLegend />
            {sessionOn.size > 0 ? (
              <p className="text-[13px] text-muted leading-4">
                Tap a day to open that session.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:max-w-[560px]">
          <Skeleton className="h-[66px] rounded-md" />
          <Skeleton className="h-[370px] rounded-[20px]" />
        </div>
      )}
    </div>
  );
}
