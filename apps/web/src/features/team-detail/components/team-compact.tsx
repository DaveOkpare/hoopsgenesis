import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@hoops-genesis/ui/components/tabs";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type MouseEvent, type ReactNode, useCallback } from "react";

import { ErrorState } from "@/components/error-state";
import { PlusIcon } from "@/components/icons";
import { addDays, formatWeekdayDayMonth } from "@/features/sessions/time";
import { isLowAttendance } from "@/features/team-detail/components/attendance";
import { ProfileLink } from "@/features/team-detail/components/profile-link";
import { monthOf, RowMenu } from "@/features/team-detail/components/row-menu";
import {
  type TeamDetail,
  type TeamFeeStatus,
  type TeamStudent,
  teamSessionsQueryOptions,
} from "@/features/team-detail/queries";
import { joinNames, plural } from "@/features/teams/format";
import type { DateOnly, Id } from "@/features/types";
import { firstName, initials } from "@/lib/format";

export type CoachTeamTab = "roster" | "sessions" | "results";
export type AdminTeamSheet = "coaches" | "remove";

const SKELETON_ROWS = ["a", "b", "c", "d"] as const;

function BackChevron({ stroke, width }: { stroke: string; width: number }) {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M10 3L5 8l5 5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={width}
      />
    </svg>
  );
}

function percentText(percent: number | null): string | null {
  return percent === null ? null : `${percent}% this month`;
}

