/*
 * Team attendance for coaches (CO-7): Paper 8WB-0 (web), C8S-0 (phone).
 * Desktop opens on the month, phone on the week (as drawn); each keeps its own period
 * unless ?period= picks one for both.
 */
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
import { useCallback, useMemo } from "react";

import { QueryBoundary } from "@/components/error-state";
import {
  attendanceRanges,
  minuteOf,
  type PeriodKind,
  periodLabel,
  shiftAnchor,
} from "@/features/attendance/periods";
import {
  type SessionSummary,
  type StudentAttendance,
  type TeamAttendance,
  teamAttendanceQueryOptions,
} from "@/features/attendance/queries";
import type { AttendanceSearch, PageSize } from "@/features/attendance/search";
import {
  Delta,
  downloadCsv,
  exportButtonClass,
  Initials,
  Pager,
} from "@/features/attendance/shared";
import { percent, rateOf, shareOf } from "@/features/attendance/stats";
import {
  ArrowButton,
  ChevronIcon,
  Segmented,
} from "@/features/calendar/controls";
import {
  addDays,
  dayMonth,
  dayOfMonth,
  monthName,
  monthNameShort,
  monthOf,
  toDateOnly,
  weekdayDayMonth,
  weekdayShort,
} from "@/features/calendar/dates";
import { ItemLink } from "@/features/calendar/item-link";
import {
  type CalendarTeam,
  calendarTeamsQueryOptions,
} from "@/features/calendar/queries";
import type { AttendanceStatus, DateOnly, Id } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";
import { appNow } from "@/lib/preview";

type Patch = Partial<AttendanceSearch>;

const PERIOD_OPTIONS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

const DEFAULT_SIZE: PageSize = 25;
const MISSED_ROWS = 5;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function sessionLink(session: SessionSummary) {
  return {
    eventId: session.eventId,
    sessionDate: session.sessionDate,
    collectAttendance: true,
    teamId: session.teamId,
  };
}

function isOpen(session: SessionSummary): boolean {
  return (
    session.ended && !session.cancelled && (session.neverCheckedIn ?? 0) > 0
  );
}

function eventLabel(session: SessionSummary): string {
  const type =
    session.eventType === "training"
      ? "Training"
      : session.eventType.charAt(0).toUpperCase() + session.eventType.slice(1);
  return session.startTime ? `${type} · ${session.startTime}` : type;
}

function TeamTabs({
  teams,
  value,
  onChange,
}: {
  teams: CalendarTeam[];
  value: Id;
  onChange: (team: Id) => void;
}) {
  return (
    <div className="-mr-5 flex gap-[6px] overflow-x-auto pr-5 [scrollbar-width:none] md:mr-0 md:pr-0">
      {teams.map((team) => (
        <TeamTab
          key={team.id}
          onChange={onChange}
          selected={team.id === value}
          team={team}
        />
      ))}
    </div>
  );
}

function TeamTab({
  team,
  selected,
  onChange,
}: {
  team: CalendarTeam;
  selected: boolean;
  onChange: (team: Id) => void;
}) {
  const handleClick = useCallback(() => onChange(team.id), [onChange, team.id]);
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        selected
          ? "border-ink bg-ink font-semibold text-white"
          : "border-line bg-white font-medium text-ink hover:bg-fog"
      )}
      onClick={handleClick}
      type="button"
    >
      {team.name} · {team.studentCount}
    </button>
  );
}

function previousWord(kind: PeriodKind, at: DateOnly): string {
  return kind === "month"
    ? monthName(monthOf(shiftAnchor(kind, at, -1)))
    : "last week";
}

