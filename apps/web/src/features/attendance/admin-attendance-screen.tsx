/*
 * Academy attendance for admins (AO-7): Paper 8EI-0 (web), 7KA-0 (phone).
 * Below 1024px the two panels stack and the "Missed the most" table becomes two-line
 * rows (responsive spec D5O-0); the four stat cards go 2 by 2.
 */
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";

import { QueryBoundary } from "@/components/error-state";
import {
  attendanceRanges,
  minuteOf,
  type PeriodKind,
  periodLabel,
  periodPhrase,
  shiftAnchor,
} from "@/features/attendance/periods";
import {
  type AcademyAttendance,
  academyAttendanceQueryOptions,
  type SessionSummary,
  type StudentAttendance,
} from "@/features/attendance/queries";
import type { AttendanceSearch, PageSize } from "@/features/attendance/search";
import {
  Delta,
  downloadCsv,
  exportButtonClass,
  Initials,
  Pager,
} from "@/features/attendance/shared";
import {
  isLow,
  LOW_STUDENT_RATE,
  percent,
  rateOf,
} from "@/features/attendance/stats";
import {
  ArrowButton,
  ChevronIcon,
  RateBar,
  Segmented,
} from "@/features/calendar/controls";
import {
  addDays,
  monthName,
  monthOf,
  rangeLabel,
  toDateOnly,
  weekdayDayMonth,
} from "@/features/calendar/dates";
import { ItemLink } from "@/features/calendar/item-link";
import {
  type CalendarTeam,
  calendarTeamsQueryOptions,
} from "@/features/calendar/queries";
import { TONE_BG } from "@/features/calendar/tone";
import type { DateOnly, Id } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";
import { appNow } from "@/lib/preview";

type Patch = Partial<AttendanceSearch>;

const PERIOD_OPTIONS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

const ALL_TEAMS = "all";
const DEFAULT_SIZE: PageSize = 25;
const SESSION_PANEL_ROWS = 5;
const MISSED_PHONE_ROWS = 5;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function sessionName(
  session: SessionSummary,
  teams: Map<Id, CalendarTeam>
): string {
  const team = teams.get(session.teamId)?.name ?? "";
  const title =
    session.eventType === "training" ? "training" : session.eventType;
  return `${team} ${title}`.trim();
}

function TeamSelect({
  teams,
  value,
  onChange,
}: {
  teams: CalendarTeam[];
  value: string | undefined;
  onChange: (team: string | undefined) => void;
}) {
  const items = useMemo(
    () => [
      { value: ALL_TEAMS, label: "All teams" },
      ...teams.map((team) => ({ value: team.id, label: team.name })),
    ],
    [teams]
  );
  const handleChange = useCallback(
    (next: unknown) =>
      onChange(
        typeof next === "string" && next !== ALL_TEAMS ? next : undefined
      ),
    [onChange]
  );
  return (
    <Select
      items={items}
      onValueChange={handleChange}
      value={value ?? ALL_TEAMS}
    >
      <SelectTrigger aria-label="Team" className="py-[10px]" variant="pill">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatCard({
  tone,
  label,
  value,
  note,
  children,
}: {
  tone: "ink" | "fog" | "soft";
  label: string;
  value: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 basis-0 flex-col gap-[10px] rounded-[20px] px-[22px] py-5 max-lg:basis-[calc(50%-8px)]",
        tone === "ink" && "bg-ink",
        tone === "fog" && "bg-fog",
        tone === "soft" && "bg-orange-soft"
      )}
    >
      <p
        className={cn(
          "font-medium text-sm leading-[18px]",
          tone === "ink" && "text-[#BDBDBD]",
          tone === "fog" && "text-muted",
          tone === "soft" && "text-orange-deep"
        )}
      >
        {label}
      </p>
      <div className="flex items-baseline gap-[10px]">
        <p
          className={cn(
            "font-display text-display-sm leading-[95%]",
            tone === "ink" ? "text-white" : "text-ink"
          )}
        >
          {value}
        </p>
        {children}
      </div>
      <p
        className={cn(
          "text-sm leading-[18px]",
          tone === "ink" && "text-[#BDBDBD]",
          tone === "fog" && "text-muted",
          tone === "soft" && "text-orange-deep"
        )}
      >
        {note}
      </p>
    </div>
  );
}

