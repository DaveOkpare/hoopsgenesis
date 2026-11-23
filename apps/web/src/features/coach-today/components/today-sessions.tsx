import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { PhoneSmallIcon } from "@/components/coach/coach-icons";
import { ArrowRightIcon } from "@/components/icons";
import {
  opensAtLabel,
  sessionCounts,
  sessionTimes,
  sessionTitle,
} from "@/features/sessions/model";
import type { Session } from "@/features/sessions/queries";
import type { Id } from "@/features/types";

const PERCENT = 100;

/** The next session that hasn't opened yet and takes attendance ("check-in opens 15:30"). */
export function nextToOpen(sessions: Session[]): Session | undefined {
  return sessions.find(
    (s) => s.status === "upcoming" && s.event.collectAttendance
  );
}

/** "Court 1 · 14 of 16 checked in · 2 absent" and friends. */
export function sessionLine(
  session: Session,
  viewerId: Id,
  isNext: boolean
): string {
  const parts: string[] = [];
  if (session.event.location) {
    parts.push(session.event.location);
  }
  if (session.status === "cancelled") {
    parts.push("Cancelled");
    if (session.cancelReason) {
      parts.push(session.cancelReason);
    }
    return parts.join(" · ");
  }
  if (!session.event.collectAttendance) {
    return parts.join(" · ");
  }
  const counts = sessionCounts(session, viewerId);
  if (session.status === "upcoming") {
    parts.push(`${counts.total} students`);
    if (isNext) {
      parts.push(`check-in opens ${opensAtLabel(session)}`);
    }
    return parts.join(" · ");
  }
  parts.push(`${counts.arrived} of ${counts.total} checked in`);
  if (session.status === "closed") {
    if (counts.markedAbsent > 0) {
      parts.push(`${counts.markedAbsent} absent`);
    } else if (counts.remaining > 0) {
      parts.push(`${counts.remaining} not marked`);
    }
  }
  return parts.join(" · ");
}

function sessionLink(session: Session, at: string | undefined) {
  return {
    to: "/coach/sessions/$eventId" as const,
    params: { eventId: session.event.id },
    search: { at },
  };
}