function Stats({
  data,
  team,
  kind,
  at,
  phrase,
}: {
  data: TeamAttendance;
  team: CalendarTeam | undefined;
  kind: PeriodKind;
  at: DateOnly;
  phrase: string;
}) {
  const rate = rateOf(data.counts);
  const held = data.sessions.filter((s) => s.ended && !s.cancelled);
  const cancelled = data.sessions.filter((s) => s.cancelled).length;
  const toCome = data.sessions.filter((s) => !s.ended).length;
  const open = data.sessions.filter(isOpen);
  const [firstOpen] = open;
  const onTime = shareOf(data.counts.present, data.counts);
  const late = shareOf(data.counts.late, data.counts);
  const absent = shareOf(data.counts.absent, data.counts);
  return (
    <div className="flex gap-5 max-lg:flex-wrap">
      <div className="flex min-w-0 grow-[1.4] basis-0 flex-col gap-[14px] rounded-lg bg-ink p-6 max-lg:basis-full">
        <p className="font-medium text-[#BDBDBD] text-sm leading-[18px]">
          {team?.name} attendance {phrase}
        </p>
        <div className="flex items-end gap-[14px]">
          <p className="font-display text-display-md text-white leading-[72px]">
            {percent(rate)}
          </p>
          <span className="pb-[6px]">
            <Delta
              previous={rateOf(data.previousCounts)}
              rate={rate}
              suffix={` vs ${previousWord(kind, at)}`}
              upClassName="text-orange"
            />
          </span>
        </div>
        <div
          aria-hidden="true"
          className="flex h-[10px] shrink-0 gap-[3px] overflow-hidden rounded-full"
        >
          <span className="bg-white" style={{ flexGrow: onTime }} />
          <span className="bg-orange" style={{ flexGrow: late }} />
          <span className="bg-[#4A4A4A]" style={{ flexGrow: absent }} />
        </div>
        <div className="flex gap-[18px] text-[#BDBDBD] text-[13px] leading-4">
          <span>On time {percent(rate === null ? null : onTime)}</span>
          <span>Late {percent(rate === null ? null : late)}</span>
          <span>Absent {percent(rate === null ? null : absent)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 basis-0 flex-col justify-between gap-6 rounded-lg bg-fog p-6">
        <p className="font-medium text-muted text-sm leading-[18px]">
          Sessions held
        </p>
        <div className="flex flex-col gap-[6px]">
          <p className="font-display text-display-sm text-ink leading-[52px]">
            {held.length}
          </p>
          <p className="text-[13px] text-muted leading-4">
            {cancelled} cancelled · {toCome} still to come
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 basis-0 flex-col justify-between gap-6 rounded-lg bg-fog p-6">
        <p className="font-medium text-muted text-sm leading-[18px]">
          Not closed out
        </p>
        <div className="flex flex-col gap-[6px]">
          <p
            className={cn(
              "font-display text-display-sm leading-[52px]",
              open.length > 0 ? "text-orange-deep" : "text-ink"
            )}
          >
            {open.length}
          </p>
          <p className="text-[13px] text-muted leading-4">
            {firstOpen
              ? `${weekdayDayMonth(firstOpen.sessionDate)} · ${firstOpen.neverCheckedIn} never checked in`
              : "Every session is closed"}
          </p>
        </div>
      </div>
    </div>
  );
}

function SessionsTable({
  sessions,
  label,
  page,
  size,
  onPage,
  onSize,
}: {
  sessions: SessionSummary[];
  label: string;
  page: number;
  size: PageSize;
  onPage: (page: number) => void;
  onSize: (size: PageSize) => void;
}) {
  const pages = Math.max(1, Math.ceil(sessions.length / size));
  const current = Math.min(page, pages);
  const shown = sessions.slice((current - 1) * size, current * size);
  const head =
    "font-medium text-[12px] text-muted uppercase leading-4 tracking-label";
  return (
    <section
      aria-labelledby="sessions-table"
      className="flex min-w-0 grow-[1.7] basis-0 flex-col rounded-lg border border-line p-6 max-lg:basis-full"
    >
      <div className="flex items-center justify-between pb-[14px]">
        <h2
          className="font-semibold text-ink text-lg leading-6"
          id="sessions-table"
        >
          Sessions
        </h2>
        <p className="text-[13px] text-muted leading-4">
          {label} · newest first
        </p>
      </div>
      <div className="flex items-center border-line border-y py-[10px]">
        <span className={cn(head, "w-[110px] shrink-0")}>Date</span>
        <span className={cn(head, "flex-1 basis-0")}>Session</span>
        <span className={cn(head, "w-[72px] shrink-0")}>Here</span>
        <span className={cn(head, "w-[72px] shrink-0")}>Late</span>
        <span className={cn(head, "w-[72px] shrink-0")}>Absent</span>
        <span className="w-[108px] shrink-0" />
      </div>
      {shown.length === 0 ? (
        <p className="border-line border-b py-4 text-muted text-sm">
          No sessions held in this period yet.
        </p>
      ) : null}
      {shown.map((session) => (
        <div
          className="flex items-center border-line border-b py-3"
          key={session.key}
        >
          <span className="w-[110px] shrink-0 font-semibold text-ink text-sm leading-[18px]">
            {weekdayDayMonth(session.sessionDate)}
          </span>
          {session.cancelled ? (
            <>
              <span className="flex-1 basis-0 text-muted text-sm leading-[18px] line-through">
                {eventLabel(session)}
              </span>
              <span className="w-[252px] shrink-0 text-muted text-sm leading-[18px]">
                Cancelled
              </span>
              <span className="w-[108px] shrink-0" />
            </>
          ) : (
            <>
              <span className="flex-1 basis-0 text-ink-soft text-sm leading-[18px]">
                {eventLabel(session)}
              </span>
              <span className="w-[72px] shrink-0 text-ink text-sm leading-[18px]">
                {session.counts.present}
              </span>
              <span className="w-[72px] shrink-0 text-ink text-sm leading-[18px]">
                {session.counts.late}
              </span>
              <span
                className={cn(
                  "w-[72px] shrink-0 text-sm leading-[18px]",
                  session.counts.absent >= 2
                    ? "font-semibold text-orange-deep"
                    : "text-muted"
                )}
              >
                {isOpen(session) ? "–" : session.counts.absent}
              </span>
              <span className="flex w-[108px] shrink-0 justify-end">
                <ItemLink
                  audience="coach"
                  className={
                    isOpen(session)
                      ? "rounded-full border border-ink px-3 py-[6px] font-semibold text-[13px] text-ink leading-4 outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink"
                      : "font-medium text-[13px] text-ink leading-[18px] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  }
                  item={sessionLink(session)}
                >
                  {isOpen(session) ? "Close out" : "View list"}
                </ItemLink>
              </span>
            </>
          )}
        </div>
      ))}
      <Pager
        className="pt-4"
        onPage={onPage}
        onSize={onSize}
        page={current}
        size={size}
        total={sessions.length}
      />
    </section>
  );
}

function missedNote(student: StudentAttendance): {
  text: string;
  alert: boolean;
} {
  if (student.feesOverdueDays) {
    return {
      text: `Fees ${plural(student.feesOverdueDays, "day")} late`,
      alert: true,
    };
  }
  if (student.late >= 2) {
    return { text: `Late ${student.late} times`, alert: false };
  }
  return {
    text: student.lastSeen
      ? `Last here ${weekdayDayMonth(student.lastSeen)}`
      : "Not here this period",
    alert: false,
  };
}

function MissedMost({
  data,
  phrase,
  held,
}: {
  data: TeamAttendance;
  phrase: string;
  held: number;
}) {
  const rows = data.students
    .filter((student) => student.absent > 0)
    .sort((a, b) => b.absent - a.absent || a.name.localeCompare(b.name))
    .slice(0, MISSED_ROWS);
  return (
    <section
      aria-labelledby="coach-missed"
      className="flex min-w-0 flex-1 basis-0 flex-col rounded-lg bg-fog p-6 max-lg:basis-full"
    >
      <h2
        className="font-semibold text-ink text-lg leading-6"
        id="coach-missed"
      >
        Missed the most
      </h2>
      <p className="pt-[2px] pb-[14px] text-muted text-sm leading-[18px]">
        Absent {phrase}, out of {plural(held, "session")}
      </p>
      {rows.length === 0 ? (
        <p className="border-line border-t pt-3 text-muted text-sm">
          Nobody missed a session. Good news.
        </p>
      ) : null}
      {rows.map((student) => {
        const note = missedNote(student);
        return (
          <Link
            className="flex items-center gap-3 border-line border-t py-3 outline-none last:pb-0 focus-visible:ring-2 focus-visible:ring-ink"
            key={student.studentId}
            params={{ studentId: student.studentId }}
            to="/coach/students/$studentId"
          >
            <Initials className="size-8 bg-white" name={student.name} />
            <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[2px]">
              <span className="font-semibold text-[15px] text-ink leading-5">
                {student.name}
              </span>
              <span
                className={cn(
                  "text-[13px] leading-4",
                  note.alert ? "text-orange-deep" : "text-muted"
                )}
              >
                {note.text}
              </span>
            </span>
            <span
              className={cn(
                "w-11 shrink-0 text-right font-display text-[28px] leading-7",
                student.absent >= 3 ? "text-orange-deep" : "text-ink"
              )}
            >
              {student.absent}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function Mark({
  status,
  cancelled,
}: {
  status?: AttendanceStatus;
  cancelled: boolean;
}) {
  if (cancelled) {
    return <span className="h-[2px] w-4 bg-[#D6D6D6]" title="Cancelled" />;
  }
  if (status === "present") {
    return <span className="size-4 rounded-full bg-ink" title="Here" />;
  }
  if (status === "late") {
    return <span className="size-4 rounded-full bg-orange" title="Late" />;
  }
  if (status === "absent") {
    return (
      <span
        className="size-4 rounded-full border-2 border-orange"
        title="Absent"
      />
    );
  }
  if (status === "excused") {
    return (
      <span className="size-4 rounded-full bg-[#C8C8C8]" title="Excused" />
    );
  }
  return (
    <span
      className="size-4 rounded-full border border-line"
      title="No record"
    />
  );
}

function statusWord(status: AttendanceStatus | undefined, cancelled: boolean) {
  if (cancelled) {
    return "cancelled";
  }
  return status ?? "no record";
}

/** Phone: students down, sessions across (C8S-0). */
function PhoneGrid({
  data,
  team,
  kind,
  at,
  today,
  onShift,
}: {
  data: TeamAttendance;
  team: CalendarTeam | undefined;
  kind: PeriodKind;
  at: DateOnly;
  today: DateOnly;
  onShift: (delta: number) => void;
}) {
  const ranges = attendanceRanges(kind, at);
  const columns = [...data.sessions]
    .filter((session) => session.ended || session.cancelled)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const cancelled = columns.filter((s) => s.cancelled).length;
  const handlePrev = useCallback(() => onShift(-1), [onShift]);
  const handleNext = useCallback(() => onShift(1), [onShift]);
  const atLatest = shiftAnchor(kind, at, 1) > today;
  const title =
    kind === "week"
      ? `${dayOfMonth(ranges.period.from)} – ${dayOfMonth(ranges.period.to)} ${monthName(monthOf(ranges.period.to))}`
      : periodLabel(kind, ranges.period, today);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between rounded-md bg-fog px-1 py-1">
        <ArrowButton
          className="border-0"
          direction="left"
          label="Previous period"
          onClick={handlePrev}
        />
        <div className="flex flex-col items-center">
          <p className="font-semibold text-ink text-sm leading-[18px]">
            {title}
          </p>
          <p className="text-[12px] text-muted leading-4">
            {plural(columns.length - cancelled, "session")} · {cancelled}{" "}
            cancelled · {percent(rateOf(data.counts))} here
          </p>
        </div>
        <ArrowButton
          className="border-0"
          direction="right"
          disabled={atLatest}
          label="Next period"
          onClick={handleNext}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            {team?.name} attendance by session
          </caption>
          <thead>
            <tr className="border-line border-b">
              <th
                className="pb-2 text-left align-bottom font-medium text-[12px] text-muted uppercase leading-4 tracking-label"
                scope="col"
              >
                Student
              </th>
              {columns.map((session) => (
                <th
                  className="w-12 min-w-12 pb-2"
                  key={session.key}
                  scope="col"
                >
                  <span
                    className={cn(
                      "flex flex-col items-center text-[12px] leading-[15px]",
                      session.cancelled ? "text-[#B5B5B5]" : "text-ink"
                    )}
                  >
                    <span className="font-semibold">
                      {weekdayShort(session.sessionDate)}
                    </span>
                    <span
                      className={cn(
                        "font-normal",
                        session.cancelled ? "text-[#B5B5B5]" : "text-muted"
                      )}
                    >
                      {kind === "week"
                        ? dayOfMonth(session.sessionDate)
                        : `${dayOfMonth(session.sessionDate)} ${monthNameShort(session.sessionDate)}`}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <tr className="border-line border-b" key={student.studentId}>
                <th className="py-3 text-left font-normal" scope="row">
                  <span className="flex flex-col">
                    <span className="font-semibold text-[15px] text-ink leading-5">
                      {student.name}
                    </span>
                    {student.feesOverdueDays ? (
                      <span className="text-[12px] text-orange-deep leading-4">
                        Fees unpaid
                      </span>
                    ) : null}
                  </span>
                </th>
                {columns.map((session) => {
                  const status = student.statuses[session.key];
                  return (
                    <td className="w-12 py-3" key={session.key}>
                      <span
                        aria-label={`${weekdayShort(session.sessionDate)} ${dayMonth(session.sessionDate)}: ${statusWord(status, session.cancelled)}`}
                        className="flex justify-center"
                        role="img"
                      >
                        <Mark cancelled={session.cancelled} status={status} />
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.students.length === 0 ? (
        <p className="text-muted text-sm">No students on this team yet.</p>
      ) : null}
      <div className="flex flex-wrap gap-[14px] text-[12px] text-muted leading-4">
        <span className="flex items-center gap-[5px]">
          <span className="size-[10px] rounded-full bg-ink" />
          Here
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="size-[10px] rounded-full bg-orange" />
          Late
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="size-[10px] rounded-full border-2 border-orange" />
          Absent
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="h-[2px] w-[10px] bg-[#C8C8C8]" />
          Cancelled
        </span>
      </div>
    </div>
  );
}

function DesktopSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-5 max-lg:flex-wrap">
        <Skeleton className="h-[206px] grow-[1.4] basis-0 rounded-lg max-lg:basis-full" />
        <Skeleton className="h-[206px] flex-1 rounded-lg" />
        <Skeleton className="h-[206px] flex-1 rounded-lg" />
      </div>
      <Skeleton className="h-[440px] w-full rounded-lg" />
    </div>
  );
}

function useTeamData(
  academyId: Id,
  teamId: Id,
  kind: PeriodKind,
  at: DateOnly
) {
  const ranges = attendanceRanges(kind, at);
  return useQuery(
    teamAttendanceQueryOptions(academyId, teamId, {
      ...ranges,
      now: minuteOf(appNow()),
    })
  );
}

function DesktopBody({
  academyId,
  team,
  kind,
  at,
  today,
  search,
  onSearchChange,
}: {
  academyId: Id;
  team: CalendarTeam | undefined;
  kind: PeriodKind;
  at: DateOnly;
  today: DateOnly;
  search: AttendanceSearch;
  onSearchChange: (patch: Patch) => void;
}) {
  const query = useTeamData(academyId, team?.id ?? "", kind, at);
  const handlePage = useCallback(
    (page: number) => onSearchChange({ page: page > 1 ? page : undefined }),
    [onSearchChange]
  );
  const handleSize = useCallback(
    (size: PageSize) =>
      onSearchChange({
        size: size === DEFAULT_SIZE ? undefined : size,
        page: undefined,
      }),
    [onSearchChange]
  );
  const { data } = query;
  if (!data) {
    return <DesktopSkeleton />;
  }
  const ranges = attendanceRanges(kind, at);
  const phrase =
    kind === "month"
      ? `in ${monthName(monthOf(ranges.period.from))}`
      : (periodLabel(kind, ranges.period, today).split(",")[0]?.toLowerCase() ??
        "");
  const listed = data.sessions.filter((s) => s.ended || s.cancelled);
  const held = listed.filter((s) => !s.cancelled).length;
  return (
    <div className="flex flex-col gap-8">
      <Stats at={at} data={data} kind={kind} phrase={phrase} team={team} />
      <div className="flex items-start gap-5 max-lg:flex-wrap">
        <SessionsTable
          label={periodLabel(kind, ranges.period, today)}
          onPage={handlePage}
          onSize={handleSize}
          page={search.page ?? 1}
          sessions={listed}
          size={search.size ?? DEFAULT_SIZE}
        />
        <MissedMost data={data} held={held} phrase={phrase} />
      </div>
    </div>
  );
}

function PhoneBody({
  academyId,
  team,
  kind,
  at,
  today,
  onShift,
}: {
  academyId: Id;
  team: CalendarTeam | undefined;
  kind: PeriodKind;
  at: DateOnly;
  today: DateOnly;
  onShift: (delta: number) => void;
}) {
  const { data } = useTeamData(academyId, team?.id ?? "", kind, at);
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14 w-full rounded-md" />
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton className="h-11 w-full rounded-[12px]" key={key} />
        ))}
      </div>
    );
  }
  return (
    <PhoneGrid
      at={at}
      data={data}
      kind={kind}
      onShift={onShift}
      team={team}
      today={today}
    />
  );
}

function sessionStatus(session: SessionSummary): string {
  if (session.cancelled) {
    return "Cancelled";
  }
  return isOpen(session) ? "Not closed" : "Closed";
}

function exportSessions(
  data: TeamAttendance | undefined,
  team: CalendarTeam | undefined,
  label: string
) {
  if (!(data && team)) {
    return;
  }
  downloadCsv(`attendance-${team.name}-${label}.csv`, [
    ["Date", "Session", "Here", "Late", "Absent", "Excused", "Status"],
    ...data.sessions
      .filter((s) => s.ended || s.cancelled)
      .map((s) => [
        s.sessionDate,
        eventLabel(s),
        s.counts.present,
        s.counts.late,
        s.counts.absent,
        s.counts.excused,
        sessionStatus(s),
      ]),
  ]);
}

export function CoachAttendanceScreen({
  search,
  onSearchChange,
}: {
  search: AttendanceSearch;
  onSearchChange: (patch: Patch) => void;
}) {
  const membership = useActiveMembership();
  const academyId = membership?.academy.id ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const today = toDateOnly(appNow(), timeZone);
  const teams = useQuery(calendarTeamsQueryOptions(academyId)).data;
  const team =
    teams?.find((row) => row.id === search.team) ?? teams?.[0] ?? undefined;
  const desktopKind: PeriodKind = search.period ?? "month";
  const phoneKind: PeriodKind = search.period ?? "week";
  const desktopAt = search.at ?? today;
  // Phone opens on the week holding yesterday (last week on a Monday, as drawn).
  const phoneAt = search.at ?? addDays(today, -1);
  const desktopRanges = attendanceRanges(desktopKind, desktopAt);
  const exportQuery = useQuery({
    ...teamAttendanceQueryOptions(academyId, team?.id ?? "", {
      ...desktopRanges,
      now: minuteOf(appNow()),
    }),
    throwOnError: false,
  });

  const handleTeam = useCallback(
    (next: Id) => onSearchChange({ team: next, page: undefined }),
    [onSearchChange]
  );
  const handleKind = useCallback(
    (next: PeriodKind) =>
      onSearchChange({ period: next, at: undefined, page: undefined }),
    [onSearchChange]
  );
  const handleDesktopShift = useCallback(
    (delta: number) =>
      onSearchChange({
        period: desktopKind,
        at: shiftAnchor(desktopKind, desktopAt, delta),
        page: undefined,
      }),
    [desktopAt, desktopKind, onSearchChange]
  );
  const handlePrev = useCallback(
    () => handleDesktopShift(-1),
    [handleDesktopShift]
  );
  const handleNext = useCallback(
    () => handleDesktopShift(1),
    [handleDesktopShift]
  );
  const handlePhoneShift = useCallback(
    (delta: number) =>
      onSearchChange({
        period: phoneKind,
        at: shiftAnchor(phoneKind, phoneAt, delta),
      }),
    [onSearchChange, phoneAt, phoneKind]
  );
  const handleExport = useCallback(
    () =>
      exportSessions(exportQuery.data, team, monthOf(desktopRanges.period.to)),
    [desktopRanges.period.to, exportQuery.data, team]
  );
  const teamNames = useMemo(
    () => (teams ?? []).map((row) => row.name).join(", "),
    [teams]
  );

  if (teams && teams.length === 0) {
    return (
      <>
        <PageHeader>
          <PageHeading>
            <Eyebrow>Your teams</Eyebrow>
            <PageTitle>Attendance</PageTitle>
          </PageHeading>
        </PageHeader>
        <div className="flex flex-col gap-2 rounded-[20px] border border-line p-6">
          <p className="font-semibold text-base text-ink">
            You’re not on a team yet
          </p>
          <p className="text-muted text-sm">
            An academy admin puts coaches on teams. Attendance shows up here
            once you have one.
          </p>
        </div>
      </>
    );
  }

  const desktopLabel = periodLabel(desktopKind, desktopRanges.period, today);
  const desktopWord =
    desktopKind === "month"
      ? monthName(monthOf(desktopRanges.period.from))
      : desktopLabel.split(",")[0];

  return (
    <>
      <div className="flex h-9 items-center justify-between md:hidden">
        {team ? (
          <Link
            className="flex min-h-11 items-center gap-[6px] font-semibold text-[15px] text-ink leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
            params={{ teamId: team.id }}
            to="/coach/teams/$teamId"
          >
            <ChevronIcon direction="left" size={18} />
            {team.name}
          </Link>
        ) : (
          <span />
        )}
        <Segmented
          label="Period"
          onChange={handleKind}
          options={PERIOD_OPTIONS}
          size="sm"
          value={phoneKind}
        />
      </div>
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            <span className="max-md:hidden">
              {teamNames}
              {teamNames ? " · " : ""}
              {desktopWord}
            </span>
            <span className="md:hidden">
              {team
                ? `${team.name} · ${plural(team.studentCount, "student")}`
                : ""}
            </span>
          </Eyebrow>
          <PageTitle>Attendance</PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">
          <button
            className={exportButtonClass}
            disabled={!exportQuery.data}
            onClick={handleExport}
            type="button"
          >
            Export
          </button>
        </PageActions>
      </PageHeader>
      {teams && team ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {teams.length > 1 ? (
            <TeamTabs onChange={handleTeam} teams={teams} value={team.id} />
          ) : (
            <span className="max-md:hidden" />
          )}
          <div className="flex items-center gap-3 max-md:hidden">
            <div className="flex items-center gap-[6px]">
              <ArrowButton
                direction="left"
                label="Previous period"
                onClick={handlePrev}
              />
              <h2
                aria-live="polite"
                className="px-[6px] font-semibold text-[15px] text-ink leading-5"
              >
                {desktopLabel}
              </h2>
              <ArrowButton
                direction="right"
                disabled={shiftAnchor(desktopKind, desktopAt, 1) > today}
                label="Next period"
                onClick={handleNext}
              />
            </div>
            <Segmented
              label="Period"
              onChange={handleKind}
              options={PERIOD_OPTIONS}
              size="sm"
              value={desktopKind}
            />
          </div>
        </div>
      ) : null}
      <QueryBoundary className="max-md:hidden" what="attendance">
        <div className="max-md:hidden">
          <DesktopBody
            academyId={academyId}
            at={desktopAt}
            kind={desktopKind}
            onSearchChange={onSearchChange}
            search={search}
            team={team}
            today={today}
          />
        </div>
      </QueryBoundary>
      <QueryBoundary className="md:hidden" what="attendance">
        <div className="md:hidden">
          <PhoneBody
            academyId={academyId}
            at={phoneAt}
            kind={phoneKind}
            onShift={handlePhoneShift}
            team={team}
            today={today}
          />
        </div>
      </QueryBoundary>
    </>
  );
}
