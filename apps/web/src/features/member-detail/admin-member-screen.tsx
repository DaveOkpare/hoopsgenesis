/*
 * Member detail for academy admins (story AO-3): a student (Paper 8JO-0 web, 7F2-0
 * phone) or a coach (DNS-0 web, CHQ-0 phone). Tablet uses the web layout in one
 * column (spec D5O-0). Admins (the viewer included) are shown read-only: only the
 * platform owner changes or removes an academy admin.
 */
import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { toast } from "sonner";

import { MoreIcon, PlusIcon } from "@/components/icons";
import {
  CoachTeamsDialog,
  ConfirmDialog,
  MoveTeamDialog,
} from "@/features/member-detail/actions";
import {
  DangerLink,
  type DetailAction,
  type DetailSearch,
  isCoachLike,
  joinedOn,
  lastSeenText,
  monthKeys,
  PhoneAvatar,
  RoleChip,
  roleLabel,
  TeamChip,
  useDetailClock,
} from "@/features/member-detail/common";
import {
  Card,
  coachNames,
  DetailSkeleton,
  dayMonth,
  dayMonthYear,
  joinNames,
  KeyValueRow,
  monthName,
  PhoneLinkRow,
} from "@/features/member-detail/parts";
import {
  coachRecordsQueryOptions,
  type MemberProfile,
  memberProfileQueryOptions,
  studentRecordsQueryOptions,
  useChangeRole,
  useRemoveMember,
} from "@/features/member-detail/queries";
import {
  AttendanceCard,
  CoachingCard,
  CoachRecordsCard,
  FeesCard,
  type MonthState,
  PhoneAttendance,
  PhoneSessionsCard,
  RecentActivityCard,
  RecordsCard,
  TeamsCoachedCard,
  useUnpaidLine,
} from "@/features/member-detail/sections";
import type { Id } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";
import { firstName, formatAmount } from "@/lib/format";

interface ScreenProps {
  academyId: Id;
  memberId: Id;
  onSearchChange: (patch: Partial<DetailSearch>) => void;
  search: DetailSearch;
  timeZone: string;
}

interface DetailContext {
  academyId: Id;
  /** Coaches and students; admins are the platform owner's to change. */
  canManage: boolean;
  month: MonthState;
  now: Date;
  openAction: (action: DetailAction) => void;
  profile: MemberProfile;
  timeZone: string;
  today: string;
  viewerId: Id;
}

function useMonthState(
  today: string,
  search: DetailSearch,
  onSearchChange: (patch: Partial<DetailSearch>) => void
): MonthState {
  const { current, previous } = monthKeys(today);
  const showingPrevious = search.month === "prev";
  const key = showingPrevious ? previous : current;
  const onChange = useCallback(
    (prev: boolean) => onSearchChange({ month: prev ? "prev" : undefined }),
    [onSearchChange]
  );
  return {
    key,
    label: monthName(`${key}-01`),
    currentLabel: monthName(`${current}-01`),
    previousLabel: monthName(`${previous}-01`),
    showingPrevious,
    onChange,
  };
}

// ---------------------------------------------------------------- headers

