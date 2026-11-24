import { Button } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type MouseEvent, useCallback, useState } from "react";

import { ErrorState } from "@/components/error-state";
import { CancelDayDialog } from "@/features/events/components/cancel-day-dialog";
import { DeleteEventDialog } from "@/features/events/components/delete-event-dialog";
import {
  BackText,
  backLinkClass,
  DateBlock,
  DetailSkeleton,
  FactRow,
  Pill,
  RowChevron,
  SectionLabel,
} from "@/features/events/components/detail-parts";
import { EditEventDialog } from "@/features/events/components/edit-event-dialog";
import {
  cancelledLine,
  coachName,
  dayMonth,
  eyebrow,
  isClosedOut,
  joinWords,
  monthAttendance,
  repeatsLabel,
  shortDate,
  splitSessions,
  timesLabel,
  whenLabel,
} from "@/features/events/model";
import {
  type EventDetail,
  type EventSessionItem,
  type EventViewer,
  eventDetailQueryOptions,
} from "@/features/events/queries";
import { localDate, localTime } from "@/features/sessions/time";
import type { DateOnly, Id } from "@/features/types";
import type { Membership } from "@/features/viewer/api";
import { ApiError } from "@/lib/api-client";

export type EventDialog = "edit" | "cancel" | "delete";
export type StaffRole = "admin" | "coach";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface EventSearch {
  /** Preview clock, "HH:mm" (dev preview only). */
  at?: string;
  /** Day to cancel, preset by a row's "Cancel day". */
  cancelDate?: string;
  /** Open dialog: edit, cancel a day, delete. */
  dialog?: EventDialog;
}

/** Search params of the admin and coach event routes. */
export function validateEventSearch(
  search: Record<string, unknown>
): EventSearch {
  const { at, cancelDate, dialog } = search;
  return {
    at: typeof at === "string" && HH_MM.test(at) ? at : undefined,
    cancelDate:
      typeof cancelDate === "string" && PLAIN_DATE.test(cancelDate)
        ? cancelDate
        : undefined,
    dialog:
      dialog === "edit" || dialog === "cancel" || dialog === "delete"
        ? dialog
        : undefined,
  };
}

/** Coming-up rows shown before "Show N more dates". */
const UPCOMING_PREVIEW = 4;

interface EventDetailScreenProps {
  cancelDate?: DateOnly;
  dialog?: EventDialog;
  eventId: Id;
  membership: Membership;
  now: Date;
  onCloseDialog: () => void;
  onDeleted: () => void;
  onOpenDialog: (dialog: EventDialog, cancelDate?: DateOnly) => void;
  staffRole: StaffRole;
  userId: Id;
}

/** May this person edit, cancel and delete the event? Mirrors events-shared.ts. */
export function canManageEvent(
  membership: Membership,
  teamId: Id | null
): boolean {
  if (membership.roles.includes("admin")) {
    return true;
  }
  return (
    teamId !== null &&
    membership.roles.includes("coach") &&
    membership.teams.some((t) => t.id === teamId)
  );
}