function notClosed(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.filter(
    (session) =>
      session.ended && !session.cancelled && (session.neverCheckedIn ?? 0) > 0
  );
}

function Stats({
  data,
  teams,
  phrase,
}: {
  data: AcademyAttendance;
  teams: Map<Id, CalendarTeam>;
  phrase: string;
}) {
  const rate = rateOf(data.counts);
  const attended = data.counts.present + data.counts.late;
  const counted = attended + data.counts.absent;
  const held = data.sessions.filter((s) => s.ended && !s.cancelled);
  const cancelled = data.sessions.filter((s) => s.cancelled);
  const open = notClosed(data.sessions);
  const [firstCancelled] = cancelled;
  const [firstOpen] = open;
  const cancelledNote = firstCancelled
    ? `${`${cancelled.length} cancelled`}, ${teams.get(firstCancelled.teamId)?.name ?? ""} on ${weekdayDayMonth(firstCancelled.sessionDate)}`
    : "None cancelled";
  return (
    <div className="flex w-full gap-4 max-lg:flex-wrap">
      <StatCard
        label={`Academy rate, ${phrase}`}
        note={`${attended} of ${counted} check-ins`}
        tone="ink"
        value={percent(rate)}
      >
        <Delta previous={rateOf(data.previousCounts)} rate={rate} />
      </StatCard>
      <StatCard
        label="Sessions held"
        note={cancelledNote}
        tone="fog"
        value={String(held.length)}
      />
      <StatCard
        label="Absent"
        note={`${plural(data.missedTwoPlus, "student")} missed 2 or more`}
        tone="fog"
        value={String(data.counts.absent)}
      />
      <StatCard
        label={open.length > 0 ? "Not closed yet" : "Closed out"}
        note={
          firstOpen
            ? `${teams.get(firstOpen.teamId)?.name ?? ""}, ${weekdayDayMonth(firstOpen.sessionDate)}${open.length > 1 ? ` and ${open.length - 1} more` : ""}`
            : "Every session is closed"
        }
        tone={open.length > 0 ? "soft" : "fog"}
        value={String(open.length)}
      />
    </div>
  );
}

function teamSubline(team: CalendarTeam): {
  text: string;
  alert: boolean;
} {
  const students = plural(team.studentCount, "student");
  return team.coachName
    ? {
        text: `${students}, Coach ${team.coachName.split(" ")[0]}`,
        alert: false,
      }
    : { text: `${students}, no coach yet`, alert: true };
}

