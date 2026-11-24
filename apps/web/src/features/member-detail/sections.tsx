/*
 * Data sections of the member detail pages. Each one reads its own query and sits in a
 * QueryBoundary, so a failed section shows "Couldn't load …" with Try again while the
 * rest of the page stays (spec AGW-0).
 */
import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { QueryBoundary } from "@/components/error-state";
import { describeAudit } from "@/features/audit-log/describe";
import { auditLogQueryOptions } from "@/features/audit-log/queries";
import { methodLabel } from "@/features/fees/periods";
import {
  AttendanceBody,
  AttendanceSkeleton,
  bestRecordIds,
  Card,
  dayMonth,
  MonthToggle,
  monthName,
  PhoneAttendanceCard,
  percent,
  RecordRow,
  RecordsSkeleton,
  recordTitle,
  StatusPill,
  sessionDay,
  shortDay,
} from "@/features/member-detail/parts";
import {
  type CoachSummary,
  coachRecordsQueryOptions,
  coachSummaryQueryOptions,
  type MemberProfile,
  type StudentRecordItem,
  studentAttendanceQueryOptions,
  studentFeesQueryOptions,
  studentRecordsQueryOptions,
} from "@/features/member-detail/queries";
import type { DateOnly, Id } from "@/features/types";
import {
  firstName,
  formatAmount,
  formatRelativeDay,
  formatTime,
} from "@/lib/format";

export interface MonthState {
  currentLabel: string;
  key: string;
  label: string;
  onChange: (previous: boolean) => void;
  previousLabel: string;
  showingPrevious: boolean;
}

// ---------------------------------------------------------------- attendance

function AttendanceData({
  academyId,
  studentId,
  month,
  today,
  viewerId,
  timeZone,
}: {
  academyId: Id;
  studentId: Id;
  month: MonthState;
  today: DateOnly;
  viewerId: Id;
  timeZone: string;
}) {
  const { data } = useQuery(
    studentAttendanceQueryOptions(academyId, studentId, {
      month: month.key,
      today,
      viewerId,
      timeZone,
    })
  );
  if (!data) {
    return <AttendanceSkeleton />;
  }
  return <AttendanceBody month={data} today={today} />;
}

/** Attendance card on web (8JO-0, DTR-0). */
export function AttendanceCard(props: {
  academyId: Id;
  studentId: Id;
  month: MonthState;
  today: DateOnly;
  viewerId: Id;
  timeZone: string;
}) {
  const { month } = props;
  return (
    <Card
      action={
        <MonthToggle
          current={month.currentLabel}
          onChange={month.onChange}
          previous={month.previousLabel}
          showingPrevious={month.showingPrevious}
        />
      }
      className="gap-[18px]"
      labelledBy="attendance-title"
      title="Attendance"
    >
      <QueryBoundary what="attendance">
        <AttendanceData {...props} />
      </QueryBoundary>
    </Card>
  );
}

function PhoneAttendanceData(props: {
  academyId: Id;
  studentId: Id;
  month: MonthState;
  today: DateOnly;
  viewerId: Id;
  timeZone: string;
}) {
  const { data } = useQuery(
    studentAttendanceQueryOptions(props.academyId, props.studentId, {
      month: props.month.key,
      today: props.today,
      viewerId: props.viewerId,
      timeZone: props.timeZone,
    })
  );
  if (!data) {
    return <Skeleton className="h-[148px] rounded-[20px]" />;
  }
  return <PhoneAttendanceCard month={data} monthLabel={props.month.label} />;
}

/** Phone attendance card (7F2-0). */
export function PhoneAttendance(props: {
  academyId: Id;
  studentId: Id;
  month: MonthState;
  today: DateOnly;
  viewerId: Id;
  timeZone: string;
}) {
  return (
    <QueryBoundary className="rounded-[20px] bg-fog" what="attendance">
      <PhoneAttendanceData {...props} />
    </QueryBoundary>
  );
}

// ---------------------------------------------------------------- records

