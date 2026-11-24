/*
 * A coach's view of one student on their team (stories CO-7, CO-10): Paper DTR-0 on
 * web, CB8-0 on phone. The server only answers for students on the coach's own teams
 * (anyone else is a 404, shown as "Page not found"). Coaches see that a month is unpaid
 * but not amounts or payments; they can take the student off this team (Better Auth
 * `removeTeamMember`) and log a result.
 */
import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { toast } from "sonner";

import { QueryBoundary } from "@/components/error-state";
import { MoreIcon, PlusIcon } from "@/components/icons";
import { ConfirmDialog } from "@/features/member-detail/actions";
import {
  type DetailSearch,
  joinedOn,
  lastSeenText,
  monthKeys,
  RoleChip,
  TeamChip,
  useDetailClock,
} from "@/features/member-detail/common";
import {
  Card,
  coachNames,
  countedSessions,
  DetailSkeleton,
  dayMonthYear,
  KeyValueRow,
  monthName,
  percent,
  sessionsLine,
  shortMonthYear,
  weekdayDayMonth,
} from "@/features/member-detail/parts";
import {
  type AttendanceMonth,
  type MemberProfile,
  memberProfileQueryOptions,
  type StudentRecordItem,
  studentAttendanceQueryOptions,
  studentFeesQueryOptions,
  studentRecordsQueryOptions,
  useRemoveFromTeam,
} from "@/features/member-detail/queries";
import {
  AttendanceCard,
  type MonthState,
  RecordsCard,
} from "@/features/member-detail/sections";
import type { DateOnly, Id } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";
import { firstName } from "@/lib/format";

interface CoachContext {
  academyId: Id;
  month: MonthState;
  now: Date;
  openRemove: () => void;
  profile: MemberProfile;
  team: { id: Id; name: string } | null;
  timeZone: string;
  today: DateOnly;
  viewerId: Id;
}

function BackToTeam({
  team,
  variant,
}: {
  team: { id: Id; name: string } | null;
  variant: "web" | "phone";
}) {
  const className =
    variant === "web"
      ? "flex w-fit items-center gap-1.5 rounded-sm font-medium text-muted text-sm uppercase leading-[18px] tracking-label outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink"
      : "-ml-2 flex min-h-11 items-center gap-1.5 rounded-sm px-2 font-semibold text-[15px] text-ink leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink";
  const icon =
    variant === "web" ? (
      <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
    ) : (
      <ChevronLeft
        aria-hidden="true"
        className="size-[18px]"
        strokeWidth={1.6}
      />
    );
  if (!team) {
    return (
      <Link className={className} to="/coach/teams">
        {icon}
        My teams
      </Link>
    );
  }
  return (
    <Link
      className={className}
      params={{ teamId: team.id }}
      to="/coach/teams/$teamId"
    >
      {icon}
      {team.name}
    </Link>
  );
}

