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
  ResultTile,
  UploadTile,
} from "@/features/student-home/home-cards";
import {
  isSessionState,
  nextSessionQueryOptions,
  type SessionState,
} from "@/features/student-home/queries";
import { SessionCard } from "@/features/student-home/session-card";
import { drillProgress } from "@/features/student-progress/selectors";
import { studentRecordsQueryOptions } from "@/features/student-records/queries";
import { useViewer } from "@/features/viewer/queries";
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
  const month = monthOf(today);
  const name = firstName(viewer.user.name);

  const session = useQuery(nextSessionQueryOptions(academyId, preview));
  const fees = useQuery(myFeesQueryOptions(academyId));
  const upcoming = useQuery(
    studentEventsQueryOptions(academyId, {
      from: today,
      to: addDays(today, COMING_UP_DAYS),
    })
  );
  const attendance = useQuery(
    myAttendanceQueryOptions(academyId, {
      from: firstOfMonth(month),
      to: today,
    })
  );
  const results = useQuery(
    studentRecordsQueryOptions(academyId, viewer.user.id, {
      recordType: "athletic",
    })
  );

  const sessionEvent = session.data?.event;
  const comingUp = (upcoming.data ?? [])
    .filter(
      (event) =>
        event.id !== sessionEvent?.id &&
        event.startDate > (sessionEvent?.startDate ?? today) &&
        !event.excludedDates.includes(event.startDate)
    )
    .slice(0, COMING_UP_COUNT);
  const due = fees.data?.due ?? null;

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

      <div className="flex gap-5 max-md:flex-col">
        {session.status === "pending" ? (
          <Skeleton className="h-[277px] rounded-lg max-md:h-[254px] md:flex-[1.2]" />
        ) : null}
        {session.data ? (
          <SessionCard session={session.data} timeZone={timeZone} />
        ) : null}
        {session.data === null ? (
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

      {upcoming.data ? <ComingUp events={comingUp} /> : null}

      <div className="flex gap-5 max-md:hidden">
        {attendance.data ? (
          <AttendanceTile
            monthName={monthName(month)}
            summary={summarizeAttendance(attendance.data)}
          />
        ) : (
          <Skeleton className="h-[177px] flex-1 rounded-lg" />
        )}
        {results.data ? (
          <ResultTile
            label="Free throws"
            progress={drillProgress(results.data, "free_throws")}
            today={today}
          />
        ) : (
          <Skeleton className="h-[177px] flex-1 rounded-lg" />
        )}
        <UploadTile />
      </div>
    </div>
  );
}