function recordDetail(
  item: StudentRecordItem,
  today: DateOnly,
  viewerId: Id,
  best: Set<string>
): string {
  if (item.recordType === "academic") {
    const by =
      item.recordedById === viewerId ? "you" : firstName(item.recordedByName);
    const verb = item.recordedById === viewerId ? "added" : "typed in";
    return `Academic, ${verb} by ${by} on ${dayMonth(item.recordedOn)}, ${item.hasFile ? "with a file" : "no file"}`;
  }
  const when = shortDay(item.recordedOn, today);
  if (item.status === "verified" && item.verifiedByName) {
    const suffix = best.has(item.id) ? ". Best so far." : "";
    return `Result, ${when}, verified by Coach ${firstName(item.verifiedByName)}${suffix}`;
  }
  const by =
    item.recordedById === viewerId
      ? "you"
      : `Coach ${firstName(item.recordedByName)}`;
  return `Result, ${when}, logged by ${by}`;
}

function AdminRecordBadge({
  item,
  waitingFor,
}: {
  item: StudentRecordItem;
  waitingFor: string | null;
}) {
  if (item.status === "verified") {
    return <StatusPill tone="verified">Verified</StatusPill>;
  }
  if (item.status === "rejected") {
    return <StatusPill tone="rejected">Rejected</StatusPill>;
  }
  return (
    <StatusPill tone="waiting">
      {waitingFor ? `Waiting for ${waitingFor}` : "Waiting for review"}
    </StatusPill>
  );
}

/** Coach view (DTR-0): their own results wait for a colleague; others get "Review". */
function CoachRecordAction({
  item,
  viewerId,
}: {
  item: StudentRecordItem;
  viewerId: Id;
}) {
  if (item.status === "verified") {
    return <StatusPill tone="verified">Verified</StatusPill>;
  }
  if (item.status === "rejected") {
    return <StatusPill tone="rejected">Rejected</StatusPill>;
  }
  if (item.recordedById === viewerId) {
    return <StatusPill tone="waiting">Waiting for review</StatusPill>;
  }
  return (
    <Link
      className={cn(
        buttonVariants({ size: "xs" }),
        "min-h-8 px-[14px] text-[13px]"
      )}
      search={{ id: item.id }}
      to="/coach/records"
    >
      Review
    </Link>
  );
}

function RecordsList({
  academyId,
  studentId,
  today,
  viewerId,
  scope,
  waitingFor,
}: {
  academyId: Id;
  studentId: Id;
  today: DateOnly;
  viewerId: Id;
  scope: "admin" | "coach";
  waitingFor: string | null;
  seeAllTo: "/admin/records" | "/coach/records";
}) {
  const { data } = useQuery(studentRecordsQueryOptions(academyId, studentId));
  if (!data) {
    return <RecordsSkeleton />;
  }
  if (data.items.length === 0) {
    return (
      <p className="border-line border-t pt-4 text-muted text-sm leading-5">
        No records or results yet.
      </p>
    );
  }
  const best = bestRecordIds(data.items);
  return (
    <ul className="flex flex-col">
      {data.items.slice(0, 3).map((item) => (
        <RecordRow
          detail={recordDetail(item, today, viewerId, best)}
          key={item.id}
          recordType={item.recordType}
          title={recordTitle(item)}
          trailing={
            scope === "admin" ? (
              <AdminRecordBadge item={item} waitingFor={waitingFor} />
            ) : (
              <CoachRecordAction item={item} viewerId={viewerId} />
            )
          }
        />
      ))}
    </ul>
  );
}

/** Records and results card (8JO-0 admin, DTR-0 coach). */
export function RecordsCard(props: {
  academyId: Id;
  studentId: Id;
  today: DateOnly;
  viewerId: Id;
  scope: "admin" | "coach";
  waitingFor: string | null;
  seeAllTo: "/admin/records" | "/coach/records";
}) {
  // The "See all N" count; left out if the list fails (the section says so).
  const total = useQuery({
    ...studentRecordsQueryOptions(props.academyId, props.studentId),
    throwOnError: false,
  }).data?.total;
  return (
    <Card
      action={
        total ? (
          <Link
            className="font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-[3px]"
            to={props.seeAllTo}
          >
            See all {total}
          </Link>
        ) : null
      }
      className="gap-1.5"
      labelledBy="records-title"
      title="Records and results"
    >
      <QueryBoundary what="records">
        <RecordsList {...props} />
      </QueryBoundary>
    </Card>
  );
}

// ---------------------------------------------------------------- fees

