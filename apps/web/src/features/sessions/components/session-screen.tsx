import { Button } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type MouseEvent, type ReactNode, useCallback } from "react";
import { toast } from "sonner";

import { BackIcon, DotsIcon } from "@/components/coach/coach-icons";
import {
  circleButtonClass,
  PhoneNavRow,
} from "@/components/coach/phone-nav-row";
import { ErrorState } from "@/components/error-state";
import { canManageEvent } from "@/features/events/components/event-detail-screen";
import { CancelDialog } from "@/features/sessions/components/cancel-dialog";
import { ChangeDialog } from "@/features/sessions/components/change-dialog";
import { CheckInDialog } from "@/features/sessions/components/check-in-dialog";
import {
  MoreTickedRow,
  RosterGroupLabel,
  RosterRow,
  TickControl,
  useCollapsedTicked,
} from "@/features/sessions/components/roster";
import {
  reviewTitle,
  rowActions,
  type SessionActions,
  SessionWebLive,
  SessionWebReview,
} from "@/features/sessions/components/session-web";
import {
  checkInDescription,
  closedOutBy,
  closesAtLabel,
  groupSession,
  isClosedOut,
  opensAtLabel,
  personLabel,
  reviewLine,
  type SessionCounts,
  sessionCounts,
  sessionErrorMessage,
  sessionTimes,
  sessionTitle,
  statusTally,
} from "@/features/sessions/model";
import {
  asOfKey,
  type Session,
  type SessionAcademy,
  type SessionEntry,
  sessionQueryOptions,
  useRecordAttendance,
  useUnverifyAttendance,
  useVerifyAttendance,
} from "@/features/sessions/queries";
import { formatWeekdayDayMonth } from "@/features/sessions/time";
import type { DateOnly, Id } from "@/features/types";
import type { Membership } from "@/features/viewer/api";
import { ApiError } from "@/lib/api-client";
import { initials } from "@/lib/format";

export type SessionSheet = "check-in" | "cancel" | "change";
export type SessionRole = "admin" | "coach";

interface SessionScreenProps {
  academy: SessionAcademy;
  date?: DateOnly;
  eventId: Id;
  membership: Membership;
  now: Date;
  onCancelled: (scope: "day" | "series") => void;
  onCloseSheet: () => void;
  onOpenSheet: (sheet: SessionSheet, studentId?: Id) => void;
  onQuery: (query: string) => void;
  query: string;
  sessionRole: SessionRole;
  sheet?: SessionSheet;
  studentId?: Id;
  viewerId: Id;
}

const PERCENT = 100;

/** Where "back" leads: Today while it is live for a coach, else the event page. */
function BackTarget({
  session,
  sessionRole,
  variant,
}: {
  session: Session;
  sessionRole: SessionRole;
  variant: "circle" | "text" | "phone-text";
}) {
  const live = session.status === "open" || session.status === "upcoming";
  const toToday = sessionRole === "coach" && live;
  const label = toToday ? "Today" : session.event.title;
  const params = { eventId: session.event.id };
  const icon =
    variant === "circle" ? (
      <BackIcon />
    ) : (
      <BackIcon size={variant === "text" ? 14 : 16} />
    );
  const className = cn(
    variant === "circle"
      ? circleButtonClass
      : "flex w-fit items-center gap-[6px] rounded-sm font-medium text-[15px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink",
    variant === "text" && "text-muted hover:text-ink",
    variant === "phone-text" && "min-h-11 gap-1 text-ink"
  );
  const content =
    variant === "circle" ? (
      icon
    ) : (
      <>
        {icon}
        {label}
      </>
    );
  const aria = variant === "circle" ? `Back to ${label}` : undefined;
  if (toToday) {
    return (
      <Link aria-label={aria} className={className} to="/coach">
        {content}
      </Link>
    );
  }
  return sessionRole === "admin" ? (
    <Link
      aria-label={aria}
      className={className}
      params={params}
      to="/admin/events/$eventId"
    >
      {content}
    </Link>
  ) : (
    <Link
      aria-label={aria}
      className={className}
      params={params}
      to="/coach/events/$eventId"
    >
      {content}
    </Link>
  );
}