function StudentAvatar({ name }: { name: string }) {
  return (
    <Avatar size={36}>
      <AvatarFallback className="text-[12px]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

// ---------------------------------------------------------------- coach (HAB-0)

/** "Fees overdue" / "Not paid yet" in orange, "paid" muted (coaches never see amounts). */
function CoachFee({ fee }: { fee: TeamFeeStatus }) {
  if (fee.kind === "paid") {
    return <>paid</>;
  }
  return (
    <span className="font-semibold text-orange-deep">
      {fee.kind === "overdue" ? "Fees overdue" : "Not paid yet"}
    </span>
  );
}

function CoachRosterRow({
  student,
  teamName,
  onRemove,
  onLogResult,
}: {
  student: TeamStudent;
  teamName: string;
  onRemove: (event: MouseEvent<HTMLElement>) => void;
  onLogResult: (event: MouseEvent<HTMLElement>) => void;
}) {
  const percent = percentText(student.attendancePercent);
  return (
    <li className="flex items-center gap-3 border-line border-b py-[11px] last:border-b-0">
      <ProfileLink
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ink"
        userId={student.user.id}
        viewAs="coach"
      >
        <StudentAvatar name={student.user.name} />
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate font-semibold text-[15px] text-ink leading-5">
            {student.user.name}
          </span>
          <span className="text-[13px] text-muted leading-4">
            <span
              className={cn(
                isLowAttendance(student.attendancePercent) &&
                  "font-semibold text-orange-deep"
              )}
            >
              {percent ?? "No sessions yet"}
            </span>
            {" · "}
            <CoachFee fee={student.fee} />
          </span>
        </span>
      </ProfileLink>
      <RowMenu
        className="-my-2 -mr-2 size-11"
        onLogResult={onLogResult}
        onRemove={onRemove}
        student={student}
        teamName={teamName}
        viewAs="coach"
      />
    </li>
  );
}

function sessionDay(date: DateOnly, today: DateOnly): string {
  if (date === today) {
    return "Today";
  }
  if (date === addDays(today, 1)) {
    return "Tomorrow";
  }
  return formatWeekdayDayMonth(date);
}

function SessionsTab({
  academyId,
  teamId,
  today,
}: {
  academyId: Id;
  teamId: Id;
  today: DateOnly;
}) {
  const query = useQuery({
    ...teamSessionsQueryOptions(academyId, teamId, today),
    throwOnError: false,
  });
  if (query.isError && !query.data) {
    return (
      <ErrorState
        error={query.error}
        onRetry={query.refetch}
        what="the team’s sessions"
      />
    );
  }
  if (!query.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {SKELETON_ROWS.map((key) => (
          <Skeleton className="h-[52px] rounded-md" key={key} />
        ))}
      </div>
    );
  }
  if (query.data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-[15px] text-muted leading-5">
          No sessions in the next four weeks.
        </p>
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          to="/coach/calendar/new"
        >
          <PlusIcon />
          New event
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {query.data.map((session) => (
        <li
          className="border-line border-b last:border-b-0"
          key={`${session.eventId}-${session.sessionDate}`}
        >
          <Link
            className="flex items-center gap-3 py-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
            params={{ eventId: session.eventId }}
            search={{ date: session.sessionDate }}
            to="/coach/sessions/$eventId"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="truncate font-semibold text-[15px] text-ink leading-5">
                {sessionDay(session.sessionDate, today)}
                {session.startTime ? ` ${session.startTime}` : ""}
              </span>
              <span
                className={cn(
                  "truncate text-[13px] leading-4",
                  session.cancelled
                    ? "font-semibold text-orange-deep"
                    : "text-muted"
                )}
              >
                {[
                  session.cancelled ? "Cancelled" : null,
                  session.title,
                  session.location,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span aria-hidden="true" className="rotate-180">
              <BackChevron stroke="#6B6B6B" width={1.6} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ResultsTab({ detail }: { detail: TeamDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col">
        {detail.students.map((student) => (
          <li
            className="flex items-center gap-3 border-line border-b py-[11px] last:border-b-0"
            key={student.user.id}
          >
            <StudentAvatar name={student.user.name} />
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="truncate font-semibold text-[15px] text-ink leading-5">
                {student.user.name}
              </span>
              <span className="truncate text-[13px] text-muted leading-4">
                {student.latestResult ?? "No verified result yet"}
              </span>
            </span>
            <Link
              className={buttonVariants({
                size: "xs",
                variant: "outline",
                className: "shrink-0 px-3",
              })}
              search={{ student: student.user.id }}
              to="/coach/results/new"
            >
              Log
              <span className="sr-only"> a result for {student.user.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted leading-[18px]">
        Latest verified result for each student. New results wait in Records
        until another coach verifies them.
      </p>
    </div>
  );
}

/** Coach team page below 1024px (HAB-0): Roster, Sessions and Results tabs. */
export function CoachCompactView({
  academyId,
  detail,
  today,
  tab,
  onTabChange,
  onAddStudent,
  onRemove,
  onLogResult,
}: {
  academyId: Id;
  detail: TeamDetail;
  today: DateOnly;
  tab: CoachTeamTab;
  onTabChange: (tab: CoachTeamTab) => void;
  onAddStudent: () => void;
  onRemove: (event: MouseEvent<HTMLElement>) => void;
  onLogResult: (event: MouseEvent<HTMLElement>) => void;
}) {
  const { team } = detail;
  const eyebrow = [
    detail.sport,
    plural(detail.students.length, "student", "students"),
    percentText(detail.attendancePercent),
  ]
    .filter(Boolean)
    .join(" · ");
  const handleTab = useCallback(
    (value: unknown) => {
      if (value === "roster" || value === "sessions" || value === "results") {
        onTabChange(value);
      }
    },
    [onTabChange]
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-[10px] pt-2">
        <Link
          className="flex w-fit items-center gap-1 rounded-sm font-medium text-[15px] text-ink leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
          to="/coach/teams"
        >
          <BackChevron stroke="#111111" width={1.8} />
          My teams
        </Link>
        <p className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label">
          {eyebrow}
        </p>
        <div className="flex items-end justify-between gap-3">
          <h1 className="min-w-0 break-words font-display text-display-sm text-ink uppercase leading-[52px]">
            {team.name}
          </h1>
          <button
            className="flex shrink-0 cursor-pointer items-center gap-[6px] rounded-full bg-ink px-4 py-[10px] font-semibold text-sm text-white leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
            onClick={onAddStudent}
            type="button"
          >
            <PlusIcon className="size-[14px]" />
            Add student
          </button>
        </div>
      </div>
      <Tabs className="gap-5" onValueChange={handleTab} value={tab}>
        <TabsList className="flex w-full">
          <TabsTrigger className="flex-1" value="roster">
            Roster
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="sessions">
            Sessions
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="results">
            Results
          </TabsTrigger>
        </TabsList>
        <TabsContent className="flex flex-col gap-5" value="roster">
          {detail.students.length === 0 ? (
            <p className="text-[15px] text-muted leading-5">
              No students yet. Use Add student to put someone who already joined
              on {team.name}.
            </p>
          ) : (
            <ul className="flex flex-col">
              {detail.students.map((student) => (
                <CoachRosterRow
                  key={student.user.id}
                  onLogResult={onLogResult}
                  onRemove={onRemove}
                  student={student}
                  teamName={team.name}
                />
              ))}
            </ul>
          )}
          <p className="text-[13px] text-muted leading-[18px]">
            You see who is behind on fees, not amounts. Tap ··· to remove
            someone from {team.name}.
          </p>
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab academyId={academyId} teamId={team.id} today={today} />
        </TabsContent>
        <TabsContent value="results">
          <ResultsTab detail={detail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------- admin (7S4-0)

function AdminFee({ fee, today }: { fee: TeamFeeStatus; today: DateOnly }) {
  if (fee.kind === "paid") {
    return (
      <span className="text-[13px] text-muted leading-4">
        Paid for {monthOf(today)}
      </span>
    );
  }
  return (
    <span className="font-medium text-[13px] text-orange-deep leading-4">
      {fee.kind === "overdue"
        ? `Fees ${fee.days} days overdue`
        : "Not paid yet"}
    </span>
  );
}

const COACH_AVATAR_TONES = [
  "bg-ink text-white",
  "bg-orange text-ink",
  "bg-white text-ink",
] as const;

function CoachesStrip({
  detail,
  onEdit,
}: {
  detail: TeamDetail;
  onEdit: () => void;
}) {
  const names = detail.coaches.map((c) => `Coach ${firstName(c.user.name)}`);
  return (
    <section className="flex items-center gap-[10px] rounded-md bg-fog px-[14px] py-3">
      {detail.coaches.length > 0 ? (
        <span aria-hidden="true" className="flex shrink-0">
          {detail.coaches.slice(0, COACH_AVATAR_TONES.length).map((c, i) => (
            <span
              className={cn(
                "flex size-[30px] items-center justify-center rounded-full border-2 border-fog font-semibold text-[11px] leading-[14px]",
                COACH_AVATAR_TONES[i],
                i > 0 && "-ml-2"
              )}
              key={c.user.id}
            >
              {initials(c.user.name)}
            </span>
          ))}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label">
          Coaches
        </h2>
        <p
          className={cn(
            "font-semibold text-sm leading-[18px]",
            names.length > 0 ? "text-ink" : "text-orange-deep"
          )}
        >
          {names.length > 0 ? joinNames(names) : "No coach yet"}
        </p>
      </div>
      <button
        className="-my-3 -mr-2 shrink-0 cursor-pointer rounded-sm px-2 py-3 font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-2 outline-none [text-underline-position:from-font] focus-visible:ring-2 focus-visible:ring-ink"
        onClick={onEdit}
        type="button"
      >
        {names.length > 0 ? "Edit" : "Add"}
        <span className="sr-only"> coaches</span>
      </button>
    </section>
  );
}

function AdminRosterRow({
  student,
  today,
}: {
  student: TeamStudent;
  today: DateOnly;
}) {
  return (
    <li className="border-line border-b">
      <ProfileLink
        className="flex items-center gap-3 py-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
        userId={student.user.id}
        viewAs="admin"
      >
        <StudentAvatar name={student.user.name} />
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate font-semibold text-[15px] text-ink leading-5">
            {student.user.name}
          </span>
          <AdminFee fee={student.fee} today={today} />
        </span>
        <span
          className={cn(
            "w-11 shrink-0 text-right font-semibold text-[15px] leading-5",
            isLowAttendance(student.attendancePercent)
              ? "text-orange-deep"
              : "text-ink"
          )}
        >
          {student.attendancePercent === null
            ? "—"
            : `${student.attendancePercent}%`}
        </span>
      </ProfileLink>
    </li>
  );
}

function MoreCircleIcon() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="5" cy="12" fill="#111111" r="1.8" />
      <circle cx="12" cy="12" fill="#111111" r="1.8" />
      <circle cx="19" cy="12" fill="#111111" r="1.8" />
    </svg>
  );
}

/** Admin team page below 1024px (7S4-0). */
export function AdminCompactView({
  detail,
  today,
  onAddStudent,
  onOpenSheet,
}: {
  detail: TeamDetail;
  today: DateOnly;
  onAddStudent: () => void;
  onOpenSheet: (sheet: AdminTeamSheet) => void;
}) {
  const { team } = detail;
  const subtitle = [
    detail.sport,
    plural(detail.students.length, "student", "students"),
    percentText(detail.attendancePercent),
  ]
    .filter(Boolean)
    .join(" · ");
  const openCoaches = useCallback(() => onOpenSheet("coaches"), [onOpenSheet]);
  const openRemove = useCallback(() => onOpenSheet("remove"), [onOpenSheet]);
  return (
    <div className="flex flex-col gap-4">
      <Link
        className="flex w-fit items-center gap-[6px] rounded-sm py-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label outline-none focus-visible:ring-2 focus-visible:ring-ink"
        to="/admin/teams"
      >
        <BackChevron stroke="#6B6B6B" width={1.6} />
        Teams
      </Link>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words font-display text-[52px] text-ink uppercase leading-[50px]">
            {team.name}
          </h1>
          <p className="text-muted text-sm leading-[18px]">{subtitle}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`More for ${team.name}`}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink aria-expanded:bg-fog"
          >
            <MoreCircleIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={openCoaches}>
              Edit coaches
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={detail.students.length === 0}
              onClick={openRemove}
              variant="destructive"
            >
              Remove a student…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <button
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-5 py-[13px] font-semibold text-[15px] text-white leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
        onClick={onAddStudent}
        type="button"
      >
        <PlusIcon />
        Add student
      </button>
      <CoachesStrip detail={detail} onEdit={openCoaches} />
      <section aria-labelledby="team-students" className="flex flex-col">
        <div className="flex justify-between pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
          <h2 id="team-students">Students · {detail.students.length}</h2>
          <span aria-hidden="true">This month</span>
        </div>
        {detail.students.length === 0 ? (
          <p className="py-4 text-[15px] text-muted leading-5">
            No students yet. Use Add student to put someone who already joined
            on {team.name}.
          </p>
        ) : (
          <ul className="flex flex-col">
            {detail.students.map((student) => (
              <AdminRosterRow
                key={student.user.id}
                student={student}
                today={today}
              />
            ))}
          </ul>
        )}
        {detail.students.length > 0 ? (
          <p className="pt-3 text-[13px] text-muted leading-[18px]">
            Tap a student to see their profile.
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** Students with a Remove button each (admin "Remove a student…" sheet). */
export function RemoveList({
  detail,
  pendingId,
  onRemove,
}: {
  detail: TeamDetail;
  pendingId: Id | null;
  onRemove: (event: MouseEvent<HTMLElement>) => void;
}): ReactNode {
  return (
    <ul className="flex flex-col">
      {detail.students.map((student) => (
        <li
          className="flex items-center gap-3 border-line border-b py-[10px] last:border-b-0"
          key={student.user.id}
        >
          <StudentAvatar name={student.user.name} />
          <span className="min-w-0 flex-1 truncate font-semibold text-[15px] text-ink leading-5">
            {student.user.name}
          </span>
          <button
            className={buttonVariants({
              size: "xs",
              variant: "destructive-outline",
              className: "shrink-0 px-3",
            })}
            data-name={student.user.name}
            data-user-id={student.user.id}
            disabled={pendingId === student.user.id}
            onClick={onRemove}
            type="button"
          >
            Remove
            <span className="sr-only"> {student.user.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
