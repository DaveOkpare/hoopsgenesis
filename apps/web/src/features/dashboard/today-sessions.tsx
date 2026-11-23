import { Card, CardHeader, CardTitle } from "@hoops-genesis/ui/components/card";
import { Link } from "@tanstack/react-router";

import { minutesBefore } from "@/features/dashboard/format";
import type { TodaySession } from "@/features/dashboard/queries";

const CHECK_IN_OPENS_BEFORE_MIN = 30;

function sessionTitle(session: TodaySession): string {
  return session.teamName
    ? `${session.teamName} · ${session.title}`
    : session.title;
}

function sessionDetail(session: TodaySession): string {
  if (!session.collectAttendance) {
    return `${session.teamName ? "Team" : "Academy-wide"} · No attendance`;
  }
  const parts: string[] = [];
  if (session.rosterSize !== null) {
    parts.push(`${session.rosterSize} students`);
  }
  if (session.location) {
    parts.push(session.location);
  }
  if (session.startTime) {
    parts.push(
      `Check-in opens ${minutesBefore(session.startTime, CHECK_IN_OPENS_BEFORE_MIN)}`
    );
  }
  return parts.join(" · ");
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-[6px] rounded-full bg-orange px-[9px] py-[3px]">
      <span aria-hidden="true" className="size-[6px] rounded-full bg-ink" />
      <span className="font-bold text-[12px] text-ink leading-4 tracking-[0.06em]">
        LIVE
      </span>
    </span>
  );
}

function SessionRow({ session }: { session: TodaySession }) {
  const progress =
    session.live && session.checkedIn !== null && session.rosterSize
      ? Math.round((session.checkedIn / session.rosterSize) * 100)
      : null;
  return (
    <li className="flex gap-[14px] border-[#2E2E2E] border-t py-[14px] last:pb-0">
      <span className="flex w-14 shrink-0 flex-col">
        <span className="font-semibold text-[15px] text-white leading-[18px]">
          {session.startTime ?? "All day"}
        </span>
        {session.endTime ? (
          <span className="text-[#8C8C8C] text-[13px] leading-4">
            {session.endTime}
          </span>
        ) : null}
      </span>
      <span
        className={`flex min-w-0 flex-1 flex-col ${session.live ? "gap-2" : "gap-1"}`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[15px] text-white leading-[18px]">
            {sessionTitle(session)}
          </span>
          {session.live ? <LiveBadge /> : null}
        </span>
        {progress === null ? null : (
          <span
            aria-label={`${session.checkedIn} of ${session.rosterSize} checked in`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="flex h-[6px] w-full rounded-full bg-[#2E2E2E]"
            role="progressbar"
          >
            <span
              className="h-[6px] rounded-full bg-white"
              style={{ width: `${progress}%` }}
            />
          </span>
        )}
        <span className="text-[#BDBDBD] text-[13px] leading-4">
          {session.live && session.checkedIn !== null
            ? `${session.checkedIn} of ${session.rosterSize} checked in · ${session.location ?? ""}`
            : sessionDetail(session)}
        </span>
      </span>
    </li>
  );
}

/** "Today's sessions" ink card (desktop YA-0). */
export function TodaySessionsCard({ sessions }: { sessions: TodaySession[] }) {
  return (
    <Card className="min-w-0 flex-[1_1_0%]" variant="ink">
      <CardHeader>
        <CardTitle>Today’s sessions</CardTitle>
        <Link
          className="font-medium text-[#BDBDBD] text-sm leading-[18px] underline decoration-1 underline-offset-[3px] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white"
          to="/admin/calendar"
        >
          Calendar
        </Link>
      </CardHeader>
      {sessions.length === 0 ? (
        <p className="border-[#2E2E2E] border-t pt-[14px] text-[#BDBDBD] text-sm leading-[18px]">
          No sessions today.
        </p>
      ) : (
        <ul className="flex flex-col">
          {sessions.map((session) => (
            <SessionRow key={session.eventId} session={session} />
          ))}
        </ul>
      )}
    </Card>
  );
}