function StatusBadge({ session }: { session: Session }) {
  const base =
    "inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 font-bold text-[12px] uppercase leading-4 tracking-[0.06em]";
  switch (session.status) {
    case "open":
      return (
        <span className={cn(base, "bg-orange text-ink")}>
          <span aria-hidden="true" className="size-[6px] rounded-full bg-ink" />
          Live · closes {closesAtLabel(session)}
        </span>
      );
    case "closed":
      return (
        <span className={cn(base, "bg-ink text-white")}>
          Closed at {closesAtLabel(session)}
        </span>
      );
    case "cancelled":
      return (
        <span className={cn(base, "bg-orange-soft text-orange-deep")}>
          Cancelled
        </span>
      );
    default:
      return (
        <span className={cn(base, "bg-fog text-ink")}>
          Opens {opensAtLabel(session)}
        </span>
      );
  }
}

function SessionMenu({
  session,
  onCancel,
}: {
  session: Session;
  onCancel: () => void;
}) {
  const hasCheckIns = session.roster.some((e) => e.attendance);
  const canCancel =
    !hasCheckIns &&
    (session.status === "upcoming" || session.status === "open");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Session actions"
        className={circleButtonClass}
      >
        <DotsIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!canCancel}
          onClick={onCancel}
          variant="destructive"
        >
          {hasCheckIns
            ? "Can't cancel: students have checked in"
            : "Cancel this session"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "11 of 16 checked in · 9 ticked by you" and the two-tone bar. */
function SessionProgress({
  session,
  counts,
}: {
  session: Session;
  counts: SessionCounts;
}) {
  const closed = session.status === "closed";
  const total = Math.max(1, counts.total);
  const solid = closed ? counts.arrived : counts.ticked;
  const grey = closed ? 0 : counts.unticked;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-3">
        <p className="font-semibold text-[15px] text-ink leading-[18px]">
          {counts.arrived} of {counts.total} checked in
        </p>
        <p className="text-muted text-sm leading-[18px]">
          {counts.tickedByViewer} ticked by you
        </p>
      </div>
      <div
        aria-label={`${counts.arrived} of ${counts.total} checked in, ${counts.ticked} ticked`}
        className="flex h-2 w-full overflow-hidden rounded-full bg-line"
        role="img"
      >
        <span
          className="h-2 bg-ink"
          style={{ width: `${(solid / total) * PERCENT}%` }}
        />
        <span
          className="h-2 bg-[#9A9A9A]"
          style={{ width: `${(grey / total) * PERCENT}%` }}
        />
      </div>
    </div>
  );
}

function PhoneAction({
  session,
  counts,
  actions,
  onTickAll,
}: {
  session: Session;
  counts: SessionCounts;
  actions: SessionActions;
  onTickAll: () => void;
}) {
  if (!actions.canManage) {
    return null;
  }
  if (session.status === "closed" && counts.remaining > 0) {
    return (
      <Button
        className="w-full p-[13px]"
        disabled={actions.pending}
        onClick={actions.onMarkAbsent}
        variant="brand"
      >
        Mark {counts.remaining} remaining as absent
      </Button>
    );
  }
  if (session.status === "open" && counts.unticked > 0) {
    return (
      <Button
        className="w-full p-[13px]"
        disabled={actions.pending}
        onClick={onTickAll}
      >
        Tick all checked in ({counts.unticked})
      </Button>
    );
  }
  return null;
}

function CheckedInGroup({
  session,
  entries,
  viewerId,
  pendingIds,
  canManage,
  onToggleTick,
}: {
  session: Session;
  entries: SessionEntry[];
  viewerId: Id;
  pendingIds: Set<Id>;
  canManage: boolean;
  onToggleTick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { visible, hiddenCount, expanded, toggle } =
    useCollapsedTicked(entries);
  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col">
      <RosterGroupLabel>Checked in · {entries.length}</RosterGroupLabel>
      <ul className="flex flex-col">
        {visible.map((entry) => {
          const row = entry.attendance;
          const ticked = Boolean(row?.verifiedAt);
          return (
            <RosterRow
              description={checkInDescription(entry, session, viewerId)}
              entry={entry}
              key={entry.student.id}
              trailing={
                canManage ? (
                  <span
                    className="contents"
                    data-attendance-id={row?.id}
                    data-ticked={ticked}
                  >
                    <TickControl
                      canUntick={session.status === "open"}
                      name={entry.student.name}
                      onToggle={onToggleTick}
                      pending={Boolean(row && pendingIds.has(row.id))}
                      ticked={ticked}
                    />
                  </span>
                ) : null
              }
            />
          );
        })}
      </ul>
      <MoreTickedRow
        count={hiddenCount}
        expanded={expanded}
        onToggle={toggle}
      />
    </section>
  );
}

