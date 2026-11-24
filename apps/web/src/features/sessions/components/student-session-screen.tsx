import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { ErrorState } from "@/components/error-state";
import {
  DetailSkeleton,
  FactRow,
} from "@/features/events/components/detail-parts";
import { StudentBack } from "@/features/events/components/student-event-screen";
import { coachName, longDate, timesLabel } from "@/features/events/model";
import {
  type EventDay,
  eventDayQueryOptions,
  type MyAttendanceRow,
} from "@/features/events/queries";
import { localDate, localTime, zonedInstant } from "@/features/sessions/time";
import type { DateOnly, Id } from "@/features/types";
import type { Membership } from "@/features/viewer/api";
import { ApiError } from "@/lib/api-client";

const MS_PER_MINUTE = 60_000;

function TickMark() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 18 18" width="20">
      <path
        d="M4.5 9.5l3 3 6-6.5"
        fill="none"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ClockMark() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 18 18" width="20">
      <circle
        cx="9"
        cy="9"
        fill="none"
        r="6"
        stroke="#111111"
        strokeWidth="1.8"
      />
      <path
        d="M9 5.5V9l2.3 1.6"
        fill="none"
        stroke="#111111"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DashMark() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 18 18" width="20">
      <path
        d="M5 9h8"
        fill="none"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function confirmedBy(row: MyAttendanceRow): string {
  return row.verifiedBy
    ? `confirmed by ${coachName(row.verifiedBy.name)}`
    : "not confirmed by a coach yet";
}

function capitalise(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** The big status card (I69-0 present, I86-0 late; absent and excused in the same shape). */
function StatusCard({
  day,
  row,
  timeZone,
}: {
  day: EventDay;
  row: MyAttendanceRow | null;
  timeZone: string;
}) {
  if (!row) {
    return (
      <section className="flex items-center gap-[14px] rounded-[20px] bg-fog p-[18px]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-stone">
          <DashMark />
        </span>
        <div className="flex flex-col gap-[2px]">
          <h2 className="font-display text-[28px] text-ink uppercase leading-[30px]">
            Not marked
          </h2>
          <p className="text-muted text-sm leading-[18px]">
            Your coach hasn't recorded this session for you yet.
          </p>
        </div>
      </section>
    );
  }
  if (row.status === "late") {
    let lateBy = "";
    if (row.checkInAt && day.event.startTime) {
      const start = zonedInstant(day.date, day.event.startTime, timeZone);
      const minutes = Math.round(
        (new Date(row.checkInAt).getTime() - start.getTime()) / MS_PER_MINUTE
      );
      if (minutes > 0) {
        lateBy = `${minutes} minutes after the start · `;
      }
    }
    return (
      <section className="flex items-center gap-[14px] rounded-[20px] bg-orange-soft p-[18px]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange">
          <ClockMark />
        </span>
        <div className="flex flex-col gap-[2px]">
          <h2 className="font-display text-[28px] text-orange-deep uppercase leading-[30px]">
            Late
          </h2>
          <p className="text-orange-deep text-sm leading-[18px]">
            {lateBy}
            {confirmedBy(row)}
          </p>
        </div>
      </section>
    );
  }
  const present = row.status === "present";
  const word = { present: "Present", absent: "Absent", excused: "Excused" }[
    row.status
  ];
  return (
    <section className="flex items-center gap-[14px] rounded-[20px] bg-fog p-[18px]">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          present ? "bg-success" : "bg-muted"
        )}
      >
        {present ? <TickMark /> : <DashMark />}
      </span>
      <div className="flex flex-col gap-[2px]">
        <h2 className="font-display text-[28px] text-ink uppercase leading-[30px]">
          {word}
        </h2>
        <p className="text-muted text-sm leading-[18px]">
          {present
            ? capitalise(confirmedBy(row))
            : `Marked by ${row.recordedBy ? coachName(row.recordedBy.name) : "a coach"}${row.notes ? ` · ${row.notes}` : ""}`}
        </p>
      </div>
    </section>
  );
}

function howLine(row: MyAttendanceRow, at: string, distance: number | null) {
  if (distance !== null) {
    return `${at} · scanned the code`;
  }
  return row.recordedBy && row.recordedBy.id !== row.studentId
    ? `${at} · by ${coachName(row.recordedBy.name)}`
    : at;
}

/** The student's own attendance for one session (ST-4: I69-0, I86-0). */
export function StudentSessionScreen({
  membership,
  eventId,
  date,
  now,
}: {
  membership: Membership;
  eventId: Id;
  date?: DateOnly;
  now: Date;
}) {
  const timeZone = membership.academy.timezone;
  const today = localDate(now, timeZone);
  const query = useQuery(
    eventDayQueryOptions(
      { academyId: membership.academy.id, today },
      eventId,
      date
    )
  );
  if (query.data === undefined) {
    return <DetailSkeleton label="Loading session" />;
  }
  if (query.data === null) {
    return (
      <ErrorState
        error={
          new ApiError({
            status: 404,
            code: "not_found",
            message: "Session not found",
          })
        }
        variant="page"
      />
    );
  }
  const day = query.data;
  const row = day.attendance;
  const coach = day.coachName ? coachName(day.coachName) : "your coach";
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-5">
      <header className="flex flex-col gap-[10px]">
        <StudentBack label="Attendance" to="/student/attendance" />
        <p className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label md:font-medium md:text-sm md:leading-[18px]">
          {longDate(day.date)} ·{" "}
          {timesLabel(day.event.startTime, day.event.endTime)}
        </p>
        <h1 className="font-display text-[44px] text-ink uppercase leading-[44px] md:text-display-sm md:leading-[52px]">
          {day.event.title}
        </h1>
      </header>
      {day.cancelled ? (
        <p className="rounded-[20px] bg-orange-soft p-[18px] text-orange-deep text-sm leading-5">
          This session was cancelled.
        </p>
      ) : (
        <StatusCard day={day} row={row} timeZone={timeZone} />
      )}
      <dl className="flex flex-col">
        {row?.checkInAt ? (
          <FactRow label="Checked in">
            {howLine(
              row,
              localTime(new Date(row.checkInAt), timeZone),
              row.checkInDistanceM
            )}
          </FactRow>
        ) : null}
        {row?.checkOutAt ? (
          <FactRow label="Checked out">
            {howLine(
              row,
              localTime(new Date(row.checkOutAt), timeZone),
              row.checkOutDistanceM
            )}
          </FactRow>
        ) : null}
        {day.event.location ? (
          <FactRow label="Where">{day.event.location}</FactRow>
        ) : null}
        {day.coachName ? (
          <FactRow label="Coach">{day.coachName}</FactRow>
        ) : null}
        <FactRow label="Team">{day.teamName ?? "Whole academy"}</FactRow>
      </dl>
      <p className="text-muted text-sm leading-5">
        Something wrong? Ask {coach}. Only a coach can change your attendance.
      </p>
      <Link
        className="self-start font-semibold text-ink text-sm leading-[18px] underline underline-offset-2"
        params={{ eventId: day.event.id }}
        search={{ date: day.date }}
        to="/student/events/$eventId"
      >
        See the event
      </Link>
    </div>
  );
}