/** Phone: the ink "LIVE NOW" card pinned at the top (3MZ-0). */
export function LiveSessionCard({
  session,
  viewerId,
  at,
}: {
  session: Session;
  viewerId: Id;
  at?: string;
}) {
  const counts = sessionCounts(session, viewerId);
  const share = (counts.arrived / Math.max(1, counts.total)) * PERCENT;
  return (
    <section
      aria-label="Live now"
      className="flex flex-col gap-4 rounded-lg bg-ink p-5 text-white md:hidden"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-[6px] rounded-full bg-orange px-[10px] py-1 font-bold text-[12px] text-ink leading-4 tracking-[0.06em]">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-ink" />
          LIVE NOW
        </span>
        <span className="text-[#BDBDBD] text-sm leading-[18px]">
          {sessionTimes(session)}
        </span>
      </div>
      <div className="flex flex-col gap-[2px]">
        <h2 className="font-display text-[34px] uppercase leading-none">
          {sessionTitle(session)}
        </h2>
        <p className="text-[#BDBDBD] text-sm leading-[18px]">
          {[session.event.location, session.academyName]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between">
          <p className="font-semibold text-[15px] leading-[18px]">
            {counts.arrived} of {counts.total} checked in
          </p>
          <p className="text-[#BDBDBD] text-sm leading-[18px]">
            {counts.ticked} ticked
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-2 w-full overflow-hidden rounded-full bg-[#2E2E2E]"
        >
          <span
            className="h-2 rounded-full bg-white"
            style={{ width: `${share}%` }}
          />
        </span>
      </div>
      <Link
        className={cn(
          buttonVariants({ variant: "inverse" }),
          "w-full p-[14px]"
        )}
        {...sessionLink(session, at)}
      >
        Open session
        <ArrowRightIcon className="size-4" />
      </Link>
    </section>
  );
}

/** Phone: "Later today" / "Earlier today" rows (time column + title + line). */
export function PhoneSessionList({
  label,
  sessions,
  viewerId,
  next,
  at,
}: {
  label: string;
  sessions: Session[];
  viewerId: Id;
  next: Session | undefined;
  at?: string;
}) {
  if (sessions.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col md:hidden">
      <h2 className="pb-[6px] font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
        {label}
      </h2>
      <ul className="flex flex-col">
        {sessions.map((session) => (
          <li
            className="border-line border-b last:border-b-0"
            key={session.event.id}
          >
            <Link
              className="flex gap-[14px] py-[14px] outline-none focus-visible:bg-fog"
              {...sessionLink(session, at)}
            >
              <span className="flex w-[52px] shrink-0 flex-col">
                <span className="font-semibold text-[15px] text-ink leading-[18px]">
                  {session.event.startTime}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  {session.event.endTime}
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span
                  className={cn(
                    "font-semibold text-[15px] text-ink leading-[18px]",
                    session.status === "cancelled" && "text-muted line-through"
                  )}
                >
                  {sessionTitle(session)}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  {sessionLine(session, viewerId, session === next)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DesktopAction({
  session,
  isNext,
  at,
}: {
  session: Session;
  isNext: boolean;
  at?: string;
}) {
  const outline = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "px-[14px] py-2"
  );
  if (session.status === "cancelled") {
    return (
      <span className="shrink-0 rounded-full bg-orange-soft px-3 py-2 font-semibold text-[13px] text-orange-deep leading-4">
        Cancelled
      </span>
    );
  }
  if (session.status === "closed") {
    return (
      <Link className={outline} {...sessionLink(session, at)}>
        Attendance
      </Link>
    );
  }
  if (session.status === "open") {
    return (
      <Link className={outline} {...sessionLink(session, at)}>
        Check-ins
      </Link>
    );
  }
  if (isNext) {
    // Spec 5OE-0: live check-ins are best on the phone; the web nudges, never blocks.
    return (
      <Link
        className="flex shrink-0 items-center gap-[6px] rounded-full bg-fog px-3 py-2 font-medium text-[13px] text-ink-soft leading-4 outline-none hover:bg-stone/60 focus-visible:ring-2 focus-visible:ring-ink"
        {...sessionLink(session, at)}
      >
        <PhoneSmallIcon />
        Live check-ins on the app
      </Link>
    );
  }
  return (
    <Link className={outline} {...sessionLink(session, at)}>
      Edit
    </Link>
  );
}

/** Desktop: "Your sessions today" card (4QT-0). */
export function SessionsCard({
  sessions,
  viewerId,
  at,
  loading,
}: {
  sessions: Session[];
  viewerId: Id;
  at?: string;
  loading: boolean;
}) {
  const next = nextToOpen(sessions);
  return (
    <section className="flex min-w-0 grow-[1.3] basis-0 flex-col gap-1 rounded-lg border border-line p-6">
      <div className="flex items-center justify-between pb-3">
        <h2 className="font-semibold text-ink text-lg leading-6">
          Your sessions today
        </h2>
        <Link
          className="rounded-sm font-medium text-ink text-sm leading-[18px] underline decoration-1 underline-offset-[3px] outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
          to="/coach/calendar"
        >
          Calendar
        </Link>
      </div>
      {loading ? (
        <div className="flex flex-col gap-3 border-line border-t pt-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : null}
      {!loading && sessions.length === 0 ? (
        <p className="border-line border-t pt-4 text-[15px] text-muted leading-5">
          No sessions today.
        </p>
      ) : null}
      <ul className="flex flex-col">
        {sessions.map((session) => (
          <li
            className="flex items-center gap-5 border-line border-t py-4 last:pb-0"
            key={session.event.id}
          >
            <span className="flex w-14 shrink-0 flex-col">
              <span className="font-semibold text-[15px] text-ink leading-5">
                {session.event.startTime}
              </span>
              <span className="text-[13px] text-muted leading-4">
                {session.event.endTime}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <span
                className={cn(
                  "font-semibold text-[15px] text-ink leading-5",
                  session.status === "cancelled" && "text-muted line-through"
                )}
              >
                {sessionTitle(session)}
              </span>
              <span className="text-[13px] text-muted leading-4">
                {sessionLine(session, viewerId, session === next)}
              </span>
            </span>
            <DesktopAction
              at={at}
              isNext={session === next}
              session={session}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