function WebHeader({
  profile,
  chips,
  meta,
  actions,
}: {
  profile: MemberProfile;
  chips: ReactNode;
  meta: string;
  actions: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 max-lg:flex-col max-lg:items-start">
      <div className="flex min-w-0 flex-col gap-2">
        <Link
          className="flex w-fit items-center gap-1.5 rounded-sm font-medium text-muted text-sm uppercase leading-[18px] tracking-label outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink"
          to="/admin/members"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-3.5"
            strokeWidth={1.8}
          />
          Members
        </Link>
        <h1 className="font-display text-display-sm text-ink uppercase leading-[95%] tracking-[-0.005em]">
          {profile.name}
        </h1>
        <div className="flex flex-wrap items-center gap-[10px] pt-1.5">
          {chips}
          <p className="text-muted text-sm leading-[18px]">{meta}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

function PhoneHeader({
  profile,
  tone,
  subtitle,
  menu,
}: {
  profile: MemberProfile;
  tone: "orange" | "ink";
  subtitle: string;
  menu: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-sm px-2 font-medium text-[13px] text-muted uppercase leading-4 tracking-label outline-none focus-visible:ring-2 focus-visible:ring-ink"
          to="/admin/members"
        >
          <ChevronLeft
            aria-hidden="true"
            className="size-4"
            strokeWidth={1.6}
          />
          Members
        </Link>
        {menu}
      </div>
      <div className="flex items-center gap-[14px]">
        <PhoneAvatar name={profile.name} tone={tone} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[34px] text-ink uppercase leading-[34px]">
            {profile.name}
          </h1>
          <p className="text-muted text-sm leading-[18px]">{subtitle}</p>
        </div>
      </div>
    </>
  );
}

function PhoneMenu({
  items,
}: {
  items: { label: string; onSelect: () => void; destructive?: boolean }[];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        render={
          <Button className="-mr-2 size-11" size="icon" variant="ghost" />
        }
      >
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onClick={item.onSelect}
            variant={item.destructive ? "destructive" : "default"}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function teamChipText(profile: MemberProfile): string | null {
  if (profile.teams.length === 0) {
    return null;
  }
  return [profile.teams.map((t) => t.name).join(", "), profile.sport]
    .filter(Boolean)
    .join(", ");
}

function joinedMeta(profile: MemberProfile, timeZone: string): string {
  const joined = `Joined ${dayMonthYear(joinedOn(profile, timeZone))}`;
  return [
    profile.joinedVia ? `${joined} ${profile.joinedVia}` : joined,
    profile.email,
  ].join(" · ");
}

// ---------------------------------------------------------------- dialogs

function MemberDialogs({
  ctx,
  action,
  onClose,
}: {
  ctx: DetailContext;
  action: DetailAction | undefined;
  onClose: (open: boolean) => void;
}) {
  const { academyId, profile } = ctx;
  const navigate = useNavigate();
  const remove = useRemoveMember();
  const role = useChangeRole();
  const name = firstName(profile.name);
  const toStudent = profile.roles.includes("coach");
  const confirmRemove = useCallback(() => {
    remove.mutate(
      { academyId, memberId: profile.memberId },
      {
        onSuccess: () => {
          toast.success(`${profile.name} is no longer in the academy.`);
          navigate({ to: "/admin/members", replace: true });
        },
      }
    );
  }, [remove, academyId, profile, navigate]);
  const confirmRole = useCallback(() => {
    role.mutate(
      {
        academyId,
        memberId: profile.memberId,
        role: toStudent ? "student" : "coach",
      },
      {
        onSuccess: () => {
          toast.success(`${name} is now a ${toStudent ? "student" : "coach"}.`);
          onClose(false);
        },
      }
    );
  }, [role, academyId, profile.memberId, toStudent, name, onClose]);
  if (!ctx.canManage) {
    return null;
  }
  return (
    <>
      <MoveTeamDialog
        academyId={academyId}
        onOpenChange={onClose}
        open={action === "move"}
        profile={profile}
      />
      <CoachTeamsDialog
        academyId={academyId}
        onOpenChange={onClose}
        open={action === "teams"}
        profile={profile}
      />
      <ConfirmDialog
        confirmLabel={toStudent ? "Make student" : "Make coach"}
        description={
          toStudent
            ? `${name} stops seeing their teams’ attendance and records, and sees only their own. A student can be on one team at most.`
            : `${name} becomes a coach: they see and take attendance for the teams they are on.`
        }
        error={
          role.error
            ? errorMessage(role.error, "Couldn't change the role. Try again.")
            : null
        }
        onConfirm={confirmRole}
        onOpenChange={onClose}
        open={action === "role"}
        pending={role.isPending}
        pendingLabel="Saving…"
        title={toStudent ? `Make ${name} a student?` : `Make ${name} a coach?`}
      />
      <ConfirmDialog
        confirmLabel="Remove"
        description={`${profile.name} loses access to the academy and comes off every team. Their attendance, fees and records stay. You can invite them again later.`}
        destructive
        error={
          remove.error
            ? errorMessage(remove.error, "Couldn't remove them. Try again.")
            : null
        }
        onConfirm={confirmRemove}
        onOpenChange={onClose}
        open={action === "remove"}
        pending={remove.isPending}
        pendingLabel="Removing…"
        title={`Remove ${name} from the academy?`}
      />
    </>
  );
}

// ---------------------------------------------------------------- student

function RecordPaymentLink({
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
      search={{ record: 1, student: userId }}
      to="/admin/fees"
    >
      {children}
    </Link>
  );
}

function StudentTeamCard({ ctx }: { ctx: DetailContext }) {
  const { profile } = ctx;
  const [team] = profile.teams;
  const remove = useCallback(() => ctx.openAction("remove"), [ctx]);
  return (
    <Card className="gap-3" labelledBy="team-role-title" title="Team and role">
      <dl className="flex flex-col">
        <KeyValueRow label="Team">
          {team ? (
            team.name
          ) : (
            <span className="text-orange-deep">No team yet</span>
          )}
        </KeyValueRow>
        <KeyValueRow label="Coaches">
          {team && team.coaches.length > 0 ? coachNames(team.coaches) : "—"}
        </KeyValueRow>
        <KeyValueRow label="Role" last={!profile.lastSeenAt}>
          {roleLabel(profile)}
        </KeyValueRow>
        {profile.lastSeenAt ? (
          <KeyValueRow label="Last seen" last>
            {lastSeenText(profile.lastSeenAt, ctx.timeZone, ctx.now)}
          </KeyValueRow>
        ) : null}
      </dl>
      {ctx.canManage ? (
        <div className="pt-1.5">
          <DangerLink onClick={remove}>Remove from the academy</DangerLink>
        </div>
      ) : null}
    </Card>
  );
}

function StudentWeb({ ctx }: { ctx: DetailContext }) {
  const { profile, academyId } = ctx;
  const chip = teamChipText(profile);
  const openMove = useCallback(() => ctx.openAction("move"), [ctx]);
  const waitingCoach = profile.teams[0]?.coaches[0];
  return (
    <div className="flex flex-col gap-8 max-md:hidden">
      <WebHeader
        actions={
          ctx.canManage ? (
            <>
              <Button onClick={openMove} variant="outline">
                {profile.teams.length > 0 ? "Move team" : "Add to a team"}
              </Button>
              <RecordPaymentLink
                className={buttonVariants()}
                userId={profile.userId}
              >
                <PlusIcon />
                Record payment
              </RecordPaymentLink>
            </>
          ) : null
        }
        chips={
          <>
            <RoleChip>{roleLabel(profile)}</RoleChip>
            {chip ? <TeamChip>{chip}</TeamChip> : null}
          </>
        }
        meta={joinedMeta(profile, ctx.timeZone)}
        profile={profile}
      />
      <div className="flex items-start gap-6 max-lg:flex-col max-lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <AttendanceCard
            academyId={academyId}
            month={ctx.month}
            studentId={profile.userId}
            timeZone={ctx.timeZone}
            today={ctx.today}
            viewerId={ctx.viewerId}
          />
          <RecordsCard
            academyId={academyId}
            scope="admin"
            seeAllTo="/admin/records"
            studentId={profile.userId}
            today={ctx.today}
            viewerId={ctx.viewerId}
            waitingFor={
              waitingCoach ? `Coach ${firstName(waitingCoach.name)}` : null
            }
          />
        </div>
        <div className="flex w-[380px] shrink-0 flex-col gap-6 max-lg:w-full">
          <FeesCard
            academyId={academyId}
            recordPayment={
              <RecordPaymentLink
                className={cn(buttonVariants({ size: "sm" }), "w-full")}
                userId={profile.userId}
              >
                Record payment
              </RecordPaymentLink>
            }
            studentId={profile.userId}
            timeZone={ctx.timeZone}
            today={ctx.today}
          />
          <StudentTeamCard ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

function PhoneFeesRow({ ctx }: { ctx: DetailContext }) {
  const { data } = useUnpaidLine(
    ctx.academyId,
    ctx.profile.userId,
    ctx.today,
    "admin"
  );
  const unpaid = data?.unpaid;
  let detail = "Loading…";
  if (data) {
    detail = unpaid
      ? [
          `${monthName(unpaid.month)} unpaid`,
          unpaid.daysOverdue ? `${unpaid.daysOverdue} days overdue` : null,
          unpaid.amount
            ? `${unpaid.currency} ${formatAmount(unpaid.amount)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Nothing owed right now";
  }
  return (
    <Link
      className="block outline-none focus-visible:ring-2 focus-visible:ring-ink"
      search={{ q: ctx.profile.name, tab: "payments" }}
      to="/admin/fees"
    >
      <PhoneLinkRow
        detail={detail}
        title="Fees"
        tone={unpaid ? "alert" : "muted"}
      />
    </Link>
  );
}

function PhoneRecordsRow({ ctx }: { ctx: DetailContext }) {
  // Shares the records query with the web card.
  const { data } = useQuery({
    ...studentRecordsQuery(ctx),
    throwOnError: false,
  });
  let detail = "Loading…";
  if (data) {
    const best = data.items.find(
      (i) => i.recordType === "athletic" && i.status === "verified"
    );
    const waiting = data.items.filter((i) => i.status === "pending").length;
    const coach = ctx.profile.teams[0]?.coaches[0];
    detail =
      [
        best
          ? `Best ${best.label.toLowerCase()} ${best.score ?? ""}`.trim()
          : null,
        waiting > 0
          ? `${waiting} waiting for ${coach ? `Coach ${firstName(coach.name)}` : "review"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No records yet";
  }
  return (
    <Link
      className="block outline-none focus-visible:ring-2 focus-visible:ring-ink"
      to="/admin/records"
    >
      <PhoneLinkRow detail={detail} title="Records" />
    </Link>
  );
}

function ContactRow({ email }: { email: string }) {
  return (
    <a
      className="block outline-none focus-visible:ring-2 focus-visible:ring-ink"
      href={`mailto:${email}`}
    >
      <PhoneLinkRow detail={email} title="Contact" />
    </a>
  );
}

function StudentPhone({ ctx }: { ctx: DetailContext }) {
  const { profile } = ctx;
  const openMove = useCallback(() => ctx.openAction("move"), [ctx]);
  const openRole = useCallback(() => ctx.openAction("role"), [ctx]);
  const openRemove = useCallback(() => ctx.openAction("remove"), [ctx]);
  const subtitle = [
    roleLabel(profile),
    profile.teams[0]?.name ?? "No team yet",
    `joined ${dayMonth(joinedOn(profile, ctx.timeZone))}`,
  ].join(" · ");
  return (
    <div className="flex flex-col gap-4 md:hidden">
      <PhoneHeader
        menu={
          ctx.canManage ? (
            <PhoneMenu
              items={[
                { label: "Move team", onSelect: openMove },
                { label: "Make coach", onSelect: openRole },
                {
                  label: "Remove from academy",
                  onSelect: openRemove,
                  destructive: true,
                },
              ]}
            />
          ) : null
        }
        profile={profile}
        subtitle={subtitle}
        tone="orange"
      />
      {ctx.canManage ? (
        <div className="flex gap-2">
          <RecordPaymentLink
            className={cn(buttonVariants({ size: "sm" }), "flex-1 py-[11px]")}
            userId={profile.userId}
          >
            Record payment
          </RecordPaymentLink>
          <Button
            className="flex-1 py-[11px]"
            onClick={openMove}
            size="sm"
            variant="outline"
          >
            {profile.teams.length > 0 ? "Move team" : "Add to a team"}
          </Button>
        </div>
      ) : null}
      <PhoneAttendance
        academyId={ctx.academyId}
        month={ctx.month}
        studentId={profile.userId}
        timeZone={ctx.timeZone}
        today={ctx.today}
        viewerId={ctx.viewerId}
      />
      <nav aria-label={`About ${profile.name}`} className="flex flex-col">
        <PhoneFeesRow ctx={ctx} />
        <PhoneRecordsRow ctx={ctx} />
        <ContactRow email={profile.email} />
      </nav>
      {ctx.canManage ? (
        <DangerLink className="text-orange-deep" onClick={openRemove}>
          Remove from academy
        </DangerLink>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- coach

function RoleSwitch({ ctx }: { ctx: DetailContext }) {
  const openRole = useCallback(() => ctx.openAction("role"), [ctx]);
  if (!ctx.canManage) {
    return <>{roleLabel(ctx.profile)}</>;
  }
  return (
    <span className="flex gap-0.5 rounded-full bg-fog p-[3px]">
      <span className="rounded-full bg-ink px-3 py-[5px] font-semibold text-[13px] text-white leading-4">
        Coach
      </span>
      <button
        className="cursor-pointer rounded-full px-3 py-[5px] font-medium text-[13px] text-ink-soft leading-4 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ink"
        onClick={openRole}
        type="button"
      >
        Student
      </button>
    </span>
  );
}

function RoleAccessCard({ ctx }: { ctx: DetailContext }) {
  const { profile } = ctx;
  const remove = useCallback(() => ctx.openAction("remove"), [ctx]);
  const teams = profile.teams.map((t) => t.name);
  const name = `Coach ${firstName(profile.name)}`;
  let canSee = "No teams yet";
  if (profile.roles.includes("admin")) {
    canSee = "The whole academy";
  } else if (teams.length > 0) {
    canSee = `${joinNames(teams)} only`;
  }
  return (
    <Card
      className="gap-3"
      labelledBy="role-access-title"
      title="Role and access"
    >
      <dl className="flex flex-col">
        <KeyValueRow label="Role">
          <RoleSwitch ctx={ctx} />
        </KeyValueRow>
        <KeyValueRow
          label="Can see"
          last={!(profile.signIn || profile.lastSeenAt)}
        >
          {canSee}
        </KeyValueRow>
        {profile.signIn ? (
          <KeyValueRow label="Sign-in" last={!profile.lastSeenAt}>
            {profile.signIn}
          </KeyValueRow>
        ) : null}
        {profile.lastSeenAt ? (
          <KeyValueRow label="Last seen" last>
            {lastSeenText(profile.lastSeenAt, ctx.timeZone, ctx.now)}
          </KeyValueRow>
        ) : null}
      </dl>
      <p className="text-[13px] text-muted leading-[18px]">
        {ctx.canManage
          ? `You can switch ${name} between coach and student. Only the owner can make someone an admin.`
          : "Only the platform owner changes an admin’s role or removes them."}
      </p>
      {ctx.canManage ? (
        <div className="pt-1.5">
          <DangerLink onClick={remove}>Remove from the academy</DangerLink>
        </div>
      ) : null}
    </Card>
  );
}

function CoachWeb({ ctx }: { ctx: DetailContext }) {
  const { profile, academyId } = ctx;
  const chip =
    profile.teams.length > 0
      ? [profile.teams.map((t) => t.name).join(", "), profile.sport]
          .filter(Boolean)
          .join(", ")
      : null;
  const openTeams = useCallback(() => ctx.openAction("teams"), [ctx]);
  return (
    <div className="flex flex-col gap-8 max-md:hidden">
      <WebHeader
        actions={
          profile.roles.includes("coach") ? (
            <Button onClick={openTeams}>Change teams</Button>
          ) : null
        }
        chips={
          <>
            <RoleChip>{roleLabel(profile)}</RoleChip>
            {chip ? <TeamChip>{chip}</TeamChip> : null}
          </>
        }
        meta={joinedMeta(profile, ctx.timeZone)}
        profile={profile}
      />
      <div className="flex items-start gap-6 max-lg:flex-col max-lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <CoachingCard
            academyId={academyId}
            coachId={profile.userId}
            month={ctx.month}
            pronoun="their"
            teamIds={profile.teams.map((t) => t.id)}
            today={ctx.today}
          />
          <CoachRecordsCard
            academyId={academyId}
            coachId={profile.userId}
            today={ctx.today}
          />
        </div>
        <div className="flex w-[380px] shrink-0 flex-col gap-6 max-lg:w-full">
          <TeamsCoachedCard profile={profile} />
          <RoleAccessCard ctx={ctx} />
          <RecentActivityCard
            academyId={academyId}
            now={ctx.now}
            timeZone={ctx.timeZone}
            userId={profile.userId}
          />
        </div>
      </div>
    </div>
  );
}

function PhoneResultsRow({ ctx }: { ctx: DetailContext }) {
  const { data } = useQuery({
    ...coachRecordsQueryOptions(ctx.academyId, ctx.profile.userId, {
      today: ctx.today,
    }),
    throwOnError: false,
  });
  let detail = "Loading…";
  if (data) {
    detail = [
      `${data.total} logged or reviewed`,
      data.pendingForThem > 0
        ? `${data.pendingForThem} records waiting for them`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return (
    <Link
      className="block outline-none focus-visible:ring-2 focus-visible:ring-ink"
      to="/admin/records"
    >
      <PhoneLinkRow detail={detail} title="Results logged" />
    </Link>
  );
}

function CoachPhone({ ctx }: { ctx: DetailContext }) {
  const { profile } = ctx;
  const openTeams = useCallback(() => ctx.openAction("teams"), [ctx]);
  const openRole = useCallback(() => ctx.openAction("role"), [ctx]);
  const openRemove = useCallback(() => ctx.openAction("remove"), [ctx]);
  const teamsText =
    profile.teams
      .map((t) => `${t.name} (${t.studentCount} students)`)
      .join(" · ") || "No teams yet";
  const [firstTeam] = profile.teams;
  return (
    <div className="flex flex-col gap-4 md:hidden">
      <PhoneHeader
        menu={
          ctx.canManage ? (
            <PhoneMenu
              items={[
                { label: "Change teams", onSelect: openTeams },
                { label: "Make student", onSelect: openRole },
                {
                  label: "Remove from academy",
                  onSelect: openRemove,
                  destructive: true,
                },
              ]}
            />
          ) : null
        }
        profile={profile}
        subtitle={`${roleLabel(profile)} · joined ${dayMonth(joinedOn(profile, ctx.timeZone))}`}
        tone="ink"
      />
      {ctx.canManage ? (
        <div className="flex gap-2">
          <Button className="flex-1 py-[11px]" onClick={openTeams} size="sm">
            Change teams
          </Button>
          <Button
            className="flex-1 py-[11px]"
            onClick={openRole}
            size="sm"
            variant="outline"
          >
            Make student
          </Button>
        </div>
      ) : null}
      <PhoneSessionsCard
        academyId={ctx.academyId}
        coachId={profile.userId}
        month={ctx.month}
        teamIds={profile.teams.map((t) => t.id)}
        today={ctx.today}
      />
      <nav aria-label={`About ${profile.name}`} className="flex flex-col">
        {firstTeam ? (
          <Link
            className="block outline-none focus-visible:ring-2 focus-visible:ring-ink"
            params={{ teamId: firstTeam.id }}
            to="/admin/teams/$teamId"
          >
            <PhoneLinkRow detail={teamsText} title="Teams coached" />
          </Link>
        ) : (
          <Link
            className="block outline-none focus-visible:ring-2 focus-visible:ring-ink"
            to="/admin/teams"
          >
            <PhoneLinkRow detail={teamsText} title="Teams coached" />
          </Link>
        )}
        <PhoneResultsRow ctx={ctx} />
        <ContactRow email={profile.email} />
      </nav>
      {ctx.canManage ? (
        <DangerLink className="text-orange-deep" onClick={openRemove}>
          Remove from academy
        </DangerLink>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- screen

function studentRecordsQuery(ctx: DetailContext) {
  return studentRecordsQueryOptions(ctx.academyId, ctx.profile.userId);
}

export function AdminMemberScreen({
  academyId,
  memberId,
  timeZone,
  search,
  onSearchChange,
}: ScreenProps) {
  const viewer = useViewer();
  const { now, today } = useDetailClock(timeZone);
  const month = useMonthState(today, search, onSearchChange);
  const profile = useQuery(
    memberProfileQueryOptions(academyId, memberId, "admin")
  ).data;
  const openAction = useCallback(
    (action: DetailAction) => onSearchChange({ action }),
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
  if (!profile) {
    return <DetailSkeleton />;
  }
  const ctx: DetailContext = {
    academyId,
    profile,
    timeZone,
    now,
    today,
    month,
    viewerId: viewer.user.id,
    canManage: !profile.roles.includes("admin"),
    openAction,
  };
  const coachLike = isCoachLike(profile);
  return (
    <>
      {coachLike ? <CoachWeb ctx={ctx} /> : <StudentWeb ctx={ctx} />}
      {coachLike ? <CoachPhone ctx={ctx} /> : <StudentPhone ctx={ctx} />}
      <MemberDialogs action={search.action} ctx={ctx} onClose={closeAction} />
    </>
  );
}