function ByTeam({
  data,
  periodHeading,
  monthHeading,
}: {
  data: AcademyAttendance;
  periodHeading: string;
  monthHeading: string;
}) {
  return (
    <section
      aria-labelledby="by-team"
      className="flex min-w-0 flex-1 basis-0 flex-col rounded-[20px] border border-line px-6 pt-[6px] pb-3 max-lg:w-full max-lg:flex-none"
    >
      <div className="flex items-center border-line border-b pt-4 pb-3">
        <h2
          className="flex-1 basis-0 font-semibold text-[17px] text-ink leading-[22px]"
          id="by-team"
        >
          By team
        </h2>
        <span className="w-[200px] shrink-0 font-medium text-[12px] text-muted uppercase leading-4 tracking-label max-md:w-[150px]">
          {periodHeading}
        </span>
        <span className="w-[90px] shrink-0 text-right font-medium text-[12px] text-muted uppercase leading-4 tracking-label">
          {monthHeading}
        </span>
      </div>
      {data.teams.length === 0 ? (
        <p className="py-4 text-muted text-sm">
          No teams yet. Create one on the Teams page.
        </p>
      ) : null}
      {data.teams.map(({ team, periodRate, monthRate }) => {
        const sub = teamSubline(team);
        const low = isLow(periodRate);
        return (
          <Link
            className="flex items-center border-line border-b py-[14px] outline-none last:border-b-0 hover:bg-[#FAFAF8] focus-visible:ring-2 focus-visible:ring-ink"
            key={team.id}
            params={{ teamId: team.id }}
            to="/admin/teams/$teamId"
          >
            <span className="flex min-w-0 flex-1 basis-0 items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "size-[10px] shrink-0 rounded-full",
                  TONE_BG[team.tone]
                )}
              />
              <span className="flex min-w-0 flex-col gap-[2px]">
                <span className="font-semibold text-[15px] text-ink leading-5">
                  {team.name}
                </span>
                <span
                  className={cn(
                    "text-[13px] leading-4",
                    sub.alert ? "text-orange-deep" : "text-muted"
                  )}
                >
                  {sub.text}
                </span>
              </span>
            </span>
            <span className="flex w-[200px] shrink-0 items-center gap-[10px] max-md:w-[150px]">
              <RateBar
                alert={low}
                className="w-[120px] max-md:w-[80px]"
                rate={periodRate}
              />
              <span className="font-semibold text-[15px] text-ink leading-5">
                {percent(periodRate)}
              </span>
            </span>
            <span className="w-[90px] shrink-0 text-right text-[15px] text-muted leading-5">
              {percent(monthRate)}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function sessionNote(session: SessionSummary): {
  text: string;
  alert: boolean;
} {
  if (session.cancelled) {
    return { text: "Cancelled", alert: false };
  }
  if (!session.ended) {
    return { text: "Still to come", alert: false };
  }
  if ((session.neverCheckedIn ?? 0) > 0) {
    return {
      text: `Not closed, ${session.neverCheckedIn} never checked in`,
      alert: true,
    };
  }
  const here = session.counts.present + session.counts.late;
  const late = session.counts.late > 0 ? `, ${session.counts.late} late` : "";
  return {
    text: `${here} of ${session.roster ?? here} present${late}`,
    alert: false,
  };
}

function SessionsPanel({
  data,
  teams,
  heading,
}: {
  data: AcademyAttendance;
  teams: Map<Id, CalendarTeam>;
  heading: string;
}) {
  const past = data.sessions.filter((session) => session.ended);
  const open = notClosed(past);
  const rest = past.filter((session) => !open.includes(session));
  const rows = [...open, ...rest].slice(0, SESSION_PANEL_ROWS);
  return (
    <section
      aria-labelledby="sessions-panel"
      className="flex w-[360px] shrink-0 flex-col rounded-[20px] bg-fog px-[22px] pt-[6px] pb-3 max-lg:w-full"
    >
      <div className="flex items-center justify-between pt-4 pb-3">
        <h2
          className="font-semibold text-[17px] text-ink leading-[22px]"
          id="sessions-panel"
        >
          {heading}
        </h2>
        <Link
          className="font-semibold text-[13px] text-ink leading-4 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
          to="/admin/calendar"
        >
          Calendar
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="border-[#E2E2DF] border-t py-3 text-muted text-sm leading-[18px]">
          No sessions in this period yet.
        </p>
      ) : null}
      {rows.map((session) => {
        const note = sessionNote(session);
        const team = teams.get(session.teamId);
        const needsClose = note.alert;
        return (
          <div
            className="flex items-center gap-3 border-[#E2E2DF] border-t py-3"
            key={session.key}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-9 w-1 shrink-0 rounded-full",
                team ? TONE_BG[team.tone] : "bg-ink"
              )}
            />
            <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[2px]">
              <span
                className={cn(
                  "font-semibold text-sm leading-[18px]",
                  session.cancelled ? "text-muted line-through" : "text-ink"
                )}
              >
                {sessionName(session, teams)},{" "}
                {weekdayDayMonth(session.sessionDate)}
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
            {session.cancelled ? null : (
              <ItemLink
                audience="admin"
                className={
                  needsClose
                    ? "shrink-0 rounded-full bg-ink px-3 py-[7px] font-semibold text-[13px] text-white leading-4 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
                    : "shrink-0 font-semibold text-[13px] text-ink leading-4 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
                }
                item={{
                  eventId: session.eventId,
                  sessionDate: session.sessionDate,
                  collectAttendance: true,
                  teamId: session.teamId,
                }}
              >
                {needsClose ? "Close out" : "Open list"}
              </ItemLink>
            )}
          </div>
        );
      })}
    </section>
  );
}