function FeesData({
  academyId,
  studentId,
  today,
  timeZone,
  recordPayment,
}: {
  academyId: Id;
  studentId: Id;
  today: DateOnly;
  timeZone: string;
  recordPayment: ReactNode;
}) {
  const { data } = useQuery(
    studentFeesQueryOptions(academyId, studentId, { today, scope: "admin" })
  );
  if (!data) {
    return <Skeleton className="h-[160px] rounded-[14px] bg-white" />;
  }
  const { unpaid } = data;
  return (
    <>
      {unpaid ? (
        <div className="flex flex-col gap-1.5 rounded-[14px] border border-[#F3C9A8] bg-white p-4">
          <p className="font-semibold text-[13px] text-orange-deep uppercase leading-4 tracking-label">
            {monthName(unpaid.month)} unpaid
          </p>
          {unpaid.amount ? (
            <p className="flex items-baseline gap-1.5">
              <span className="font-semibold text-[15px] text-muted leading-[18px]">
                {unpaid.currency}
              </span>
              <span className="font-display text-2xl text-ink leading-[95%]">
                {formatAmount(unpaid.amount)}
              </span>
            </p>
          ) : null}
          <p className="text-orange-deep text-sm leading-[18px]">
            {unpaid.daysOverdue
              ? `${unpaid.daysOverdue} days overdue`
              : "Due now"}
          </p>
          {recordPayment}
        </div>
      ) : (
        <p className="rounded-[14px] bg-white p-4 text-ink text-sm leading-5">
          Nothing owed right now.
        </p>
      )}
      <ul className="flex flex-col">
        {(data.history ?? []).slice(0, 4).map((fee) => (
          <li
            className="flex justify-between gap-3 border-[#E2E2DF] border-b py-[10px]"
            key={fee.id}
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink text-sm leading-[18px]">
                {monthName(fee.periodStart)}
              </span>
              <span className="text-[13px] text-muted leading-4">
                Paid{" "}
                {fee.paidAt ? dayMonth(localDay(fee.paidAt, timeZone)) : ""},{" "}
                {methodLabel(fee.method).toLowerCase()}
              </span>
            </span>
            <span className="text-ink text-sm leading-[18px]">
              {fee.currency} {formatAmount(fee.amount)}
            </span>
          </li>
        ))}
      </ul>
      {data.history?.length === 0 ? (
        <p className="text-muted text-sm leading-5">
          No payments recorded yet.
        </p>
      ) : null}
    </>
  );
}

