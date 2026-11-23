import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Badge } from "@hoops-genesis/ui/components/badge";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import {
  List,
  ListRow,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { SearchInput } from "@hoops-genesis/ui/components/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import {
  Table,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hoops-genesis/ui/components/table";
import {
  Tabs,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@hoops-genesis/ui/components/tabs";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { MoreIcon, PlusIcon } from "@/components/icons";
import { joinCodesQueryOptions } from "@/features/join-codes/queries";
import {
  invitationsQueryOptions,
  memberCountsQueryOptions,
  membersQueryOptions,
  platformOwnerQueryOptions,
  useCancelInvitation,
  useReferenceNow,
  useResendInvitation,
} from "@/features/members/queries";
import { teamListQueryOptions } from "@/features/teams/queries";
import type { Id, Invitation, Member } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";
import { firstName, initials } from "@/lib/format";

export type MembersTab = "all" | "students" | "coaches" | "admins" | "invites";

const ALL_TEAMS = "all";
const JOIN_CODES_TAB = "join-codes";
const NO_TEAM = "none";
const MS_PER_DAY = 86_400_000;

type Row =
  | { kind: "member"; id: Id; member: Member }
  | { kind: "invite"; id: Id; invite: Invitation };

function plainDate(value: Date | string, timeZone?: string): number {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
  return Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY;
}

function daysAgo(value: string, now: Date, timeZone?: string): number {
  return Math.max(0, plainDate(now, timeZone) - plainDate(value, timeZone));
}

/** "4 Sep": three-letter months as in the designs (en-GB says "Sept"). */
function dayShortMonth(value: string, timeZone?: string): string {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
  }).format(date);
  return `${day} ${month}`;
}

