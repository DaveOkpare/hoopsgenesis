import { Button } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type MouseEvent, useCallback } from "react";
import { toast } from "sonner";

import { PhoneOnlyNotice } from "@/components/app-shell/phone-nudge-card";
import { BackIcon, DotsIcon } from "@/components/coach/coach-icons";
import {
  circleButtonClass,
  PhoneNavRow,
} from "@/components/coach/phone-nav-row";
import { CancelDialog } from "@/features/sessions/components/cancel-dialog";
import { CheckInDialog } from "@/features/sessions/components/check-in-dialog";
import {
  MoreTickedRow,
  RosterGroupLabel,
  RosterRow,
  TickControl,
  useCollapsedTicked,
} from "@/features/sessions/components/roster";
import {
  checkInDescription,
  closesAtLabel,
  groupSession,
  opensAtLabel,
  type SessionCounts,
  sessionCounts,
  sessionErrorMessage,
  sessionTimes,
  sessionTitle,
} from "@/features/sessions/model";
import {
  asOfKey,
  type Session,
  type SessionAcademy,
  type SessionEntry,
  sessionQueryOptions,
  useCheckOutAttendance,
  useRecordAttendance,
  useUnverifyAttendance,
  useVerifyAttendance,
} from "@/features/sessions/queries";
import { formatWeekdayDayMonth } from "@/features/sessions/time";
import type { DateOnly, Id } from "@/features/types";
import { isUiPreview } from "@/lib/preview";

export type SessionSheet = "check-in" | "cancel";

interface SessionScreenProps {
  academy: SessionAcademy;
  date?: DateOnly;
  eventId: Id;
  now: Date;
  onCancelled: (scope: "day" | "series") => void;
  onCloseSheet: () => void;
  onOpenSheet: (sheet: SessionSheet, studentId?: Id) => void;
  sheet?: SessionSheet;
  studentId?: Id;
  viewerId: Id;
}