function SessionLink({
  role,
  session,
  className,
  children,
  label,
}: {
  role: StaffRole;
  session: EventSessionItem;
  className: string;
  children: React.ReactNode;
  label: string;
}) {
  const params = { eventId: session.eventId };
  const search = { date: session.date };
  if (role === "admin") {
    return (
      <Link
        aria-label={label}
        className={className}
        params={params}
        search={search}
        to="/admin/sessions/$eventId"
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      aria-label={label}
      className={className}
      params={params}
      search={search}
      to="/coach/sessions/$eventId"
    >
      {children}
    </Link>
  );
}

const rowLinkClass =
  "flex items-center gap-4 py-[14px] outline-none transition-colors hover:bg-fog/60 focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset max-md:gap-3 max-md:py-3";

function opensLabel(
  session: EventSessionItem,
  timeZone: string,
  now: Date
): string | null {
  if (!(session.checkInOpensAt && session.checkInClosesAt)) {
    return null;
  }
  const opens = new Date(session.checkInOpensAt);
  const closes = new Date(session.checkInClosesAt);
  if (now > closes) {
    return "Check-in closed";
  }
  return now >= opens
    ? `Check-in open until ${localTime(closes, timeZone)}`
    : `Check-in opens at ${localTime(opens, timeZone)}`;
}

function UpcomingRow({
  now,
  session,
  detail,
  role,
  today,
  canManage,
  onCancelDay,
}: {
  session: EventSessionItem;
  detail: EventDetail;
  role: StaffRole;
  today: DateOnly;
  now: Date;
  canManage: boolean;
  onCancelDay: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const times = timesLabel(session.startTime, session.endTime);
  const isToday = session.date === today;
  if (session.cancelled) {
    return (
      <li className="flex items-center gap-4 border-line border-b py-[14px] last:border-b-0 max-md:gap-3 max-md:py-3">
        <DateBlock date={session.date} struck />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="font-semibold text-[15px] text-muted leading-5 line-through decoration-1">
            <span className="sr-only">{shortDate(session.date)}, </span>
            {times}
          </p>
          <p className="text-[13px] text-muted leading-4">
            <span className="max-md:hidden">
              {cancelledLine(session, true)}
            </span>
            <span className="md:hidden">{cancelledLine(session, false)}</span>
          </p>
        </div>
        <span className="flex w-[110px] shrink-0 justify-end max-md:w-auto">
          <Pill tone="muted">Cancelled</Pill>
        </span>
        <span className="w-5 shrink-0 max-md:hidden" />
      </li>
    );
  }
  const dayIndex =
    detail.kind === "days"
      ? detail.sessions.filter((s) => !s.cancelled).indexOf(session) + 1
      : 0;
  let title = times;
  if (dayIndex > 0) {
    title = `Day ${dayIndex} · ${times}`;
  } else if (isToday) {
    title = `Today, ${times}`;
  }
  const opens = opensLabel(session, detail.timeZone, now);
  const subtitle = isToday && opens ? opens : (session.location ?? opens ?? "");
  const cancellable =
    canManage && detail.kind === "days" && session.date >= today;
  return (
    <li className="relative border-line border-b last:border-b-0">
      <SessionLink
        className={cn(rowLinkClass, cancellable && "max-md:pr-[110px]")}
        label={`${shortDate(session.date)}, ${title}`}
        role={role}
        session={session}
      >
        <DateBlock date={session.date} />
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="font-semibold text-[15px] text-ink leading-5">
            {isToday && dayIndex === 0 ? (
              <>
                <span className="max-md:hidden">{title}</span>
                <span className="md:hidden">
                  Today, {session.startTime ?? "all day"}
                </span>
              </>
            ) : (
              title
            )}
          </span>
          <span
            className={cn(
              "text-[13px] leading-4",
              isToday ? "text-muted max-md:text-orange-deep" : "text-muted"
            )}
          >
            {subtitle}
          </span>
        </span>
        {isToday ? (
          <span className="flex w-[110px] shrink-0 justify-end max-md:hidden">
            <Pill tone="soft">Today</Pill>
          </span>
        ) : (
          <span className="w-[110px] shrink-0 max-md:hidden" />
        )}
        <span className="flex w-5 shrink-0 justify-end">
          <RowChevron />
        </span>
      </SessionLink>
      {cancellable ? (
        <Button
          className="absolute top-1/2 right-9 h-auto -translate-y-1/2 rounded-full border-line px-3 py-[7px] text-[13px] leading-4 max-md:right-7"
          data-date={session.date}
          onClick={onCancelDay}
          variant="outline"
        >
          Cancel day
        </Button>
      ) : null}
    </li>
  );
}

function ComingUp({
  now,
  detail,
  upcoming,
  role,
  today,
  canManage,
  onCancelDay,
}: {
  detail: EventDetail;
  upcoming: EventSessionItem[];
  role: StaffRole;
  today: DateOnly;
  now: Date;
  canManage: boolean;
  onCancelDay: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const left = upcoming.filter((s) => !s.cancelled).length;
  const shown = expanded ? upcoming : upcoming.slice(0, UPCOMING_PREVIEW);
  const hidden = upcoming.length - shown.length;
  const isCamp = detail.kind === "days";
  const heading = isCamp ? "Camp days" : "Coming up";
  let aside = `${left} ${left === 1 ? "date" : "dates"} left`;
  if (isCamp) {
    aside = `${left} ${left === 1 ? "day" : "days"}`;
  }
  return (
    <section
      aria-labelledby="coming-up"
      className="flex flex-col rounded-[20px] border border-line p-6 max-md:rounded-none max-md:border-0 max-md:p-0"
    >
      <div className="flex items-center justify-between border-line border-b pb-3 max-md:hidden">
        <h2
          className="font-semibold text-ink text-lg leading-[22px]"
          id="coming-up"
        >
          {heading}
        </h2>
        <p className="text-muted text-sm leading-[18px]">{aside}</p>
      </div>
      <SectionLabel className="pb-1 md:hidden">
        {heading} · {left} {left === 1 ? "date" : "dates"}
      </SectionLabel>
      {upcoming.length === 0 ? (
        <p className="py-5 text-[15px] text-muted leading-5">
          No dates still to come.
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((session) => (
            <UpcomingRow
              canManage={canManage}
              detail={detail}
              key={`${session.eventId}:${session.date}`}
              now={now}
              onCancelDay={onCancelDay}
              role={role}
              session={session}
              today={today}
            />
          ))}
        </ul>
      )}
      {hidden > 0 || expanded ? (
        <div className="pt-[6px]">
          <Button
            aria-expanded={expanded}
            className="h-auto px-0 py-2 font-semibold text-ink text-sm leading-[18px] underline underline-offset-2 hover:bg-transparent"
            onClick={toggle}
            variant="ghost"
          >
            {expanded
              ? "Show fewer dates"
              : `Show ${hidden} more ${hidden === 1 ? "date" : "dates"}`}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({ session }: { session: EventSessionItem }) {
  if (!session.tally) {
    return null;
  }
  return isClosedOut(session) ? (
    <Pill tone="fog">Closed out</Pill>
  ) : (
    <Pill tone="soft">Not closed</Pill>
  );
}

function tallyLine(session: EventSessionItem): string {
  const t = session.tally;
  if (!t) {
    return timesLabel(session.startTime, session.endTime);
  }
  const parts = [`${t.present} present`, `${t.late} late`];
  if (t.absent > 0) {
    parts.push(`${t.absent} absent`);
  }
  if (t.excused > 0) {
    parts.push(`${t.excused} excused`);
  }
  if (t.notMarked) {
    parts.push(`${t.notMarked} not marked`);
  }
  return parts.join(" · ");
}

function PastSessions({
  past,
  role,
  today,
}: {
  past: EventSessionItem[];
  role: StaffRole;
  today: DateOnly;
}) {
  if (past.length === 0) {
    return null;
  }
  const rate = monthAttendance(past, today);
  const hasCounts = past.some((s) => s.tally);
  return (
    <section
      aria-labelledby="past-sessions"
      className="flex flex-col rounded-[20px] border border-line p-6 max-md:rounded-none max-md:border-0 max-md:p-0"
    >
      <div className="flex items-center justify-between border-line border-b pb-3 max-md:hidden">
        <h2
          className="font-semibold text-ink text-lg leading-[22px]"
          id="past-sessions"
        >
          Past sessions
        </h2>
        {rate ? (
          <p className="text-muted text-sm leading-[18px]">
            {rate.percent}% attendance in {rate.month}
          </p>
        ) : null}
      </div>
      <SectionLabel className="pb-1 md:hidden">
        Past sessions
        {rate ? ` · ${rate.percent}% in ${rate.month}` : ""}
      </SectionLabel>
      {hasCounts ? (
        <div
          aria-hidden="true"
          className="flex items-center gap-4 border-line border-b py-[10px] font-semibold text-[12px] text-muted leading-4 tracking-label max-lg:hidden"
        >
          <span className="flex-1">DATE</span>
          <span className="w-[84px] shrink-0">PRESENT</span>
          <span className="w-16 shrink-0">LATE</span>
          <span className="w-[72px] shrink-0">ABSENT</span>
          <span className="w-[120px] shrink-0 text-right">STATUS</span>
          <span className="w-5 shrink-0" />
        </div>
      ) : null}
      <ul className="flex flex-col">
        {past.map((session) => (
          <li
            className="border-line border-b last:border-b-0"
            key={`${session.eventId}:${session.date}`}
          >
            <SessionLink
              className={rowLinkClass}
              label={`${shortDate(session.date)}: ${tallyLine(session)}`}
              role={role}
              session={session}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="font-semibold text-[15px] text-ink leading-5">
                  {shortDate(session.date)}
                </span>
                <span className="text-[13px] text-muted leading-4 lg:hidden">
                  {tallyLine(session)}
                </span>
              </span>
              {session.tally ? (
                <>
                  <span className="w-[84px] shrink-0 text-[15px] text-ink leading-5 max-lg:hidden">
                    {session.tally.present}
                  </span>
                  <span className="w-16 shrink-0 text-[15px] text-ink leading-5 max-lg:hidden">
                    {session.tally.late}
                  </span>
                  <span className="w-[72px] shrink-0 text-[15px] text-ink leading-5 max-lg:hidden">
                    {session.tally.absent}
                  </span>
                </>
              ) : null}
              <span className="flex shrink-0 justify-end lg:w-[120px]">
                <StatusPill session={session} />
              </span>
              <span className="flex w-5 shrink-0 justify-end max-md:hidden">
                <RowChevron />
              </span>
            </SessionLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function checkInFact(detail: EventDetail): string | null {
  if (!detail.event.collectAttendance) {
    return null;
  }
  const first = detail.sessions.find((s) => s.checkInOpensAt);
  if (detail.kind === "days" && first?.checkInOpensAt) {
    return `Each morning from ${localTime(new Date(first.checkInOpensAt), detail.timeZone)}`;
  }
  return "Opens 30 min before";
}

/** "Team · U14 · 18 students", or "Teams · Whole academy" for an academy-wide event. */
function teamFact(team: EventDetail["team"]): { label: string; value: string } {
  if (team === null) {
    return { label: "Teams", value: "Whole academy" };
  }
  const students =
    team.studentCount === null ? "" : ` · ${team.studentCount} students`;
  return { label: "Team", value: `${team.name}${students}` };
}

function Facts({ detail }: { detail: EventDetail }) {
  const repeats =
    detail.kind === "series"
      ? repeatsLabel(detail.sessions.map((s) => s.date))
      : null;
  const teamLine = teamFact(detail.team);
  const checkIn = checkInFact(detail);
  return (
    <section
      aria-labelledby="event-details"
      className="flex flex-col rounded-[20px] bg-fog p-6"
    >
      <h2
        className="pb-2 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label"
        id="event-details"
      >
        Details
      </h2>
      <dl className="flex flex-col">
        <FactRow label="When">{whenLabel(detail)}</FactRow>
        {repeats ? <FactRow label="Repeats">{repeats}</FactRow> : null}
        {detail.event.location ? (
          <FactRow label="Where">{detail.event.location}</FactRow>
        ) : null}
        <FactRow label={teamLine.label}>{teamLine.value}</FactRow>
        {detail.coaches.length > 0 ? (
          <FactRow label="Coaches">
            {detail.coaches.map(coachName).join(", ")}
          </FactRow>
        ) : null}
        {checkIn ? <FactRow label="Check-in">{checkIn}</FactRow> : null}
      </dl>
    </section>
  );
}

function createdLine(detail: EventDetail): string {
  const on = dayMonth(
    localDate(new Date(detail.event.createdAt), detail.timeZone)
  );
  const name = detail.creatorName;
  let who = "";
  if (name) {
    who = ` by ${detail.coaches.includes(name) ? coachName(name) : name}`;
  }
  const editors = detail.team
    ? `Any coach of ${detail.team.name} can edit it.`
    : "Only academy admins can edit it.";
  return `Created${who} on ${on}. ${editors}`;
}

function DeleteCard({
  detail,
  onDelete,
}: {
  detail: EventDetail;
  onDelete: () => void;
}) {
  const isCamp = detail.kind === "days";
  const days = detail.sessions.filter((s) => !s.cancelled).length;
  return (
    <section className="flex flex-col gap-[10px] rounded-[20px] border border-line px-6 py-5">
      <h2 className="font-semibold text-[15px] text-ink leading-5">
        {isCamp ? "Cancel one day or the whole camp" : "Delete this event"}
      </h2>
      <p className="text-muted text-sm leading-5">
        {isCamp
          ? `Cancel a day from its row. Deleting the camp removes all ${days} days still to come.`
          : "Removes all dates still to come. Past sessions and their attendance stay."}
      </p>
      <Button
        className="h-auto self-start rounded-full border-orange-deep px-4 py-[10px] text-orange-deep text-sm leading-[18px] hover:bg-orange-soft"
        onClick={onDelete}
        variant="outline"
      >
        Delete event
      </Button>
    </section>
  );
}

function calendarPath(role: StaffRole) {
  return role === "admin"
    ? ("/admin/calendar" as const)
    : ("/coach/calendar" as const);
}

/** Event detail for academy admins and coaches (DZQ-0, EI2-0, HLF-0, F26-0, HWK-0). */
export function EventDetailScreen(props: EventDetailScreenProps) {
  const { membership, eventId, now, userId } = props;
  const { roles } = membership;
  const viewer: EventViewer = {
    academyId: membership.academy.id,
    timeZone: membership.academy.timezone,
    today: localDate(now, membership.academy.timezone),
    isAdmin: roles.includes("admin"),
    isStaff: roles.includes("admin") || roles.includes("coach"),
    userId,
  };
  const query = useQuery(eventDetailQueryOptions(viewer, eventId));
  if (query.data === undefined) {
    return <DetailSkeleton label="Loading event" />;
  }
  if (query.data === null) {
    return (
      <ErrorState
        error={
          new ApiError({
            status: 404,
            code: "not_found",
            message: "Event not found",
          })
        }
        variant="page"
      />
    );
  }
  return (
    <EventDetailView {...props} detail={query.data} today={viewer.today} />
  );
}

function EventDetailView({
  detail,
  today,
  staffRole: role,
  membership,
  dialog,
  cancelDate,
  onOpenDialog,
  onCloseDialog,
  onDeleted,
  now,
}: EventDetailScreenProps & { detail: EventDetail; today: DateOnly }) {
  const canManage = canManageEvent(membership, detail.event.teamId);
  const { upcoming, past } = splitSessions(detail.sessions, today);
  const cancellable = upcoming.filter((s) => !s.cancelled);
  const isCamp = detail.kind === "days";

  const openEdit = useCallback(() => onOpenDialog("edit"), [onOpenDialog]);
  const openCancel = useCallback(() => onOpenDialog("cancel"), [onOpenDialog]);
  const openDelete = useCallback(() => onOpenDialog("delete"), [onOpenDialog]);
  const handleCancelDay = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      onOpenDialog("cancel", event.currentTarget.dataset.date),
    [onOpenDialog]
  );

  const summary = [
    `${whenLabel(detail)}${detail.event.location ? ` · ${detail.event.location}` : ""}`,
    [
      detail.kind === "series"
        ? repeatsLabel(detail.sessions.map((s) => s.date))
        : null,
      detail.coaches.length > 0
        ? joinWords(detail.coaches.map(coachName))
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8 max-md:gap-[18px]">
      <header className="flex flex-col gap-[14px] max-md:gap-[10px]">
        <div className="flex items-center justify-between">
          <Link className={backLinkClass} to={calendarPath(role)}>
            <BackText>Calendar</BackText>
          </Link>
          {canManage ? (
            <Button
              className="h-auto rounded-full border-line px-[14px] py-[7px] text-sm leading-[18px] md:hidden"
              onClick={openEdit}
              variant="outline"
            >
              Edit
            </Button>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
          <div className="flex flex-col gap-2 max-md:gap-[10px]">
            <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label max-md:font-semibold max-md:text-[12px] max-md:leading-4">
              {eyebrow(detail)}
            </p>
            <h1 className="font-display text-display-sm text-ink uppercase leading-[95%] tracking-[-0.005em] max-md:text-[44px] max-md:leading-[44px] max-md:tracking-normal">
              {detail.event.title}
            </h1>
            <p className="whitespace-pre-line text-[15px] text-ink-soft leading-[22px] md:hidden">
              {summary.join("\n")}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2 max-md:hidden">
              {isCamp || cancellable.length === 0 ? null : (
                <Button
                  className="h-auto rounded-full border-line px-5 py-[13px] text-[15px] leading-[18px]"
                  onClick={openCancel}
                  variant="outline"
                >
                  Cancel a day
                </Button>
              )}
              <Button
                className="h-auto rounded-full px-5 py-[13px] text-[15px] leading-[18px]"
                onClick={openEdit}
              >
                Edit event
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex items-start gap-6 max-md:gap-[18px] max-lg:flex-col max-lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-6 max-md:gap-[18px]">
          <ComingUp
            canManage={canManage}
            detail={detail}
            now={now}
            onCancelDay={handleCancelDay}
            role={role}
            today={today}
            upcoming={upcoming}
          />
          <PastSessions past={past} role={role} today={today} />
        </div>
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 max-md:hidden max-lg:w-full">
          <Facts detail={detail} />
          {canManage ? (
            <DeleteCard detail={detail} onDelete={openDelete} />
          ) : null}
          <p className="px-1 text-[13px] text-muted leading-[18px]">
            {createdLine(detail)}
          </p>
        </aside>
        {canManage ? (
          <div className="flex gap-2 md:hidden">
            {isCamp || cancellable.length === 0 ? null : (
              <Button
                className="h-auto flex-1 rounded-full border-line p-3 text-sm leading-[18px]"
                onClick={openCancel}
                variant="outline"
              >
                Cancel a day
              </Button>
            )}
            <Button
              className="h-auto flex-1 rounded-full border-orange-deep p-3 text-orange-deep text-sm leading-[18px] hover:bg-orange-soft"
              onClick={openDelete}
              variant="outline"
            >
              Delete event
            </Button>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <>
          <EditEventDialog
            detail={detail}
            membership={membership}
            onClose={onCloseDialog}
            open={dialog === "edit"}
            today={today}
          />
          <CancelDayDialog
            academyId={membership.academy.id}
            cancellable={cancellable}
            date={cancelDate}
            detail={detail}
            onClose={onCloseDialog}
            open={dialog === "cancel"}
          />
          <DeleteEventDialog
            academyId={membership.academy.id}
            detail={detail}
            onClose={onCloseDialog}
            onDeleted={onDeleted}
            open={dialog === "delete"}
            today={today}
          />
        </>
      ) : null}
    </div>
  );
}