function LogResultLink({
  userId,
  className,
  children,
}: {
  userId: Id;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      className={className}
      search={{ student: userId }}
      to="/coach/results/new"
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- web

function FeeFlag({ ctx }: { ctx: CoachContext }) {
  // Something the page can do without: hidden if it fails.
  const { data } = useQuery({
    ...studentFeesQueryOptions(ctx.academyId, ctx.profile.userId, {
      today: ctx.today,
      scope: "coach",
    }),
    throwOnError: false,
  });
  const unpaid = data?.unpaid;
  if (!unpaid) {
    return null;
  }
  return (
    <div className="flex items-start gap-[14px] rounded-[20px] bg-orange-soft px-5 py-[18px]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white">
        <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
          <rect
            fill="none"
            height="10"
            rx="2"
            stroke="#B8501A"
            strokeWidth="1.6"
            width="15"
            x="1.5"
            y="4"
          />
          <circle
            cx="9"
            cy="9"
            fill="none"
            r="2"
            stroke="#B8501A"
            strokeWidth="1.6"
          />
        </svg>
      </span>
      <div className="flex flex-col gap-[3px]">
        <p className="font-semibold text-[15px] text-ink leading-5">
          {monthName(unpaid.month)} unpaid
          {unpaid.daysOverdue ? `, ${unpaid.daysOverdue} days` : ""}
        </p>
        <p className="text-[13px] text-orange-deep leading-[18px]">
          The academy admin handles fees. You only see that a month is unpaid.
        </p>
      </div>
    </div>
  );
}

function TeamCard({ ctx }: { ctx: CoachContext }) {
  const { profile } = ctx;
  const [team] = profile.teams;
  return (
    <Card className="gap-3" labelledBy="team-title" title="Team">
      <dl className="flex flex-col">
        <KeyValueRow label="Team">{team?.name ?? "—"}</KeyValueRow>
        <KeyValueRow label="Coaches">
          {team && team.coaches.length > 0 ? coachNames(team.coaches) : "—"}
        </KeyValueRow>
        {/* A student is on one team per academy (server rule), so never another. */}
        <KeyValueRow label="Other teams" last={!profile.lastSeenAt}>
          None
        </KeyValueRow>
        {profile.lastSeenAt ? (
          <KeyValueRow label="Last seen" last>
            {lastSeenText(profile.lastSeenAt, ctx.timeZone, ctx.now)}
          </KeyValueRow>
        ) : null}
      </dl>
    </Card>
  );
}

function CoachWeb({ ctx }: { ctx: CoachContext }) {
  const { profile, team } = ctx;
  const chip = [team?.name, profile.sport].filter(Boolean).join(", ");
  const meta = [
    `Joined ${dayMonthYear(joinedOn(profile, ctx.timeZone))}`,
    profile.lastSeenAt
      ? `Last seen ${lastSeenText(profile.lastSeenAt, ctx.timeZone, ctx.now).toLowerCase()}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-8 max-md:hidden">
      <header className="flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start">
        <div className="flex min-w-0 flex-col gap-2">
          <BackToTeam team={team} variant="web" />
          <h1 className="font-display text-display-sm text-ink uppercase leading-[95%] tracking-[-0.005em]">
            {profile.name}
          </h1>
          <div className="flex flex-wrap items-center gap-[10px] pt-1.5">
            <RoleChip>Student</RoleChip>
            {chip ? <TeamChip>{chip}</TeamChip> : null}
            <p className="text-muted text-sm leading-[18px]">{meta}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {team ? (
            <Button onClick={ctx.openRemove} variant="outline">
              Remove from {team.name}
            </Button>
          ) : null}
          <LogResultLink className={buttonVariants()} userId={profile.userId}>
            <PlusIcon />
            Log a result
          </LogResultLink>
        </div>
      </header>
      <div className="flex items-start gap-6 max-lg:flex-col max-lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <AttendanceCard
            academyId={ctx.academyId}
            month={ctx.month}
            studentId={profile.userId}
            timeZone={ctx.timeZone}
            today={ctx.today}
            viewerId={ctx.viewerId}
          />
          <RecordsCard
            academyId={ctx.academyId}
            scope="coach"
            seeAllTo="/coach/records"
            studentId={profile.userId}
            today={ctx.today}
            viewerId={ctx.viewerId}
            waitingFor={null}
          />
        </div>
        <div className="flex w-[380px] shrink-0 flex-col gap-6 max-lg:w-full">
          <FeeFlag ctx={ctx} />
          <TeamCard ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- phone

const STATUS_WORD = {
  pending: "Waiting",
  verified: "Verified",
  rejected: "Rejected",
} as const;

const CHECK_IN_TIME = /^checked in (\d{2}:\d{2})/;

function attendanceCaption(month: AttendanceMonth, today: DateOnly): string {
  const parts: string[] = [];
  if (month.late === 1) {
    parts.push("Late once");
  } else if (month.late > 1) {
    parts.push(`Late ${month.late} times`);
  }
  const absent = month.sessions.find((s) => s.status === "absent");
  if (absent) {
    parts.push(`absent ${weekdayDayMonth(absent.date)}`);
  }
  const todays = month.sessions.find((s) => s.date === today);
  if (todays && (todays.status === "present" || todays.status === "late")) {
    const time = CHECK_IN_TIME.exec(todays.detail)?.[1];
    parts.push(time ? `checked in today ${time}` : "in today");
  }
  if (parts.length === 0) {
    return month.sessions.length > 0
      ? "Every session so far"
      : "No sessions yet this month";
  }
  return parts.join(" · ");
}

function PhoneBars({ ctx }: { ctx: CoachContext }) {
  const { data } = useQuery(
    studentAttendanceQueryOptions(ctx.academyId, ctx.profile.userId, {
      month: ctx.month.key,
      today: ctx.today,
      viewerId: ctx.viewerId,
      timeZone: ctx.timeZone,
    })
  );
  if (!data) {
    return <Skeleton className="h-[136px] rounded-[20px]" />;
  }
  const bars = countedSessions(data);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-fog p-4">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium text-[13px] text-muted leading-4">
            Attendance in {ctx.month.label}
          </h2>
          <p className="font-display text-[36px] text-ink leading-9">
            {percent(data.rate)}
          </p>
        </div>
        <p className="pb-1 text-[13px] text-muted leading-4">
          {sessionsLine(data)}
        </p>
      </div>
      {bars.length > 0 ? (
        <div className="flex gap-1.5">
          {bars.map((s) => (
            <span
              className={cn(
                "h-[22px] min-w-0 flex-1 rounded-[6px]",
                s.status === "present" && "bg-ink",
                s.status === "late" && "bg-orange",
                s.status === "absent" && "border-2 border-orange"
              )}
              key={s.id}
              title={`${weekdayDayMonth(s.date)}: ${s.status}`}
            />
          ))}
        </div>
      ) : null}
      <p className="text-muted text-xs leading-4">
        {attendanceCaption(data, ctx.today)}
      </p>
    </section>
  );
}

function ListHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="pt-3 pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label first:pt-0">
      {children}
    </h2>
  );
}

function PhoneResultRow({ item }: { item: StudentRecordItem }) {
  return (
    <li className="flex items-center gap-3 border-line border-b py-2">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[15px] text-ink leading-5">
          {item.label}
        </span>
        <span className="text-muted text-xs leading-4">
          {weekdayDayMonth(item.recordedOn)} · verified
        </span>
      </span>
      <span className="font-bold text-[15px] text-ink leading-5">
        {item.score}
      </span>
    </li>
  );
}

function PhoneRecordRow({
  item,
  viewerId,
}: {
  item: StudentRecordItem;
  viewerId: Id;
}) {
  const by =
    item.recordedById === viewerId ? "you" : firstName(item.recordedByName);
  const canReview = item.status === "pending" && item.recordedById !== viewerId;
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[15px] text-ink leading-5">
          {item.term ? `${item.label} · ${item.term}` : item.label}
        </span>
        <span className="text-muted text-xs leading-4">
          Uploaded by {by} · {weekdayDayMonth(item.recordedOn)}
        </span>
      </span>
      {canReview ? (
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
      ) : (
        <span className="text-muted text-xs">{STATUS_WORD[item.status]}</span>
      )}
    </li>
  );
}

function PhoneRecords({ ctx }: { ctx: CoachContext }) {
  const { data } = useQuery(
    studentRecordsQueryOptions(ctx.academyId, ctx.profile.userId)
  );
  if (!data) {
    return <Skeleton className="h-[160px]" />;
  }
  const results = data.items
    .filter((i) => i.recordType === "athletic" && i.status === "verified")
    .slice(0, 2);
  const academic = data.items
    .filter((i) => i.recordType === "academic")
    .slice(0, 2);
  return (
    <div className="flex flex-col">
      <ListHeading>Latest results</ListHeading>
      {results.length > 0 ? (
        <ul>
          {results.map((item) => (
            <PhoneResultRow item={item} key={item.id} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-muted text-sm">No verified results yet.</p>
      )}
      <ListHeading>Records</ListHeading>
      {academic.length > 0 ? (
        <ul>
          {academic.map((item) => (
            <PhoneRecordRow item={item} key={item.id} viewerId={ctx.viewerId} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-muted text-sm">No records uploaded yet.</p>
      )}
    </div>
  );
}

function PhoneFlags({ ctx }: { ctx: CoachContext }) {
  const { data } = useQuery({
    ...studentFeesQueryOptions(ctx.academyId, ctx.profile.userId, {
      today: ctx.today,
      scope: "coach",
    }),
    throwOnError: false,
  });
  const unpaid = data?.unpaid;
  return (
    <div className="-mt-1.5 flex flex-wrap gap-2">
      {unpaid ? (
        <span className="flex items-center gap-1.5 rounded-full bg-orange-soft px-3 py-1.5 font-semibold text-[13px] text-orange-deep leading-4">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-orange-deep"
          />
          {monthName(unpaid.month)} unpaid
          {unpaid.daysOverdue ? ` · ${unpaid.daysOverdue} days` : ""}
        </span>
      ) : null}
      <span className="rounded-full bg-fog px-3 py-1.5 font-medium text-[13px] text-ink-soft leading-4">
        Joined {shortMonthYear(joinedOn(ctx.profile, ctx.timeZone))}
      </span>
    </div>
  );
}

function CoachPhone({ ctx }: { ctx: CoachContext }) {
  const { profile, team } = ctx;
  return (
    <div className="flex min-h-full flex-col gap-3 md:hidden">
      <div className="flex h-9 items-center justify-between">
        <BackToTeam team={team} variant="phone" />
        {team ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              render={
                <Button
                  className="size-11 bg-fog"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <MoreIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={ctx.openRemove} variant="destructive">
                Remove from {team.name}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label">
          Student{team ? ` · ${team.name}` : ""}
        </p>
        <h1 className="font-display text-display-sm text-ink uppercase leading-[95%]">
          {profile.name}
        </h1>
      </div>
      <PhoneFlags ctx={ctx} />
      <QueryBoundary className="rounded-[20px] bg-fog" what="attendance">
        <PhoneBars ctx={ctx} />
      </QueryBoundary>
      <QueryBoundary what="records">
        <PhoneRecords ctx={ctx} />
      </QueryBoundary>
      <div className="mt-auto flex flex-col gap-[10px] pt-4">
        <LogResultLink
          className={cn(buttonVariants(), "w-full")}
          userId={profile.userId}
        >
          <PlusIcon />
          Log a result
        </LogResultLink>
        {team ? (
          <button
            className="min-h-11 cursor-pointer rounded-full font-semibold text-orange-deep text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-orange-deep"
            onClick={ctx.openRemove}
            type="button"
          >
            Remove from {team.name}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- screen

export function CoachStudentScreen({
  academyId,
  studentId,
  timeZone,
  search,
  onSearchChange,
}: {
  academyId: Id;
  studentId: Id;
  timeZone: string;
  search: DetailSearch;
  onSearchChange: (patch: Partial<DetailSearch>) => void;
}) {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { now, today } = useDetailClock(timeZone);
  const { current, previous } = monthKeys(today);
  const showingPrevious = search.month === "prev";
  const monthKey = showingPrevious ? previous : current;
  const onMonthChange = useCallback(
    (prev: boolean) => onSearchChange({ month: prev ? "prev" : undefined }),
    [onSearchChange]
  );
  const { data: profile } = useQuery(
    memberProfileQueryOptions(academyId, studentId, "coach")
  );
  const remove = useRemoveFromTeam();
  const openRemove = useCallback(
    () => onSearchChange({ action: "remove" }),
    [onSearchChange]
  );
  const closeAction = useCallback(
    (open: boolean) => {
      if (!open) {
        onSearchChange({ action: undefined });
      }
    },
    [onSearchChange]
  );
  const [team] = profile?.teams ?? [];
  const confirmRemove = useCallback(() => {
    if (!(profile && team)) {
      return;
    }
    remove.mutate(
      { academyId, teamId: team.id, userId: profile.userId },
      {
        onSuccess: () => {
          toast.success(`${profile.name} is off ${team.name}.`);
          navigate({
            to: "/coach/teams/$teamId",
            params: { teamId: team.id },
            replace: true,
          });
        },
      }
    );
  }, [remove, academyId, profile, team, navigate]);

  if (!profile) {
    return <DetailSkeleton />;
  }
  const ctx: CoachContext = {
    academyId,
    profile,
    team: team ? { id: team.id, name: team.name } : null,
    timeZone,
    now,
    today,
    viewerId: viewer.user.id,
    openRemove,
    month: {
      key: monthKey,
      label: monthName(`${monthKey}-01`),
      currentLabel: monthName(`${current}-01`),
      previousLabel: monthName(`${previous}-01`),
      showingPrevious,
      onChange: onMonthChange,
    },
  };
  const name = firstName(profile.name);
  return (
    <>
      <CoachWeb ctx={ctx} />
      <CoachPhone ctx={ctx} />
      {team ? (
        <ConfirmDialog
          confirmLabel={`Remove from ${team.name}`}
          description={`${name} comes off ${team.name} and stays in the academy without a team until an admin puts them on one. Their attendance, fees and records stay. The change is written to the activity log.`}
          destructive
          error={
            remove.error
              ? errorMessage(remove.error, "Couldn't remove them. Try again.")
              : null
          }
          onConfirm={confirmRemove}
          onOpenChange={closeAction}
          open={search.action === "remove"}
          pending={remove.isPending}
          pendingLabel="Removing…"
          title={`Take ${name} off ${team.name}?`}
        />
      ) : null}
    </>
  );
}