function shortDay(date: DateOnly | null): string {
  return date ? weekdayDayMonth(date) : "Not this month";
}

function MissedTable({
  rows,
  teams,
  monthWord,
  page,
  size,
  onPage,
  onSize,
}: {
  rows: StudentAttendance[];
  teams: Map<Id, CalendarTeam>;
  monthWord: string;
  page: number;
  size: PageSize;
  onPage: (page: number) => void;
  onSize: (size: PageSize) => void;
}) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * size, current * size);
  return (
    <section
      aria-labelledby="missed-most"
      className="flex w-full flex-col max-md:hidden"
    >
      <div className="flex flex-col gap-1 pb-3">
        <h2
          className="font-semibold text-[17px] text-ink leading-[22px]"
          id="missed-most"
        >
          Missed the most in {monthWord}
        </h2>
        <p className="text-muted text-sm leading-[18px]">
          Excused absences don’t count. Click a name to open their profile.
        </p>
      </div>
      <div className="flex items-center gap-4 border-line border-b py-[10px] max-lg:hidden">
        <span className="flex-1 basis-0 font-medium text-[12px] text-muted uppercase leading-4 tracking-label">
          Student
        </span>
        <span className="w-[110px] shrink-0 font-medium text-[12px] text-muted uppercase leading-4 tracking-label">
          Team
        </span>
        <span className="flex w-[120px] shrink-0 items-center gap-1 font-semibold text-[12px] text-ink uppercase leading-4 tracking-label">
          Missed
          <svg aria-hidden="true" height="10" viewBox="0 0 10 10" width="10">
            <path
              d="M2.5 3.5L5 6.5l2.5-3"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </span>
        <span className="w-[220px] shrink-0 font-medium text-[12px] text-muted uppercase leading-4 tracking-label">
          Rate
        </span>
        <span className="w-[130px] shrink-0 font-medium text-[12px] text-muted uppercase leading-4 tracking-label">
          Last seen
        </span>
        <span className="w-6 shrink-0" />
      </div>
      {rows.length === 0 ? (
        <p className="border-line border-b py-4 text-muted text-sm">
          Nobody has missed a session in {monthWord}.
        </p>
      ) : null}
      <ul className="flex flex-col">
        {shown.map((row) => {
          const alert = isLow(row.rate, LOW_STUDENT_RATE);
          const team = teams.get(row.teamId)?.name ?? "";
          return (
            <li key={row.studentId}>
              <Link
                className="flex items-center gap-4 border-line border-b py-3 outline-none hover:bg-[#FAFAF8] focus-visible:ring-2 focus-visible:ring-ink"
                params={{ memberId: row.studentId }}
                to="/admin/members/$memberId"
              >
                <span className="flex min-w-0 flex-1 basis-0 items-center gap-3">
                  <Initials name={row.name} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-[15px] text-ink leading-5">
                      {row.name}
                    </span>
                    <span className="text-[13px] text-muted leading-4 lg:hidden">
                      {team} · missed {row.absent} of {row.counted} · last seen{" "}
                      {shortDay(row.lastSeen)}
                    </span>
                  </span>
                </span>
                <span className="w-[110px] shrink-0 text-ink text-sm leading-[18px] max-lg:hidden">
                  {team}
                </span>
                <span
                  className={cn(
                    "w-[120px] shrink-0 font-semibold text-sm leading-[18px] max-lg:hidden",
                    alert ? "text-orange-deep" : "text-ink"
                  )}
                >
                  {row.absent} of {row.counted}
                </span>
                <span className="flex w-[220px] shrink-0 items-center gap-[10px] max-lg:w-[120px]">
                  <RateBar
                    alert={alert}
                    className="w-[140px] max-lg:hidden"
                    rate={row.rate}
                  />
                  <span className="font-semibold text-ink text-sm leading-[18px]">
                    {percent(row.rate)}
                  </span>
                </span>
                <span className="w-[130px] shrink-0 text-muted text-sm leading-[18px] max-lg:hidden">
                  {shortDay(row.lastSeen)}
                </span>
                <span className="flex w-6 shrink-0 justify-end text-muted">
                  <ChevronIcon />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Pager
        onPage={onPage}
        onSize={onSize}
        page={current}
        size={size}
        total={rows.length}
      />
    </section>
  );
}

function PhoneView({
  data,
  teams,
  phrase,
  monthWord,
}: {
  data: AcademyAttendance;
  teams: Map<Id, CalendarTeam>;
  phrase: string;
  monthWord: string;
}) {
  const rate = rateOf(data.counts);
  const held = data.sessions.filter((s) => s.ended && !s.cancelled).length;
  return (
    <div className="flex flex-col gap-[18px] md:hidden">
      <div className="flex items-end gap-[10px] rounded-[20px] bg-fog px-[18px] py-4">
        <p className="font-display text-display-sm text-ink leading-[52px]">
          {percent(rate)}
        </p>
        <div className="flex flex-col gap-[2px] pb-1">
          <Delta
            className="text-[13px] leading-4"
            previous={rateOf(data.previousCounts)}
            rate={rate}
            suffix={` vs ${phrase.replace("this", "last")}`}
            upClassName="text-success"
          />
          <p className="text-[13px] text-muted leading-4">
            {plural(held, "session")} · {plural(data.studentCount, "student")}
          </p>
        </div>
      </div>
      <section aria-labelledby="phone-by-team" className="flex flex-col">
        <h2
          className="pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label"
          id="phone-by-team"
        >
          By team
        </h2>
        {data.teams.map(({ team, periodRate }) => {
          const low = isLow(periodRate);
          return (
            <Link
              className="flex min-h-11 items-center gap-3 border-line border-b py-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
              key={team.id}
              params={{ teamId: team.id }}
              to="/admin/teams/$teamId"
            >
              <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[6px]">
                <span className="flex justify-between">
                  <span className="font-semibold text-[15px] text-ink leading-5">
                    {team.name}
                  </span>
                  <span
                    className={cn(
                      "font-semibold text-[15px] leading-5",
                      low ? "text-orange-deep" : "text-ink"
                    )}
                  >
                    {percent(periodRate)}
                  </span>
                </span>
                <RateBar
                  alert={low}
                  className="h-[6px] w-full"
                  rate={periodRate}
                />
              </span>
              <span className="text-muted">
                <ChevronIcon />
              </span>
            </Link>
          );
        })}
      </section>
      <section aria-labelledby="phone-missed" className="flex flex-col">
        <h2
          className="pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label"
          id="phone-missed"
        >
          Missed the most
        </h2>
        {data.missed.filter((row) => row.absent > 0).length === 0 ? (
          <p className="py-3 text-muted text-sm">
            Nobody has missed a session in {monthWord}.
          </p>
        ) : null}
        {data.missed
          .filter((row) => row.absent > 0)
          .slice(0, MISSED_PHONE_ROWS)
          .map((row) => (
            <Link
              className="flex items-center gap-3 border-line border-b py-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
              key={row.studentId}
              params={{ memberId: row.studentId }}
              to="/admin/members/$memberId"
            >
              <Initials name={row.name} />
              <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[2px]">
                <span className="font-semibold text-[15px] text-ink leading-5">
                  {row.name}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  {teams.get(row.teamId)?.name ?? ""} · missed {row.absent} of{" "}
                  {row.counted}
                </span>
              </span>
              <span
                className={cn(
                  "w-10 shrink-0 text-right font-semibold text-[15px] leading-5",
                  isLow(row.rate, LOW_STUDENT_RATE)
                    ? "text-orange-deep"
                    : "text-ink"
                )}
              >
                {percent(row.rate)}
              </span>
            </Link>
          ))}
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <>
      <div className="flex w-full gap-4 max-md:hidden max-lg:flex-wrap">
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton
            className="h-[151px] flex-1 basis-0 rounded-[20px] max-lg:basis-[calc(50%-8px)]"
            key={key}
          />
        ))}
      </div>
      <div className="flex gap-6 max-md:hidden max-lg:flex-col">
        <Skeleton className="h-[338px] flex-1 rounded-[20px]" />
        <Skeleton className="h-[373px] w-[360px] rounded-[20px] max-lg:w-full" />
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        <Skeleton className="h-[84px] w-full rounded-[20px]" />
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton className="h-11 w-full rounded-[12px]" key={key} />
        ))}
      </div>
    </>
  );
}