function NotYetGroup({
  session,
  entries,
  actions,
  onExcuse,
}: {
  session: Session;
  entries: SessionEntry[];
  actions: SessionActions;
  onExcuse: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  if (entries.length === 0) {
    return null;
  }
  const closed = session.status === "closed";
  let description = "No scan yet";
  if (closed) {
    description = "No scan · window closed";
  } else if (session.status === "upcoming") {
    description = `Check-in opens ${opensAtLabel(session)}`;
  } else if (session.status === "cancelled") {
    description = "Session cancelled";
  }
  return (
    <section className="flex flex-col">
      <RosterGroupLabel>
        {closed ? "Never checked in" : "Not yet"} · {entries.length}
      </RosterGroupLabel>
      <ul className="flex flex-col">
        {entries.map((entry) => {
          let action: ReactNode = null;
          if (actions.canManage && session.status === "open") {
            action = (
              <Button
                data-student-id={entry.student.id}
                onClick={actions.onCheckIn}
                size="sm"
                variant="outline"
              >
                Check in
              </Button>
            );
          } else if (actions.canManage && closed) {
            action = (
              <Button
                data-student-id={entry.student.id}
                disabled={actions.pending}
                onClick={onExcuse}
                size="sm"
                variant="outline"
              >
                Excused
              </Button>
            );
          }
          return (
            <RosterRow
              description={description}
              entry={entry}
              key={entry.student.id}
              muted
              trailing={action}
            />
          );
        })}
      </ul>
    </section>
  );
}

function describeDone(entry: SessionEntry, session: Session, viewerId: Id) {
  const row = entry.attendance;
  if (row?.status === "excused") {
    return row.notes ? `Excused · ${row.notes}` : "Excused";
  }
  if (row?.status === "absent") {
    return "Marked absent";
  }
  return checkInDescription(entry, session, viewerId) || "Checked out";
}

function SimpleGroup({
  label,
  entries,
  session,
  viewerId,
}: {
  label: string;
  entries: SessionEntry[];
  session: Session;
  viewerId: Id;
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col">
      <RosterGroupLabel>
        {label} · {entries.length}
      </RosterGroupLabel>
      <ul className="flex flex-col">
        {entries.map((entry) => (
          <RosterRow
            description={describeDone(entry, session, viewerId)}
            entry={entry}
            key={entry.student.id}
            muted
          />
        ))}
      </ul>
    </section>
  );
}

function SessionSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading session</span>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-2 w-full rounded-full" />
      {["a", "b", "c", "d", "e"].map((key) => (
        <div className="flex items-center gap-3" key={key}>
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-9 flex-1" />
        </div>
      ))}
    </div>
  );
}

