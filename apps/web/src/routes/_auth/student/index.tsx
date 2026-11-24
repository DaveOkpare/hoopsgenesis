import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { MobileAcademyBar } from "@/components/app-shell/academy-switcher";
import { QueryBoundary } from "@/components/error-state";
import { myAttendanceQueryOptions } from "@/features/student-attendance/queries";
import { summarizeAttendance } from "@/features/student-attendance/summary";
import {
  addDays,
  firstOfMonth,
  monthName,
  monthOf,
} from "@/features/student-calendar/dates";
import {
  studentEventsQueryOptions,
  useAcademyClock,
} from "@/features/student-calendar/queries";
import { myFeesQueryOptions } from "@/features/student-fees/queries";
import {
  AttendanceTile,
  ComingUp,
  FeeDueCard,
  FeeDueNudge,
  NoTeamCard,
  ResultTile,
  UploadTile,
} from "@/features/student-home/home-cards";
import {
  isSessionState,
  nextSessionQueryOptions,
  type SessionState,
} from "@/features/student-home/queries";
import { SessionCard } from "@/features/student-home/session-card";
import {
  drillProgress,
  resultSeries,
  seriesResult,
} from "@/features/student-progress/selectors";
import {
  recordTemplatesQueryOptions,
  studentRecordsQueryOptions,
} from "@/features/student-records/queries";
import type { CalendarEvent, DateOnly, Id } from "@/features/types";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import {
  firstName,
  formatLongDate,
  formatShortWeekdayDate,
} from "@/lib/format";

interface HomeSearch {
  /** Design review: which session state to show (3RS-0 upcoming, 578-0 checked out). */
  session?: SessionState;
}

export const Route = createFileRoute("/_auth/student/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    isSessionState(search.session) ? { session: search.session } : {},
  component: StudentHome,
});

const COMING_UP_DAYS = 14;
const COMING_UP_COUNT = 2;

function StudentHome() {
  const { session: preview } = Route.useSearch();
  const viewer = useViewer();
  const { academyId, now, timeZone, today } = useAcademyClock();
  const name = firstName(viewer.user.name);

  const session = useQuery(
    nextSessionQueryOptions(academyId, preview, timeZone)
  );
  // Secondary on Today: if fees fail, the fee card is simply left out.
  const fees = useQuery({
    ...myFeesQueryOptions(academyId),
    throwOnError: false,
  });
  const due = fees.data?.due ?? null;
  const membership = useActiveMembership();
  const academyName = membership?.academy.name ?? "your academy";
  // On no team yet (spec AGW-0, "Student, no team yet"): nothing to check in to.
  const noTeam = membership?.teams.length === 0;

  return (
    <div className="flex flex-col gap-8 max-md:gap-5">
      <MobileAcademyBar />
      <PageHeader>
        <PageHeading className="max-md:gap-[2px]">
          <Eyebrow>
            <span className="max-md:hidden">
              {formatLongDate(now, timeZone)}
            </span>
            <span className="md:hidden">
              {formatShortWeekdayDate(now, timeZone)}
            </span>
          </Eyebrow>
          <PageTitle className="max-md:text-display-sm max-md:leading-[95%]">
            <span className="max-md:hidden">Hi, {name}</span>
            <span className="md:hidden">Hey {name}</span>
          </PageTitle>
        </PageHeading>
      </PageHeader>

      <div className="flex gap-5 max-lg:flex-col">
        {noTeam ? <NoTeamCard academyName={academyName} /> : null}
        {!noTeam && session.status === "pending" ? (
          <Skeleton className="h-[277px] rounded-lg max-md:h-[254px] md:flex-[1.2]" />
        ) : null}
        {session.data ? (
          <SessionCard session={session.data} timeZone={timeZone} />
        ) : null}
        {!noTeam && session.data === null ? (
          <section className="flex flex-col gap-2 rounded-lg bg-fog p-7 max-md:p-5 md:flex-[1.2]">
            <h2 className="font-semibold text-ink text-lg leading-6">
              No sessions in the next two weeks
            </h2>
            <p className="text-muted text-sm leading-5">
              New sessions show up here and in your calendar.
            </p>
          </section>
        ) : null}
        {fees.status === "pending" ? (
          <Skeleton className="min-h-[277px] flex-1 basis-0 rounded-lg p-7 max-md:hidden" />
        ) : null}
        {due ? <FeeDueCard due={due} today={today} /> : null}
        {due ? <FeeDueNudge due={due} today={today} /> : null}
      </div>

      {/* Each tile below loads on its own: one failing shows its own "Try again". */}
      <QueryBoundary what="what’s coming up">
        <ComingUpSection
          academyId={academyId}
          sessionEvent={session.data?.event}
          today={today}
        />
      </QueryBoundary>

      <div className="grid grid-cols-2 gap-5 max-md:hidden lg:flex">
        <QueryBoundary className="flex-1" what="your attendance">
          <AttendanceSection academyId={academyId} today={today} />
        </QueryBoundary>
        <QueryBoundary className="flex-1" what="your results">
          <ResultSection
            academyId={academyId}
            today={today}
            viewerId={viewer.user.id}
          />
        </QueryBoundary>
        <UploadTile />
      </div>
    </div>
  );
}

function ComingUpSection({
  academyId,
  sessionEvent,
  today,
}: {
  academyId: Id;
  sessionEvent: CalendarEvent | undefined;
  today: DateOnly;
}) {
  const upcoming = useQuery(
    studentEventsQueryOptions(academyId, {
      from: today,
      to: addDays(today, COMING_UP_DAYS),
    })
  );
  if (!upcoming.data) {
    return null;
  }
  const comingUp = upcoming.data
    .filter(
      (event) =>
        event.id !== sessionEvent?.id &&
        event.startDate > (sessionEvent?.startDate ?? today) &&
        !event.excludedDates.includes(event.startDate)
    )
    .slice(0, COMING_UP_COUNT);
  return <ComingUp events={comingUp} />;
}

function AttendanceSection({
  academyId,
  today,
}: {
  academyId: Id;
  today: DateOnly;
}) {
  const month = monthOf(today);
  const attendance = useQuery(
    myAttendanceQueryOptions(academyId, {
      from: firstOfMonth(month),
      to: today,
    })
  );
  if (!attendance.data) {
    return <Skeleton className="h-[177px] flex-1 rounded-lg" />;
  }
  return (
    <AttendanceTile
      monthName={monthName(month)}
      summary={summarizeAttendance(attendance.data)}
    />
  );
}

function ResultSection({
  academyId,
  viewerId,
  today,
}: {
  academyId: Id;
  viewerId: Id;
  today: DateOnly;
}) {
  const results = useQuery(
    studentRecordsQueryOptions(academyId, viewerId, {
      recordType: "athletic",
    })
  );
  const templates = useQuery(
    recordTemplatesQueryOptions(academyId, "athletic")
  );
  if (!(results.data && templates.data)) {
    return <Skeleton className="h-[177px] flex-1 rounded-lg" />;
  }
  // The result tile shows the first result type the student has results for.
  const allSeries = resultSeries(templates.data);
  const tileSeries =
    allSeries.find((series) =>
      results.data.some((r) => seriesResult(r, series) !== null)
    ) ?? allSeries[0];
  if (!tileSeries) {
    return null;
  }
  return (
    <ResultTile
      label={tileSeries.label}
      progress={drillProgress(results.data, tileSeries)}
      today={today}
    />
  );
}