function exportMissed(
  rows: StudentAttendance[],
  teams: Map<Id, CalendarTeam>,
  month: string
) {
  downloadCsv(`attendance-${month}.csv`, [
    ["Student", "Team", "Missed", "Sessions counted", "Rate", "Last seen"],
    ...rows.map((row) => [
      row.name,
      teams.get(row.teamId)?.name ?? "",
      row.absent,
      row.counted,
      percent(row.rate),
      row.lastSeen ?? "",
    ]),
  ]);
}

function AttendanceBody({
  academyId,
  search,
  onSearchChange,
  kind,
  at,
  today,
}: {
  academyId: Id;
  search: AttendanceSearch;
  onSearchChange: (patch: Patch) => void;
  kind: PeriodKind;
  at: DateOnly;
  today: DateOnly;
}) {
  const ranges = attendanceRanges(kind, at);
  const now = minuteOf(appNow());
  const teamsQuery = useQuery(calendarTeamsQueryOptions(academyId));
  const query = useQuery(
    academyAttendanceQueryOptions(academyId, {
      ...ranges,
      teamId: search.team,
      now,
    })
  );
  const teams = useMemo(
    () => new Map((teamsQuery.data ?? []).map((team) => [team.id, team])),
    [teamsQuery.data]
  );
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
  const { data, isPlaceholderData: dimmed } = query;
  const monthWord = monthName(monthOf(ranges.period.to));
  const phrase = periodPhrase(kind, ranges.period, today);
  const periodHeading =
    kind === "week" ? phrase.replace("week of", "week") : monthWord;
  if (!(data && teamsQuery.data)) {
    return <LoadingState />;
  }
  return (
    <div className={cn("flex flex-col gap-8", { "opacity-60": dimmed })}>
      <div className="flex flex-col gap-8 max-md:hidden">
        <Stats data={data} phrase={phrase} teams={teams} />
        <div className="flex w-full items-start gap-6 max-lg:flex-col">
          <ByTeam
            data={data}
            monthHeading={kind === "week" ? monthWord : "Month"}
            periodHeading={periodHeading}
          />
          <SessionsPanel
            data={data}
            heading={`Sessions ${phrase}`}
            teams={teams}
          />
        </div>
        <MissedTable
          monthWord={monthWord}
          onPage={handlePage}
          onSize={handleSize}
          page={search.page ?? 1}
          rows={data.missed}
          size={search.size ?? DEFAULT_SIZE}
          teams={teams}
        />
      </div>
      <PhoneView
        data={data}
        monthWord={monthWord}
        phrase={phrase}
        teams={teams}
      />
    </div>
  );
}