/** Phone, live or ended but not closed out (3O4-0 live, 5IC-0 close out). */
function PhoneLive({
  session,
  sessionRole,
  counts,
  viewerId,
  pendingIds,
  actions,
  onToggleTick,
  onTickAll,
  onExcuse,
}: {
  session: Session;
  sessionRole: SessionRole;
  counts: SessionCounts;
  viewerId: Id;
  pendingIds: Set<Id>;
  actions: SessionActions;
  onToggleTick: (event: MouseEvent<HTMLButtonElement>) => void;
  onTickAll: () => void;
  onExcuse: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const groups = groupSession(session);
  const subtitle = [sessionTimes(session), session.event.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-5">
      <PhoneNavRow
        center={<StatusBadge session={session} />}
        leading={
          <BackTarget
            session={session}
            sessionRole={sessionRole}
            variant="circle"
          />
        }
        trailing={
          actions.canManage ? (
            <SessionMenu onCancel={actions.onOpenCancel} session={session} />
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          <h1 className="font-display text-[36px] text-ink uppercase leading-none">
            {sessionTitle(session)}
          </h1>
          <p className="text-muted text-sm leading-[18px]">{subtitle}</p>
        </div>
        <SessionProgress counts={counts} session={session} />
        <PhoneAction
          actions={actions}
          counts={counts}
          onTickAll={onTickAll}
          session={session}
        />
      </div>
      <CheckedInGroup
        canManage={actions.canManage}
        entries={groups.checkedIn}
        onToggleTick={onToggleTick}
        pendingIds={pendingIds}
        session={session}
        viewerId={viewerId}
      />
      <SimpleGroup
        entries={groups.checkedOut}
        label="Checked out"
        session={session}
        viewerId={viewerId}
      />
      <NotYetGroup
        actions={actions}
        entries={groups.notYet}
        onExcuse={onExcuse}
        session={session}
      />
      <SimpleGroup
        entries={groups.absentOrExcused}
        label="Absent or excused"
        session={session}
        viewerId={viewerId}
      />
    </div>
  );
}

/** Phone, closed out (GN5-0, HZE-0). */
function PhoneReview({
  session,
  sessionRole,
  viewerId,
  actions,
}: {
  session: Session;
  sessionRole: SessionRole;
  viewerId: Id;
  actions: SessionActions;
}) {
  const tally = statusTally(session);
  const closer = closedOutBy(session);
  const tiles = [
    { label: "Present", value: tally.present, className: "text-success" },
    { label: "Late", value: tally.late, className: "text-ink" },
    { label: "Absent", value: tally.absent, className: "text-ink" },
    { label: "Excused", value: tally.excused, className: "text-ink" },
  ];
  const times = session.event.startTime
    ? `${session.event.startTime} to ${session.event.endTime ?? ""}`
    : "All day";
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-[10px]">
        <BackTarget
          session={session}
          sessionRole={sessionRole}
          variant="phone-text"
        />
        <p className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label">
          {formatWeekdayDayMonth(session.sessionDate)} · {times}
        </p>
        <h1 className="font-display text-[44px] text-ink uppercase leading-[44px]">
          {reviewTitle(session)}
        </h1>
        <p className="flex items-center gap-[6px] self-start rounded-full bg-fog px-3 py-[6px] font-semibold text-[13px] text-ink leading-4">
          <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
            <path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="#111111"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          {closer
            ? `Closed out by ${personLabel(closer, viewerId)}`
            : "Closed out"}
        </p>
      </div>
      <div className="flex gap-2">
        {tiles.map((tile) => (
          <div
            className="flex flex-1 flex-col gap-[2px] rounded-[14px] bg-fog p-3"
            key={tile.label}
          >
            <span
              className={cn(
                "font-display text-[28px] leading-[30px]",
                tile.className
              )}
            >
              {tile.value}
            </span>
            <span className="text-[12px] text-muted leading-4">
              {tile.label}
            </span>
          </div>
        ))}
      </div>
      <ul className="flex flex-col">
        {session.roster.map((entry) => {
          const allowed = rowActions(entry, actions);
          return (
            <li
              className="flex items-center gap-3 border-line border-b py-[11px] last:border-b-0"
              key={entry.student.id}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fog font-semibold text-[12px] text-ink leading-4"
              >
                {initials(entry.student.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="truncate font-semibold text-[15px] text-ink leading-5">
                  {entry.student.name}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  {reviewLine(entry, session, viewerId)}
                </span>
              </span>
              {allowed.change ? (
                <Button
                  aria-label={`Change ${entry.student.name}`}
                  className="h-auto min-h-8 rounded-full px-[9px] py-1 text-[12px] leading-4"
                  data-student-id={entry.student.id}
                  onClick={actions.onChange}
                  variant="secondary"
                >
                  Change
                </Button>
              ) : null}
              {!allowed.change && allowed.tick && entry.attendance ? (
                <Button
                  className="h-auto min-h-8 rounded-full px-[9px] py-1 text-[12px] leading-4"
                  data-attendance-id={entry.attendance.id}
                  onClick={actions.onTickOne}
                  variant="secondary"
                >
                  Tick
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[13px] text-muted leading-[18px]">
        Changes after close-out go to the activity log.
      </p>
    </div>
  );
}

/** A cancelled session at any width. */
function CancelledView({
  session,
  sessionRole,
}: {
  session: Session;
  sessionRole: SessionRole;
}) {
  return (
    <div className="flex flex-col gap-6 max-md:gap-[18px]">
      <div className="flex flex-col gap-[10px]">
        <span className="max-md:hidden">
          <BackTarget
            session={session}
            sessionRole={sessionRole}
            variant="text"
          />
        </span>
        <span className="md:hidden">
          <BackTarget
            session={session}
            sessionRole={sessionRole}
            variant="phone-text"
          />
        </span>
        <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label">
          {formatWeekdayDayMonth(session.sessionDate)} · {sessionTimes(session)}
        </p>
        <h1 className="font-display text-display-sm text-muted uppercase leading-[95%] line-through decoration-1 max-md:text-[44px] max-md:leading-[44px]">
          {sessionTitle(session)}
        </h1>
      </div>
      <p className="max-w-[692px] rounded-[20px] bg-orange-soft p-[18px] text-orange-deep text-sm leading-5">
        This session is cancelled
        {session.cancelReason ? ` (${session.cancelReason})` : ""}. It shows
        struck through on the calendar.
      </p>
    </div>
  );
}

/**
 * One session for academy admins and coaches, every state at every width:
 * phone 3O4-0 (live), 5IC-0 (ended), GN5-0 / HZE-0 (closed out), sheets 3WI-0, 5KW-0;
 * web 91C-0 (live or still to come), GFQ-0 / HRK-0 (ended, closed out or not).
 */
export function SessionScreen(props: SessionScreenProps) {
  const { academy, eventId, date, now } = props;
  const asOf = asOfKey(now);
  const query = useQuery(sessionQueryOptions(academy, eventId, date, asOf));
  const { data } = query;
  if (data === undefined) {
    return <SessionSkeleton />;
  }
  if (data === null) {
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
  return <SessionView {...props} session={data} />;
}

function SessionView({
  session,
  academy,
  membership,
  sessionRole,
  viewerId,
  now,
  sheet,
  studentId,
  query,
  onQuery,
  onOpenSheet,
  onCloseSheet,
  onCancelled,
}: SessionScreenProps & { session: Session }) {
  const groups = groupSession(session);
  const counts = sessionCounts(session, viewerId);
  const academyId = academy.id;
  const verify = useVerifyAttendance(academyId);
  const unverify = useUnverifyAttendance(academyId);
  const record = useRecordAttendance(academyId);
  const asOf = asOfKey(now);
  const canManage = canManageEvent(membership, session.event.teamId);
  const isAdmin = membership.roles.includes("admin");

  const pendingIds = new Set<Id>();
  if (verify.isPending && verify.variables) {
    for (const id of verify.variables.ids) {
      pendingIds.add(id);
    }
  }
  if (unverify.isPending && unverify.variables) {
    pendingIds.add(unverify.variables.id);
  }

  const { mutate: verifyMutate } = verify;
  const { mutate: unverifyMutate } = unverify;
  const { mutate: recordMutate } = record;

  const handleToggleTick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const holder = event.currentTarget.closest<HTMLElement>(
        "[data-attendance-id]"
      );
      const id = holder?.dataset.attendanceId;
      if (!id) {
        return;
      }
      if (holder.dataset.ticked === "true") {
        unverifyMutate(
          { id },
          { onError: (error) => toast.error(sessionErrorMessage(error)) }
        );
      } else {
        verifyMutate(
          { ids: [id], asOf },
          { onError: (error) => toast.error(sessionErrorMessage(error)) }
        );
      }
    },
    [asOf, unverifyMutate, verifyMutate]
  );

  const handleTickOne = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const id = event.currentTarget.dataset.attendanceId;
      if (!id) {
        return;
      }
      verifyMutate(
        { ids: [id], asOf },
        {
          onSuccess: () => toast.success("Ticked"),
          onError: (error) => toast.error(sessionErrorMessage(error)),
        }
      );
    },
    [asOf, verifyMutate]
  );

  const untickedIds = groups.checkedIn
    .filter((e) => e.attendance && !e.attendance.verifiedAt)
    .flatMap((e) => (e.attendance ? [e.attendance.id] : []));
  const handleTickAll = useCallback(() => {
    verifyMutate(
      { ids: untickedIds, asOf },
      {
        onSuccess: ({ ids }) => toast.success(`${ids.length} ticked`),
        onError: (error) => toast.error(sessionErrorMessage(error)),
      }
    );
  }, [asOf, untickedIds, verifyMutate]);

  const remainingIds = groups.notYet.map((e) => e.student.id);
  const handleMarkAbsent = useCallback(() => {
    recordMutate(
      {
        eventId: session.event.id,
        sessionDate: session.sessionDate,
        asOf,
        entries: remainingIds.map((id) => ({
          studentId: id,
          status: "absent" as const,
        })),
      },
      {
        onSuccess: (rows) =>
          toast.success(`${rows.length} marked absent. Session closed out.`),
        onError: (error) => toast.error(sessionErrorMessage(error)),
      }
    );
  }, [asOf, recordMutate, remainingIds, session]);

  const handleExcuse = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.studentId;
      if (!id) {
        return;
      }
      recordMutate(
        {
          eventId: session.event.id,
          sessionDate: session.sessionDate,
          asOf,
          entries: [{ studentId: id, status: "excused" }],
        },
        {
          onSuccess: () => toast.success("Marked as excused"),
          onError: (error) => toast.error(sessionErrorMessage(error)),
        }
      );
    },
    [asOf, recordMutate, session]
  );

  const handleCheckIn = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.studentId;
      if (id) {
        onOpenSheet("check-in", id);
      }
    },
    [onOpenSheet]
  );
  const handleChange = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const id = event.currentTarget.dataset.studentId;
      if (id) {
        onOpenSheet("change", id);
      }
    },
    [onOpenSheet]
  );
  const handleOpenCancel = useCallback(
    () => onOpenSheet("cancel"),
    [onOpenSheet]
  );

  const actions: SessionActions = {
    canManage,
    isAdmin,
    pending: verify.isPending || record.isPending,
    onChange: handleChange,
    onCheckIn: handleCheckIn,
    onMarkAbsent: handleMarkAbsent,
    onOpenCancel: handleOpenCancel,
    onTickOne: handleTickOne,
  };

  const checkInEntry =
    sheet === "check-in" && canManage
      ? (groups.notYet.find((e) => e.student.id === studentId) ?? null)
      : null;
  const changeEntry =
    sheet === "change"
      ? (session.roster.find(
          (e) => e.student.id === studentId && rowActions(e, actions).change
        ) ?? null)
      : null;
  const closedOut = isClosedOut(session);
  const ended = session.status === "closed";

  let phone: ReactNode;
  let web: ReactNode;
  if (session.status === "cancelled") {
    phone = <CancelledView session={session} sessionRole={sessionRole} />;
    web = phone;
  } else {
    phone = closedOut ? (
      <PhoneReview
        actions={actions}
        session={session}
        sessionRole={sessionRole}
        viewerId={viewerId}
      />
    ) : (
      <PhoneLive
        actions={actions}
        counts={counts}
        onExcuse={handleExcuse}
        onTickAll={handleTickAll}
        onToggleTick={handleToggleTick}
        pendingIds={pendingIds}
        session={session}
        sessionRole={sessionRole}
        viewerId={viewerId}
      />
    );
    const back = (
      <BackTarget session={session} sessionRole={sessionRole} variant="text" />
    );
    web = ended ? (
      <SessionWebReview
        actions={actions}
        back={back}
        session={session}
        tally={statusTally(session)}
        viewerId={viewerId}
      />
    ) : (
      <SessionWebLive
        actions={actions}
        back={back}
        checkedIn={[...groups.checkedIn, ...groups.checkedOut].sort((a, b) =>
          (a.attendance?.checkInAt ?? "").localeCompare(
            b.attendance?.checkInAt ?? ""
          )
        )}
        counts={counts}
        notYet={groups.notYet}
        onQuery={onQuery}
        query={query}
        session={session}
        viewerId={viewerId}
      />
    );
  }

  return (
    <>
      <div className="md:hidden">{phone}</div>
      <div className="max-md:hidden">{web}</div>
      <CheckInDialog
        academyId={academyId}
        entry={checkInEntry}
        now={now}
        onClose={onCloseSheet}
        session={session}
      />
      <ChangeDialog
        academyId={academyId}
        entry={changeEntry}
        now={now}
        onClose={onCloseSheet}
        session={session}
        viewerId={viewerId}
      />
      {canManage ? (
        <CancelDialog
          academyId={academyId}
          onCancelled={onCancelled}
          onClose={onCloseSheet}
          open={sheet === "cancel"}
          session={session}
        />
      ) : null}
    </>
  );
}