function relativeAgo(days: number): string {
  if (days === 0) {
    return "today";
  }
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function joinedLabel(member: Member, now: Date, timeZone?: string): string {
  const verb = member.roles.includes("admin") ? "Appointed" : "Joined";
  const days = daysAgo(member.createdAt, now, timeZone);
  if (days <= 1) {
    return `${verb} ${relativeAgo(days)}`;
  }
  return `${verb} ${dayShortMonth(member.createdAt, timeZone)}`;
}

const ROLE_ORDER = { admin: 0, coach: 1, student: 2 } as const;

function memberRank(member: Member): number {
  return Math.min(...member.roles.map((role) => ROLE_ORDER[role]));
}

function RoleBadge({ roles }: { roles: Member["roles"] }) {
  if (roles.includes("admin")) {
    const label = roles.includes("coach") ? "Admin · Coach" : "Admin";
    return <Badge variant="ink">{label}</Badge>;
  }
  if (roles.includes("coach")) {
    return <Badge variant="outline">Coach</Badge>;
  }
  return <Badge>Student</Badge>;
}

function roleText(roles: Member["roles"]): string {
  if (roles.includes("admin")) {
    return roles.includes("coach") ? "Admin · Coach" : "Admin";
  }
  return roles.includes("coach") ? "Coach" : "Student";
}

interface RowContext {
  now: Date;
  /** The platform owner, who can also send invites ("Invited by Innocent"). */
  owner: { id: Id; name: string } | null;
  teamName: (id: Id | null) => string | null;
  timeZone?: string;
  viewerId: Id;
}

function teamText(member: Member, ctx: RowContext): string | null {
  const names = member.teamIds
    .map((id) => ctx.teamName(id))
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : null;
}

function inviterText(invite: Invitation, ctx: RowContext, users: Member[]) {
  if (invite.inviterId === ctx.viewerId) {
    return "Invited by you";
  }
  if (ctx.owner && invite.inviterId === ctx.owner.id) {
    return `Invited by ${firstName(ctx.owner.name)}`;
  }
  const inviter = users.find((m) => m.userId === invite.inviterId);
  return `Invited by ${inviter ? firstName(inviter.user.name) : "an admin"}`;
}

function inviteStatusText(invite: Invitation, ctx: RowContext): string {
  return `Pending · sent ${relativeAgo(daysAgo(invite.createdAt, ctx.now, ctx.timeZone))}`;
}

function RowActions({
  row,
  label,
  onResend,
  onCancel,
}: {
  row: Row;
  label: string;
  onResend: (id: Id) => void;
  onCancel: (id: Id) => void;
}) {
  const navigate = useNavigate();
  const resend = useCallback(() => onResend(row.id), [onResend, row.id]);
  const cancel = useCallback(() => onCancel(row.id), [onCancel, row.id]);
  const firstTeam = row.kind === "member" ? row.member.teamIds[0] : undefined;
  const openTeam = useCallback(() => {
    if (firstTeam) {
      navigate({ to: "/admin/teams/$teamId", params: { teamId: firstTeam } });
      return;
    }
    navigate({ to: "/admin/teams" });
  }, [firstTeam, navigate]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}`}
        render={
          <Button
            className="-my-2 -mr-2 text-muted"
            size="icon"
            variant="ghost"
          />
        }
      >
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {row.kind === "invite" ? (
          <>
            <DropdownMenuItem onClick={resend}>Resend invite</DropdownMenuItem>
            <DropdownMenuItem onClick={cancel} variant="destructive">
              Cancel invite
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={openTeam}>
            {firstTeam ? "Open team" : "Add to a team"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ResendLink({ id, onResend }: { id: Id; onResend: (id: Id) => void }) {
  const resend = useCallback(() => onResend(id), [id, onResend]);
  return (
    <span className="font-semibold text-orange-deep text-sm leading-[18px]">
      Expired —{" "}
      <button
        className="cursor-pointer underline decoration-1 underline-offset-[3px] outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-orange-deep"
        onClick={resend}
        type="button"
      >
        resend
      </button>
    </span>
  );
}

function MembersTable({
  rows,
  ctx,
  members,
  onResend,
  onCancel,
}: {
  rows: Row[];
  ctx: RowContext;
  members: Member[];
  onResend: (id: Id) => void;
  onCancel: (id: Id) => void;
}) {
  return (
    <div className="max-md:hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-b-0">
            <TableHead>Name</TableHead>
            <TableHead className="w-[150px]">Role</TableHead>
            <TableHead className="w-40">Team</TableHead>
            <TableHead className="w-[200px]">Status</TableHead>
            <TableActionsHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            if (row.kind === "invite") {
              const { invite } = row;
              return (
                <TableRow key={row.id}>
                  <TableCell className="py-3">
                    <span className="flex items-center gap-3">
                      <Avatar size={36} tone="placeholder">
                        <AvatarFallback>?</AvatarFallback>
                      </Avatar>
                      <span className="flex flex-col">
                        <span className="font-medium text-[15px] text-ink-soft leading-[18px]">
                          {invite.email}
                        </span>
                        <span className="text-[13px] text-muted leading-4">
                          {inviterText(invite, ctx, members)}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <RoleBadge roles={[invite.role]} />
                  </TableCell>
                  <TableCell className="py-3">
                    {ctx.teamName(invite.teamId) ?? "No team"}
                  </TableCell>
                  <TableCell className="py-3 text-muted text-sm">
                    {invite.status === "expired" ? (
                      <ResendLink id={invite.id} onResend={onResend} />
                    ) : (
                      inviteStatusText(invite, ctx)
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <RowActions
                      label={invite.email}
                      onCancel={onCancel}
                      onResend={onResend}
                      row={row}
                    />
                  </TableCell>
                </TableRow>
              );
            }
            const { member } = row;
            const isYou = member.userId === ctx.viewerId;
            const team = teamText(member, ctx);
            const isStudent = !(
              member.roles.includes("coach") || member.roles.includes("admin")
            );
            return (
              <TableRow key={row.id}>
                <TableCell className="py-3">
                  <span className="flex items-center gap-3">
                    <Avatar size={36}>
                      <AvatarFallback>
                        {initials(member.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex flex-col">
                      <span className="font-medium text-[15px] text-ink leading-[18px]">
                        {member.user.name}
                        {isYou ? (
                          <span className="font-regular text-muted">
                            {" "}
                            (you)
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[13px] text-muted leading-4">
                        {member.user.email}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <RoleBadge roles={member.roles} />
                </TableCell>
                <TableCell
                  className={cn(
                    "py-3",
                    !team && isStudent && "text-orange-deep"
                  )}
                >
                  {team ?? (isStudent ? "No team yet" : "—")}
                </TableCell>
                <TableCell className="py-3 text-muted text-sm">
                  {joinedLabel(member, ctx.now, ctx.timeZone)}
                </TableCell>
                <TableCell className="py-3 text-right">
                  <RowActions
                    label={member.user.name}
                    onCancel={onCancel}
                    onResend={onResend}
                    row={row}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MembersList({
  rows,
  ctx,
  onResend,
  onCancel,
}: {
  rows: Row[];
  ctx: RowContext;
  onResend: (id: Id) => void;
  onCancel: (id: Id) => void;
}) {
  return (
    <List className="md:hidden">
      {rows.map((row) => {
        if (row.kind === "invite") {
          const { invite } = row;
          const expired = invite.status === "expired";
          return (
            <ListRow key={row.id}>
              <Avatar size={36} tone="placeholder">
                <AvatarFallback>?</AvatarFallback>
              </Avatar>
              <ListRowContent>
                <ListRowTitle className="font-medium text-ink-soft">
                  {invite.email}
                </ListRowTitle>
                <ListRowDescription
                  className={cn(expired && "font-semibold text-orange-deep")}
                >
                  {roleText([invite.role])}
                  {invite.teamId ? ` · ${ctx.teamName(invite.teamId)}` : ""} ·{" "}
                  {expired ? "Expired" : inviteStatusText(invite, ctx)}
                </ListRowDescription>
              </ListRowContent>
              <RowActions
                label={invite.email}
                onCancel={onCancel}
                onResend={onResend}
                row={row}
              />
            </ListRow>
          );
        }
        const { member } = row;
        const team = teamText(member, ctx);
        const isStudent = !(
          member.roles.includes("coach") || member.roles.includes("admin")
        );
        return (
          <ListRow key={row.id}>
            <Avatar size={36}>
              <AvatarFallback>{initials(member.user.name)}</AvatarFallback>
            </Avatar>
            <ListRowContent>
              <ListRowTitle>
                {member.user.name}
                {member.userId === ctx.viewerId ? (
                  <span className="font-regular text-muted"> (you)</span>
                ) : null}
              </ListRowTitle>
              <ListRowDescription>
                {roleText(member.roles)} ·{" "}
                {team ?? (
                  <span className={cn(isStudent && "text-orange-deep")}>
                    {isStudent ? "No team yet" : "No team"}
                  </span>
                )}
              </ListRowDescription>
            </ListRowContent>
            <RowActions
              label={member.user.name}
              onCancel={onCancel}
              onResend={onResend}
              row={row}
            />
          </ListRow>
        );
      })}
    </List>
  );
}

function matchesTab(row: Row, tab: MembersTab): boolean {
  if (tab === "all") {
    return true;
  }
  if (tab === "invites") {
    return row.kind === "invite";
  }
  if (row.kind === "invite") {
    return false;
  }
  const role = {
    students: "student",
    coaches: "coach",
    admins: "admin",
  } as const;
  return row.member.roles.includes(role[tab]);
}

function matchesTeam(row: Row, team: string): boolean {
  if (team === ALL_TEAMS) {
    return true;
  }
  const teamIds =
    row.kind === "invite"
      ? [row.invite.teamId].filter((id): id is Id => Boolean(id))
      : row.member.teamIds;
  return team === NO_TEAM ? teamIds.length === 0 : teamIds.includes(team);
}

function matchesQuery(row: Row, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack =
    row.kind === "invite"
      ? row.invite.email
      : `${row.member.user.name} ${row.member.user.email}`;
  return haystack.toLowerCase().includes(query);
}

/** Members, story AO-2/AO-3 (desktop 1I2-0). Below md the table becomes List rows. */
export function MembersScreen({
  academyId,
  timeZone,
  tab,
  onTabChange,
  onInvite,
}: {
  academyId: Id;
  timeZone?: string;
  tab: MembersTab;
  onTabChange: (tab: MembersTab) => void;
  onInvite: () => void;
}) {
  const viewer = useViewer();
  const now = useReferenceNow();
  const members = useQuery(membersQueryOptions(academyId)).data;
  const invites = useQuery(invitationsQueryOptions(academyId)).data;
  const teams = useQuery(teamListQueryOptions(academyId)).data;
  // Extras the page can do without (the eyebrow count, the owner's row): when they
  // fail they are left out rather than replacing the page with an error.
  const counts = useQuery({
    ...memberCountsQueryOptions(academyId),
    throwOnError: false,
  }).data;
  const owner = useQuery({
    ...platformOwnerQueryOptions(),
    throwOnError: false,
  }).data;
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState(ALL_TEAMS);

  const teamName = useCallback(
    (id: Id | null) => teams?.find((t) => t.team.id === id)?.team.name ?? null,
    [teams]
  );

  const rows = useMemo<Row[]>(() => {
    const sortedMembers = [...(members ?? [])].sort(
      (a, b) => memberRank(a) - memberRank(b)
    );
    const staff = sortedMembers.filter((m) => memberRank(m) < 2);
    const students = sortedMembers.filter((m) => memberRank(m) === 2);
    return [
      ...staff.map((m): Row => ({ kind: "member", id: m.id, member: m })),
      ...(invites ?? []).map(
        (i): Row => ({ kind: "invite", id: i.id, invite: i })
      ),
      ...students.map((m): Row => ({ kind: "member", id: m.id, member: m })),
    ];
  }, [members, invites]);

  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      matchesTab(row, tab) &&
      matchesTeam(row, team) &&
      matchesQuery(row, needle)
  );

  const handleResend = useCallback(
    (id: Id) => {
      resend.mutate(
        { academyId, invitationId: id },
        {
          onSuccess: (invite) =>
            toast.success(
              `New invite sent to ${invite.email}. It works for 48 hours.`
            ),
          onError: (error) =>
            toast.error(
              errorMessage(error, "Couldn't resend the invite. Try again.")
            ),
        }
      );
    },
    [resend, academyId]
  );
  const handleCancel = useCallback(
    (id: Id) => {
      cancel.mutate(
        { academyId, invitationId: id },
        {
          onSuccess: (invite) =>
            toast.success(`Invite to ${invite.email} cancelled`),
          onError: (error) =>
            toast.error(
              errorMessage(error, "Couldn't cancel the invite. Try again.")
            ),
        }
      );
    },
    [cancel, academyId]
  );
  const goTo = useNavigate();
  // Only the "Join codes" tab count; left out if it fails.
  const codes = useQuery({
    ...joinCodesQueryOptions(academyId),
    throwOnError: false,
  }).data;
  const activeCodes = codes?.filter((c) => c.status === "active").length;
  const handleTab = useCallback(
    (value: unknown) => {
      // "Join codes" is its own page (/admin/join-codes, Paper 6G1-0).
      if (value === JOIN_CODES_TAB) {
        goTo({ to: "/admin/join-codes" });
        return;
      }
      onTabChange(value as MembersTab);
    },
    [goTo, onTabChange]
  );
  const handleQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    []
  );
  const handleTeam = useCallback(
    (value: string | null) => setTeam(value ?? ALL_TEAMS),
    []
  );

  const teamItems = [
    { value: ALL_TEAMS, label: "All teams" },
    ...(teams ?? []).map((t) => ({ value: t.team.id, label: t.team.name })),
    { value: NO_TEAM, label: "No team" },
  ];
  const ctx: RowContext = {
    now,
    teamName,
    timeZone,
    viewerId: viewer.user.id,
    owner: owner ?? null,
  };
  const loading = !(members && invites && teams);

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            {counts
              ? `${counts.people} people · ${teams?.length ?? 0} teams`
              : " "}
          </Eyebrow>
          <PageTitle>Members</PageTitle>
        </PageHeading>
        <PageActions>
          <Button
            className="max-md:px-4 max-md:py-[9px] max-md:text-sm"
            onClick={onInvite}
          >
            <PlusIcon />
            <span className="max-md:hidden">Invite people</span>
            <span className="md:hidden">Invite</span>
          </Button>
        </PageActions>
      </PageHeader>
      <div className="flex flex-col gap-8 max-md:gap-4">
        <div className="flex items-center justify-between gap-4 max-lg:flex-col max-lg:items-stretch">
          <Tabs onValueChange={handleTab} value={tab}>
            <TabsList
              aria-label="Filter by role"
              className="max-md:overflow-x-auto max-md:[scrollbar-width:none]"
            >
              <TabsTrigger className="max-md:flex-none" value="all">
                All <TabsCount>{counts?.people}</TabsCount>
              </TabsTrigger>
              <TabsTrigger className="max-md:flex-none" value="students">
                Students <TabsCount>{counts?.students}</TabsCount>
              </TabsTrigger>
              <TabsTrigger className="max-md:flex-none" value="coaches">
                Coaches <TabsCount>{counts?.coaches}</TabsCount>
              </TabsTrigger>
              <TabsTrigger className="max-md:flex-none" value="admins">
                Admins <TabsCount>{counts?.admins}</TabsCount>
              </TabsTrigger>
              <TabsTrigger className="max-md:flex-none" value="invites">
                Invites{" "}
                <TabsCount tone={counts?.invites ? "alert" : "muted"}>
                  {counts?.invites}
                </TabsCount>
              </TabsTrigger>
              <TabsTrigger className="max-md:flex-none" value={JOIN_CODES_TAB}>
                Join codes <TabsCount>{activeCodes}</TabsCount>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <SearchInput
              aria-label="Search members"
              className="w-[260px] max-lg:w-auto max-lg:flex-1"
              onChange={handleQuery}
              placeholder="Search name or email"
              value={query}
            />
            <Select items={teamItems} onValueChange={handleTeam} value={team}>
              <SelectTrigger
                aria-label="Team"
                className="py-[10px]"
                variant="pill"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {teamItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <>
            <MembersTable
              ctx={ctx}
              members={members}
              onCancel={handleCancel}
              onResend={handleResend}
              rows={visible}
            />
            <MembersList
              ctx={ctx}
              onCancel={handleCancel}
              onResend={handleResend}
              rows={visible}
            />
            {visible.length === 0 ? (
              <p className="py-6 text-center text-muted text-sm leading-[18px]">
                {tab === "invites" && !needle && team === ALL_TEAMS
                  ? "No invites waiting. Everyone you invited has joined."
                  : "No one matches. Try another name, email or team."}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