function defaultAnchor(kind: PeriodKind, today: DateOnly): DateOnly {
  // A week opens on the one holding yesterday: on a Monday that is last week, which
  // has data, rather than a week that has barely started.
  return kind === "week" ? addDays(today, -1) : today;
}

export function AdminAttendanceScreen({
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
  const kind: PeriodKind = search.period ?? "week";
  const at = search.at ?? defaultAnchor(kind, today);
  const ranges = attendanceRanges(kind, at);
  const atLatest = shiftAnchor(kind, at, 1) > today;
  const teams = useQuery(calendarTeamsQueryOptions(academyId)).data ?? [];
  const overview = useQuery({
    ...academyAttendanceQueryOptions(academyId, {
      ...ranges,
      teamId: search.team,
      now: minuteOf(appNow()),
    }),
    throwOnError: false,
  }).data;

  const handleKind = useCallback(
    (next: PeriodKind) =>
      onSearchChange({
        period: next === "week" ? undefined : next,
        at: undefined,
        page: undefined,
      }),
    [onSearchChange]
  );
  const handlePrev = useCallback(
    () => onSearchChange({ at: shiftAnchor(kind, at, -1), page: undefined }),
    [at, kind, onSearchChange]
  );
  const handleNext = useCallback(
    () => onSearchChange({ at: shiftAnchor(kind, at, 1), page: undefined }),
    [at, kind, onSearchChange]
  );
  const handleTeam = useCallback(
    (team: string | undefined) => onSearchChange({ team, page: undefined }),
    [onSearchChange]
  );
  const teamIndex = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams]
  );
  const handleExport = useCallback(() => {
    if (overview) {
      exportMissed(overview.missed, teamIndex, monthOf(ranges.period.to));
    }
  }, [overview, ranges.period.to, teamIndex]);

  const label = periodLabel(kind, ranges.period, today);
  const phoneEyebrow =
    kind === "week"
      ? `${label.split(",")[0]} · ${rangeLabel(ranges.period.from, ranges.period.to)}`
      : label;

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            <span className="max-md:hidden">
              {membership?.academy.name}
              {overview ? ` · ${plural(overview.studentCount, "student")}` : ""}
            </span>
            <span className="md:hidden">{phoneEyebrow}</span>
          </Eyebrow>
          <PageTitle>Attendance</PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">
          <button
            className={exportButtonClass}
            disabled={!overview}
            onClick={handleExport}
            type="button"
          >
            Export
          </button>
        </PageActions>
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 max-md:w-full max-md:flex-col max-md:items-stretch">
          <Segmented
            label="Period"
            onChange={handleKind}
            options={PERIOD_OPTIONS}
            value={kind}
          />
          <div className="flex items-center gap-[6px] max-md:hidden">
            <ArrowButton
              direction="left"
              label="Previous period"
              onClick={handlePrev}
            />
            <ArrowButton
              direction="right"
              disabled={atLatest}
              label="Next period"
              onClick={handleNext}
            />
            <h2
              aria-live="polite"
              className="pl-2 font-semibold text-[17px] text-ink leading-[22px]"
            >
              {label}
            </h2>
          </div>
        </div>
        <div className="max-md:hidden">
          <TeamSelect onChange={handleTeam} teams={teams} value={search.team} />
        </div>
      </div>
      <QueryBoundary what="attendance">
        <AttendanceBody
          academyId={academyId}
          at={at}
          kind={kind}
          onSearchChange={onSearchChange}
          search={search}
          today={today}
        />
      </QueryBoundary>
    </>
  );
}