function localDay(at: string, timeZone: string): DateOnly {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

/** Fees card on admin web (8JO-0). */
export function FeesCard(props: {
  academyId: Id;
  studentId: Id;
  today: DateOnly;
  timeZone: string;
  recordPayment: ReactNode;
}) {
  return (
    <Card
      className="gap-[14px]"
      labelledBy="fees-title"
      title="Fees"
      tone="fog"
    >
      <QueryBoundary what="fees">
        <FeesData {...props} />
      </QueryBoundary>
    </Card>
  );
}

/** One line for the phone Fees row and the coach's flag: "November unpaid · 18 days overdue · RWF 30,000". */
export function useUnpaidLine(
  academyId: Id,
  studentId: Id,
  today: DateOnly,
  scope: "admin" | "coach"
) {
  const query = useQuery({
    ...studentFeesQueryOptions(academyId, studentId, { today, scope }),
    throwOnError: false,
  });
  return query;
}

// ---------------------------------------------------------------- coach work

function SessionRows({
  summary,
  today,
}: {
  summary: CoachSummary;
  today: DateOnly;
}) {
  if (summary.recentSessions.length === 0) {
    return (
      <p className="border-line border-t pt-4 text-muted text-sm leading-5">
        No sessions with attendance on their teams this month.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {summary.recentSessions.map((s) => (
        <li
          className="flex items-center gap-4 border-line border-t py-3 text-sm leading-[18px]"
          key={s.key}
        >
          <span className="w-[120px] shrink-0 font-semibold text-ink max-md:w-[92px]">
            {sessionDay(s.date, today)}
          </span>
          <span className="min-w-0 flex-1 text-ink">
            {s.title}, {s.detail}
          </span>
          <span
            className={cn(
              "font-semibold text-[13px] leading-4",
              s.status === "live" ? "text-orange-deep" : "text-muted"
            )}
          >
            {s.status === "live" ? "Live" : "Closed"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SmallStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-[36px] text-ink leading-[95%]">{value}</p>
      <p className="text-[13px] text-muted leading-4">{label}</p>
    </div>
  );
}

function CoachingData({
  academyId,
  coachId,
  teamIds,
  month,
  today,
  pronoun,
}: {
  academyId: Id;
  coachId: Id;
  teamIds: Id[];
  month: MonthState;
  today: DateOnly;
  pronoun: string;
}) {
  const summary = useQuery(
    coachSummaryQueryOptions(academyId, coachId, {
      month: month.key,
      today,
      teamIds,
    })
  ).data;
  if (!summary) {
    return <AttendanceSkeleton />;
  }
  const open =
    summary.closedOnTime === null
      ? null
      : summary.sessionsRun - summary.closedOnTime;
  return (
    <>
      <div className="flex items-end gap-12 max-md:flex-col max-md:items-start max-md:gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-[64px] text-ink leading-[90%]">
            {summary.sessionsRun}
          </p>
          <p className="text-muted text-sm leading-[18px]">
            sessions run{open ? `, ${open} left open` : ""}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap gap-8">
          <SmallStat
            label="students ticked by hand"
            value={String(summary.tickedByHand)}
          />
          <SmallStat
            label={`attendance on ${pronoun} teams`}
            value={percent(summary.attendanceRate)}
          />
          <SmallStat
            label="results logged"
            value={String(summary.resultsLogged)}
          />
        </div>
      </div>
      <SessionRows summary={summary} today={today} />
    </>
  );
}

/** "Coaching in November" (DNS-0). */
export function CoachingCard(props: {
  academyId: Id;
  coachId: Id;
  teamIds: Id[];
  month: MonthState;
  today: DateOnly;
  pronoun: string;
}) {
  const { month } = props;
  return (
    <Card
      action={
        <MonthToggle
          current={month.currentLabel}
          onChange={month.onChange}
          previous={month.previousLabel}
          showingPrevious={month.showingPrevious}
        />
      }
      className="gap-[18px]"
      labelledBy="coaching-title"
      title={`Coaching in ${month.label}`}
    >
      <QueryBoundary what="coaching">
        <CoachingData {...props} />
      </QueryBoundary>
    </Card>
  );
}

function PhoneSessionsData(props: {
  academyId: Id;
  coachId: Id;
  teamIds: Id[];
  month: MonthState;
  today: DateOnly;
}) {
  const summary = useQuery(
    coachSummaryQueryOptions(props.academyId, props.coachId, {
      month: props.month.key,
      today: props.today,
      teamIds: props.teamIds,
    })
  ).data;
  if (!summary) {
    return <Skeleton className="h-[118px] rounded-[20px]" />;
  }
  const planned =
    summary.planned === null
      ? `${summary.tickedByHand} ticked by hand`
      : `of ${summary.planned} planned · ${summary.cancelled ?? 0} cancelled`;
  return (
    <section className="flex flex-col gap-[10px] rounded-[20px] bg-fog p-4">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium text-[13px] text-muted leading-4">
            Sessions run in {props.month.label}
          </h2>
          <p className="font-display text-[36px] text-ink leading-9">
            {summary.sessionsRun}
          </p>
        </div>
        <p className="text-[13px] text-muted leading-4">{planned}</p>
      </div>
      <p className="text-[13px] text-ink leading-4">
        {summary.closedOnTime === null
          ? `Attendance on their teams: ${percent(summary.attendanceRate)}`
          : `Closed out on time: ${summary.closedOnTime} of ${summary.sessionsRun}`}
      </p>
    </section>
  );
}

/** Phone coaching card (CHQ-0). */
export function PhoneSessionsCard(props: {
  academyId: Id;
  coachId: Id;
  teamIds: Id[];
  month: MonthState;
  today: DateOnly;
}) {
  return (
    <QueryBoundary className="rounded-[20px] bg-fog" what="sessions">
      <PhoneSessionsData {...props} />
    </QueryBoundary>
  );
}

function CoachRecordsData({
  academyId,
  coachId,
  today,
}: {
  academyId: Id;
  coachId: Id;
  today: DateOnly;
}) {
  const { data } = useQuery(
    coachRecordsQueryOptions(academyId, coachId, { today })
  );
  if (!data) {
    return <RecordsSkeleton />;
  }
  if (data.groups.length === 0) {
    return (
      <p className="border-line border-t pt-4 text-muted text-sm leading-5">
        No results logged or records reviewed yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {data.groups.slice(0, 3).map((group) => (
        <RecordRow
          detail={group.detail}
          key={group.key}
          recordType={group.recordType}
          title={group.title}
          trailing={
            <StatusPill
              tone={group.status === "verified" ? "verified" : "waiting"}
            >
              {group.status === "verified" ? "Verified" : "Waiting for review"}
            </StatusPill>
          }
        />
      ))}
    </ul>
  );
}

/** "Results and reviews" (DNS-0). */
export function CoachRecordsCard(props: {
  academyId: Id;
  coachId: Id;
  today: DateOnly;
}) {
  const total = useQuery({
    ...coachRecordsQueryOptions(props.academyId, props.coachId, {
      today: props.today,
    }),
    throwOnError: false,
  }).data?.total;
  return (
    <Card
      action={
        total ? (
          <Link
            className="font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-[3px]"
            to="/admin/records"
          >
            See all {total}
          </Link>
        ) : null
      }
      className="gap-1.5"
      labelledBy="results-title"
      title="Results and reviews"
    >
      <QueryBoundary what="results">
        <CoachRecordsData {...props} />
      </QueryBoundary>
    </Card>
  );
}

/** Teams coached (DNS-0): one row per team, linking to the team page. */
export function TeamsCoachedCard({ profile }: { profile: MemberProfile }) {
  return (
    <Card
      className="gap-[10px]"
      labelledBy="teams-coached-title"
      title="Teams coached"
      tone="fog"
    >
      {profile.teams.length === 0 ? (
        <p className="text-muted text-sm leading-5">Not on a team yet.</p>
      ) : null}
      <ul className="flex flex-col gap-[10px]">
        {profile.teams.map((team, index) => {
          const others = team.coaches.filter((c) => c.id !== profile.userId);
          const withText =
            others.length > 0
              ? `, with ${others.map((c) => `Coach ${firstName(c.name)}`).join(", ")}`
              : "";
          return (
            <li key={team.id}>
              <Link
                className="flex min-h-11 items-center gap-3 rounded-[14px] bg-white px-[14px] py-3 outline-none hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-ink"
                params={{ teamId: team.id }}
                to="/admin/teams/$teamId"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-[10px] shrink-0 rounded-full",
                    index === 0 ? "bg-orange" : "bg-ink"
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold text-[15px] text-ink leading-5">
                    {team.name}
                  </span>
                  <span className="text-[13px] text-muted leading-4">
                    {team.studentCount} students{withText}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-muted"
                  strokeWidth={1.6}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const MS_PER_DAY = 86_400_000;
const DAYS_IN_WEEK = 7;

/** "16:05" today, "Sat" this week, "14 Nov" before (DNS-0 Recent activity). */
function activityWhen(at: string, timeZone: string, now: Date): string {
  const day = formatRelativeDay(at, timeZone, now);
  if (day === "Today") {
    return formatTime(at, timeZone);
  }
  if (now.getTime() - Date.parse(at) < DAYS_IN_WEEK * MS_PER_DAY) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
    }).format(new Date(at));
  }
  return day;
}

function ActivityData({
  academyId,
  userId,
  timeZone,
  now,
}: {
  academyId: Id;
  userId: Id;
  timeZone: string;
  now: Date;
}) {
  const rows = useQuery(
    auditLogQueryOptions(academyId, {
      actorId: userId,
      date: "30d",
      type: "all",
    })
  ).data?.items;
  if (!rows) {
    return <RecordsSkeleton />;
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted text-sm leading-5">
        Nothing in the last 30 days.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {rows.slice(0, 4).map((entry) => {
        const when = activityWhen(entry.createdAt, timeZone, now);
        return (
          <li className="flex gap-3 py-2" key={entry.id}>
            <span className="w-[54px] shrink-0 text-[13px] text-muted leading-[18px]">
              {when}
            </span>
            <span className="text-ink text-sm leading-[18px]">
              {describeAudit(entry)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Recent activity (DNS-0): their latest audit rows, with a link to the full log. */
export function RecentActivityCard(props: {
  academyId: Id;
  userId: Id;
  timeZone: string;
  now: Date;
}) {
  return (
    <Card
      action={
        <Link
          className="font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-[3px]"
          search={{ person: props.userId }}
          to="/admin/activity"
        >
          Activity log
        </Link>
      }
      className="gap-1"
      labelledBy="activity-title"
      title="Recent activity"
    >
      <QueryBoundary what="activity">
        <ActivityData {...props} />
      </QueryBoundary>
    </Card>
  );
}