const PERCENT = 100;

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
  trigger,
}: {
  session: Session;
  onCancel: () => void;
  trigger: "circle" | "outline";
}) {
  const hasCheckIns = session.roster.some((e) => e.attendance);
  const canCancel =
    !hasCheckIns &&
    (session.status === "upcoming" || session.status === "open");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Session actions"
        className={trigger === "circle" ? circleButtonClass : undefined}
        render={
          trigger === "outline" ? (
            <Button size="icon" variant="outline" />
          ) : undefined
        }
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

function SessionAction({
  session,
  counts,
  pending,
  onTickAll,
  onMarkAbsent,
}: {
  session: Session;
  counts: SessionCounts;
  pending: boolean;
  onTickAll: () => void;
  onMarkAbsent: () => void;
}) {
  if (session.status === "closed" && counts.remaining > 0) {
    return (
      <Button
        className="w-full p-[13px]"
        disabled={pending}
        onClick={onMarkAbsent}
        variant="brand"
      >
        Mark {counts.remaining} remaining as absent
      </Button>
    );
  }
  if (session.status === "open" && counts.unticked > 0) {
    // Ticking is a phone job; the web shows check-ins view only.
    return (
      <Button
        className="w-full p-[13px] md:hidden"
        disabled={pending}
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
  onToggleTick,
  onCheckOut,
}: {
  session: Session;
  entries: SessionEntry[];
  viewerId: Id;
  pendingIds: Set<Id>;
  onToggleTick: (event: MouseEvent<HTMLButtonElement>) => void;
  onCheckOut: (event: MouseEvent<HTMLButtonElement>) => void;
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
                <span className="flex shrink-0 items-center gap-2">
                  {/* Check out by hand (POST /attendance/:id/check-out). Not in the
                      designs, so preview keeps the rows as drawn. */}
                  {row?.checkInAt && !isUiPreview ? (
                    <Button
                      data-attendance-id={row.id}
                      data-student-name={entry.student.name}
                      disabled={pendingIds.has(row.id)}
                      onClick={onCheckOut}
                      size="xs"
                      variant="ghost"
                    >
                      Check out
                    </Button>
                  ) : null}
                  <TickToggle
                    canUntick={session.status === "open"}
                    entry={entry}
                    onToggle={onToggleTick}
                    pending={Boolean(row && pendingIds.has(row.id))}
                    ticked={ticked}
                  />
                </span>
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

/** Wraps TickControl so each row passes a stable handler with its id in data-*. */
function TickToggle({
  entry,
  ticked,
  canUntick,
  pending,
  onToggle,
}: {
  entry: SessionEntry;
  ticked: boolean;
  canUntick: boolean;
  pending: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <span
      className="contents"
      data-attendance-id={entry.attendance?.id}
      data-ticked={ticked}
    >
      <TickControl
        canUntick={canUntick}
        name={entry.student.name}
        onToggle={onToggle}
        pending={pending}
        ticked={ticked}
      />
    </span>
  );
}

function NotYetGroup({
  session,
  entries,
  onCheckIn,
  onExcuse,
  pending,
}: {
  session: Session;
  entries: SessionEntry[];
  onCheckIn: (event: MouseEvent<HTMLButtonElement>) => void;
  onExcuse: (event: MouseEvent<HTMLButtonElement>) => void;
  pending: boolean;
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
          let action: React.ReactNode = null;
          if (session.status === "open") {
            action = (
              <Button
                data-student-id={entry.student.id}
                onClick={onCheckIn}
                size="sm"
                variant="outline"
              >
                Check in
              </Button>
            );
          } else if (closed) {
            action = (
              <Button
                data-student-id={entry.student.id}
                disabled={pending}
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

function SessionMissing() {
  return (
    <div className="flex flex-col items-start gap-4">
      <PageTitle>Session not found</PageTitle>
      <p className="text-[15px] text-muted leading-5">
        It may have been cancelled or deleted.
      </p>
      <Button render={<Link to="/coach" />} variant="outline">
        Back to Today
      </Button>
    </div>
  );
}

/** Live check-ins (3O4-0), close out (5IC-0) and their sheets (3WI-0, 5KW-0). */
export function SessionScreen(props: SessionScreenProps) {
  const { academy, eventId, date, now } = props;
  const asOf = asOfKey(now);
  const query = useQuery(sessionQueryOptions(academy, eventId, date, asOf));
  const { data } = query;
  if (data === undefined) {
    return <SessionSkeleton />;
  }
  if (data === null) {
    return <SessionMissing />;
  }
  return <SessionView {...props} session={data} />;
}

function SessionView({
  session,
  academy,
  viewerId,
  now,
  sheet,
  studentId,
  onOpenSheet,
  onCloseSheet,
  onCancelled,
}: SessionScreenProps & { session: Session }) {
  const groups = groupSession(session);
  const counts = sessionCounts(session, viewerId);
  const academyId = academy.id;
  const verify = useVerifyAttendance(academyId);
  const checkOut = useCheckOutAttendance(academyId);
  const unverify = useUnverifyAttendance(academyId);
  const record = useRecordAttendance(academyId);
  const asOf = asOfKey(now);

  const pendingIds = new Set<Id>();
  if (verify.isPending && verify.variables) {
    for (const id of verify.variables.ids) {
      pendingIds.add(id);
    }
  }
  if (unverify.isPending && unverify.variables) {
    pendingIds.add(unverify.variables.id);
  }
  if (checkOut.isPending && checkOut.variables) {
    pendingIds.add(checkOut.variables.id);
  }

  const { mutate: verifyMutate } = verify;
  const { mutate: unverifyMutate } = unverify;
  const { mutate: recordMutate } = record;
  const { mutate: checkOutMutate } = checkOut;

  const handleCheckOut = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.attendanceId;
      const name = event.currentTarget.dataset.studentName;
      if (!id) {
        return;
      }
      checkOutMutate(
        { id },
        {
          onSuccess: () => toast.success(`${name ?? "Student"} checked out`),
          onError: (error) => toast.error(sessionErrorMessage(error)),
        }
      );
    },
    [checkOutMutate]
  );

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
        onSuccess: (rows) => toast.success(`${rows.length} marked absent`),
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
  const handleOpenCancel = useCallback(
    () => onOpenSheet("cancel"),
    [onOpenSheet]
  );

  const checkInEntry =
    sheet === "check-in"
      ? (groups.notYet.find((e) => e.student.id === studentId) ?? null)
      : null;
  const title = sessionTitle(session);
  const subtitle = [sessionTimes(session), session.event.location]
    .filter(Boolean)
    .join(" · ");
  const actionPending = verify.isPending || record.isPending;
  return (
    <div className="flex flex-col gap-5 md:gap-7">
      <PhoneNavRow
        center={<StatusBadge session={session} />}
        leading={
          <Link
            aria-label="Back to Today"
            className={circleButtonClass}
            to="/coach"
          >
            <BackIcon />
          </Link>
        }
        trailing={
          <SessionMenu
            onCancel={handleOpenCancel}
            session={session}
            trigger="circle"
          />
        }
      />

      <div className="flex flex-col gap-3 max-md:hidden">
        <Link
          className="flex w-fit items-center gap-1 rounded-sm font-medium text-ink-soft text-sm leading-[18px] outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink"
          to="/coach"
        >
          <BackIcon size={14} />
          Today
        </Link>
        <PageHeader>
          <PageHeading>
            <Eyebrow>
              {formatWeekdayDayMonth(session.sessionDate)} · {subtitle}
            </Eyebrow>
            <PageTitle>{title}</PageTitle>
          </PageHeading>
          <PageActions className="items-center">
            <StatusBadge session={session} />
            <SessionMenu
              onCancel={handleOpenCancel}
              session={session}
              trigger="outline"
            />
          </PageActions>
        </PageHeader>
      </div>

      {session.status === "cancelled" ? (
        <p className="rounded-[14px] bg-orange-soft px-4 py-3 text-orange-deep text-sm leading-[19px]">
          This session is cancelled
          {session.cancelReason ? ` (${session.cancelReason})` : ""}. Students
          on {session.team?.name ?? "the team"} were notified.
        </p>
      ) : null}

      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-col gap-5 md:flex-1 md:rounded-lg md:border md:border-line md:p-6">
          <div className="flex flex-col gap-3 md:hidden">
            <div className="flex flex-col">
              <h1 className="font-display text-[36px] text-ink uppercase leading-none">
                {title}
              </h1>
              <p className="text-muted text-sm leading-[18px]">{subtitle}</p>
            </div>
            <SessionProgress counts={counts} session={session} />
            <SessionAction
              counts={counts}
              onMarkAbsent={handleMarkAbsent}
              onTickAll={handleTickAll}
              pending={actionPending}
              session={session}
            />
          </div>
          <CheckedInGroup
            entries={groups.checkedIn}
            onCheckOut={handleCheckOut}
            onToggleTick={handleToggleTick}
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
            entries={groups.notYet}
            onCheckIn={handleCheckIn}
            onExcuse={handleExcuse}
            pending={record.isPending}
            session={session}
          />
          <SimpleGroup
            entries={groups.absentOrExcused}
            label="Absent or excused"
            session={session}
            viewerId={viewerId}
          />
        </div>

        <aside className="flex w-[380px] shrink-0 flex-col gap-5 max-md:hidden max-lg:w-[320px]">
          <div className="flex flex-col gap-4 rounded-lg bg-fog p-5">
            <SessionProgress counts={counts} session={session} />
            <SessionAction
              counts={counts}
              onMarkAbsent={handleMarkAbsent}
              onTickAll={handleTickAll}
              pending={actionPending}
              session={session}
            />
          </div>
          {session.status === "open" ? (
            <PhoneOnlyNotice
              description="Ticking students you can see works best in the app. Here you can watch check-ins come in."
              title="Tick on your phone"
              tone="light"
            />
          ) : null}
        </aside>
      </div>

      <CheckInDialog
        academyId={academyId}
        entry={checkInEntry}
        now={now}
        onClose={onCloseSheet}
        session={session}
      />
      <CancelDialog
        academyId={academyId}
        onCancelled={onCancelled}
        onClose={onCloseSheet}
        open={sheet === "cancel"}
        session={session}
      />
    </div>
  );
}
