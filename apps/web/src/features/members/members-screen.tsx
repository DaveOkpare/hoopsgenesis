import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Badge } from "@hoops-genesis/ui/components/badge";
import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
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
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ChangeEvent, useCallback, useMemo } from "react";
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
import {
  type MembersSearch,
  type MembersTab,
  PAGE_SIZES,
  type PageSize,
} from "@/features/members/search";
import { teamListQueryOptions } from "@/features/teams/queries";
import type { Id, Invitation, Member } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";
import { firstName, initials } from "@/lib/format";

export type { MembersTab } from "@/features/members/search";

const ALL_TEAMS = "all";
const JOIN_CODES_TAB = "join-codes";
const NO_TEAM = "none";
const MS_PER_DAY = 86_400_000;
const DEFAULT_PAGE_SIZE: PageSize = 25;
/** Page numbers shown around the current one in the desktop footer. */
const PAGE_WINDOW = 3;

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

function isStudentOnly(roles: Member["roles"]): boolean {
  return !(roles.includes("coach") || roles.includes("admin"));
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

/** "Admin and coach", "Coach", "Student" (phone rows, G8Q-0). */
function roleText(roles: Member["roles"]): string {
  if (roles.includes("admin")) {
    return roles.includes("coach") ? "Admin and coach" : "Admin";
  }
  return roles.includes("coach") ? "Coach" : "Student";
}

interface RowContext {
  now: Date;
  /** The platform owner, who can also send invites ("Invited by Innocent M."). */
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
    return `Invited by ${ctx.owner.name}`;
  }
  const inviter = users.find((m) => m.userId === invite.inviterId);
  return `Invited by ${inviter ? firstName(inviter.user.name) : "an admin"}`;
}

function inviteStatusText(invite: Invitation, ctx: RowContext): string {
  return `Pending · sent ${relativeAgo(daysAgo(invite.createdAt, ctx.now, ctx.timeZone))}`;
}

interface RowHandlers {
  onCancel: (id: Id) => void;
  onOpenInvite: (id: Id) => void;
  onResend: (id: Id) => void;
}

function RowActions({
  row,
  label,
  handlers,
  className,
}: {
  row: Row;
  label: string;
  handlers: RowHandlers;
  className?: string;
}) {
  const navigate = useNavigate();
  const { onResend, onCancel, onOpenInvite } = handlers;
  const resend = useCallback(() => onResend(row.id), [onResend, row.id]);
  const cancel = useCallback(() => onCancel(row.id), [onCancel, row.id]);
  const openInvite = useCallback(
    () => onOpenInvite(row.id),
    [onOpenInvite, row.id]
  );
  const userId = row.kind === "member" ? row.member.userId : null;
  const firstTeam = row.kind === "member" ? row.member.teamIds[0] : undefined;
  const openProfile = useCallback(() => {
    if (userId) {
      navigate({
        to: "/admin/members/$memberId",
        params: { memberId: userId },
      });
    }
  }, [navigate, userId]);
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
            className={cn("relative z-10 size-11 text-muted", className)}
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
            <DropdownMenuItem onClick={openInvite}>
              Open invite
            </DropdownMenuItem>
            <DropdownMenuItem onClick={resend}>Resend invite</DropdownMenuItem>
            <DropdownMenuItem onClick={cancel} variant="destructive">
              Cancel invite
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={openProfile}>
              Open profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openTeam}>
              {firstTeam ? "Open team" : "Add to a team"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ResendLink({
  id,
  onResend,
  separator = "—",
}: {
  id: Id;
  onResend: (id: Id) => void;
  separator?: string;
}) {
  const resend = useCallback(() => onResend(id), [id, onResend]);
  return (
    <span className="relative z-10 font-semibold text-orange-deep text-sm leading-[18px]">
      Expired {separator}{" "}
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

/** Covers the whole row with the link, so a click anywhere on it opens the person. */
const ROW_LINK =
  "outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ink";

function RowLink({
  row,
  onOpenInvite,
  children,
  className,
}: {
  row: Row;
  onOpenInvite: (id: Id) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const open = useCallback(() => onOpenInvite(row.id), [onOpenInvite, row.id]);
  if (row.kind === "invite") {
    return (
      <button
        className={cn(ROW_LINK, "cursor-pointer text-left", className)}
        onClick={open}
        type="button"
      >
        {children}
      </button>
    );
  }
  return (
    <Link
      className={cn(ROW_LINK, className)}
      params={{ memberId: row.member.userId }}
      to="/admin/members/$memberId"
    >
      {children}
    </Link>
  );
}

function InviteAvatar({ size = 36 }: { size?: 36 | 40 }) {
  return (
    <Avatar
      className={size === 40 ? "size-10" : undefined}
      size={36}
      tone="placeholder"
    >
      <AvatarFallback>?</AvatarFallback>
    </Avatar>
  );
}

function PersonName({ member, ctx }: { member: Member; ctx: RowContext }) {
  return (
    <>
      {member.user.name}
      {member.userId === ctx.viewerId ? (
        <span className="font-regular text-muted"> (you)</span>
      ) : null}
    </>
  );
}

function TeamCell({ member, ctx }: { member: Member; ctx: RowContext }) {
  const team = teamText(member, ctx);
  if (team) {
    return <>{team}</>;
  }
  return isStudentOnly(member.roles) ? (
    <span className="text-orange-deep">No team yet</span>
  ) : (
    <>—</>
  );
}

/** Desktop table, 1024 and up (1I2-0). */
function MembersTable({
  rows,
  ctx,
  members,
  handlers,
}: {
  rows: Row[];
  ctx: RowContext;
  members: Member[];
  handlers: RowHandlers;
}) {
  return (
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
          const isInvite = row.kind === "invite";
          const label = isInvite ? row.invite.email : row.member.user.name;
          return (
            <TableRow
              className="group/row relative hover:bg-fog hover:shadow-[-12px_0_0_#F4F4F2,12px_0_0_#F4F4F2]"
              key={row.id}
            >
              <TableCell className="py-3">
                <span className="flex items-center gap-3">
                  {isInvite ? (
                    <InviteAvatar />
                  ) : (
                    <Avatar size={36}>
                      <AvatarFallback>
                        {initials(row.member.user.name)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="flex flex-col">
                    <RowLink
                      className={cn(
                        "font-medium text-[15px] leading-[18px]",
                        isInvite ? "text-ink-soft" : "text-ink"
                      )}
                      onOpenInvite={handlers.onOpenInvite}
                      row={row}
                    >
                      {isInvite ? (
                        row.invite.email
                      ) : (
                        <PersonName ctx={ctx} member={row.member} />
                      )}
                    </RowLink>
                    <span className="text-[13px] text-muted leading-4">
                      {isInvite
                        ? inviterText(row.invite, ctx, members)
                        : row.member.user.email}
                    </span>
                  </span>
                </span>
              </TableCell>
              <TableCell className="py-3">
                <RoleBadge
                  roles={isInvite ? [row.invite.role] : row.member.roles}
                />
              </TableCell>
              <TableCell className="py-3">
                {isInvite ? (
                  (ctx.teamName(row.invite.teamId) ?? "No team")
                ) : (
                  <TeamCell ctx={ctx} member={row.member} />
                )}
              </TableCell>
              <TableCell className="py-3 text-muted text-sm">
                {(() => {
                  if (!isInvite) {
                    return joinedLabel(row.member, ctx.now, ctx.timeZone);
                  }
                  return row.invite.status === "expired" ? (
                    <ResendLink id={row.id} onResend={handlers.onResend} />
                  ) : (
                    inviteStatusText(row.invite, ctx)
                  );
                })()}
              </TableCell>
              <TableCell className="py-3 text-right">
                <span className="-my-2 -mr-2 inline-flex items-center gap-0.5">
                  <RowActions handlers={handlers} label={label} row={row} />
                  <ChevronRight
                    aria-hidden="true"
                    className="hidden size-4 text-ink group-hover/row:block"
                    strokeWidth={1.8}
                  />
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Tablet two-line rows, 768 to 1023 (A2T-0, spec D5O-0 rule 02). */
function MembersTabletRows({
  rows,
  ctx,
  members,
  handlers,
}: {
  rows: Row[];
  ctx: RowContext;
  members: Member[];
  handlers: RowHandlers;
}) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const isInvite = row.kind === "invite";
        const label = isInvite ? row.invite.email : row.member.user.name;
        let status: React.ReactNode;
        if (!isInvite) {
          status = joinedLabel(row.member, ctx.now, ctx.timeZone);
        } else if (row.invite.status === "expired") {
          status = (
            <ResendLink
              id={row.id}
              onResend={handlers.onResend}
              separator="·"
            />
          );
        } else {
          status = inviteStatusText(row.invite, ctx);
        }
        return (
          <li
            className="relative flex items-center gap-[14px] border-line border-b py-[14px] first:border-t hover:bg-fog"
            key={row.id}
          >
            {isInvite ? (
              <InviteAvatar size={40} />
            ) : (
              <Avatar className="size-10" size={44}>
                <AvatarFallback>
                  {initials(row.member.user.name)}
                </AvatarFallback>
              </Avatar>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <RowLink
                className="truncate font-semibold text-[15px] text-ink leading-5"
                onOpenInvite={handlers.onOpenInvite}
                row={row}
              >
                {isInvite ? (
                  row.invite.email
                ) : (
                  <PersonName ctx={ctx} member={row.member} />
                )}
              </RowLink>
              <span className="truncate text-muted text-sm leading-[18px]">
                {isInvite
                  ? inviterText(row.invite, ctx, members)
                  : row.member.user.email}
              </span>
            </span>
            <span className="flex w-[220px] shrink-0 flex-col items-start gap-1">
              <span className="flex items-center gap-2 text-ink text-sm leading-[18px]">
                <RoleBadge
                  roles={isInvite ? [row.invite.role] : row.member.roles}
                />
                {isInvite ? (
                  (ctx.teamName(row.invite.teamId) ?? "No team")
                ) : (
                  <TeamCell ctx={ctx} member={row.member} />
                )}
              </span>
              <span className="text-muted text-sm leading-[18px]">
                {status}
              </span>
            </span>
            <RowActions handlers={handlers} label={label} row={row} />
          </li>
        );
      })}
    </ul>
  );
}

function PhoneChevron() {
  return (
    <span className="flex w-5 shrink-0 justify-end">
      <ChevronRight
        aria-hidden="true"
        className="size-4 text-muted"
        strokeWidth={1.6}
      />
    </span>
  );
}

/** Phone rows (G8Q-0): the whole row opens the person, or the invite (GPF-0). */
function MembersPhoneList({
  rows,
  ctx,
  onOpenInvite,
}: {
  rows: Row[];
  ctx: RowContext;
  onOpenInvite: (id: Id) => void;
}) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        if (row.kind === "invite") {
          const { invite } = row;
          const expired = invite.status === "expired";
          return (
            <li
              className="relative flex items-center gap-3 border-line border-b py-3"
              key={row.id}
            >
              <InviteAvatar />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <RowLink
                  className="truncate font-semibold text-[15px] text-ink-soft leading-5"
                  onOpenInvite={onOpenInvite}
                  row={row}
                >
                  {invite.email}
                </RowLink>
                <span className="truncate text-[13px] text-muted leading-4">
                  {roleText([invite.role])}
                  {invite.teamId ? ` · ${ctx.teamName(invite.teamId)}` : ""} ·{" "}
                  <span
                    className={cn(expired && "font-semibold text-orange-deep")}
                  >
                    {expired ? "Expired" : inviteStatusText(invite, ctx)}
                  </span>
                </span>
              </span>
              <PhoneChevron />
            </li>
          );
        }
        const { member } = row;
        const team = teamText(member, ctx);
        const isYou = member.userId === ctx.viewerId;
        const days = daysAgo(member.createdAt, ctx.now, ctx.timeZone);
        return (
          <li
            className="relative flex items-center gap-3 border-line border-b py-3"
            key={row.id}
          >
            <Avatar size={36} tone={isYou ? "ink" : "fog"}>
              <AvatarFallback>{initials(member.user.name)}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <RowLink
                className="truncate font-semibold text-[15px] text-ink leading-5"
                onOpenInvite={onOpenInvite}
                row={row}
              >
                {member.user.name}
                {isYou ? (
                  <span className="font-medium text-muted"> (you)</span>
                ) : null}
              </RowLink>
              <span className="truncate text-[13px] text-muted leading-4">
                {roleText(member.roles)} ·{" "}
                {team ?? (
                  <span
                    className={cn(
                      isStudentOnly(member.roles) && "text-orange-deep"
                    )}
                  >
                    {isStudentOnly(member.roles) ? "No team yet" : "No team"}
                  </span>
                )}
                {team && days === 0 && !member.roles.includes("admin")
                  ? " · joined today"
                  : ""}
              </span>
            </span>
            <PhoneChevron />
          </li>
        );
      })}
    </ul>
  );
}

function pageNumbers(page: number, pageCount: number): number[] {
  const start = Math.max(1, Math.min(page - 1, pageCount - PAGE_WINDOW + 1));
  const end = Math.min(pageCount, start + PAGE_WINDOW - 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const PAGE_SIZE_ITEMS = PAGE_SIZES.map((size) => ({
  value: String(size),
  label: `${size} per page`,
}));

function PageButton({
  to,
  onPage,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  to: number;
  onPage: (page: number) => void;
}) {
  const go = useCallback(() => onPage(to), [onPage, to]);
  return <Button onClick={go} {...props} />;
}

/** "Showing 1 to 25 of 71", page numbers and page size (1I2-0 footer). */
function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const handleSize = useCallback(
    (value: string | null) => onPageSize(Number(value) as PageSize),
    [onPageSize]
  );
  return (
    <nav aria-label="Pages" className="flex items-center justify-between pt-5">
      <p className="text-muted text-sm leading-[18px]">
        Showing{" "}
        <span className="font-semibold text-ink">
          {first} to {last}
        </span>{" "}
        of {total}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <PageButton
            className="px-3 py-2 font-medium disabled:text-[#B5B5B5] disabled:opacity-100"
            disabled={page <= 1}
            onPage={onPage}
            size="xs"
            to={page - 1}
            variant="ghost"
          >
            <ChevronLeft className="size-3" strokeWidth={1.6} />
            Previous
          </PageButton>
          {pageNumbers(page, pageCount).map((n) => (
            <PageButton
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "size-[34px] p-0 text-sm",
                n === page ? "" : "font-medium"
              )}
              key={n}
              onPage={onPage}
              size="icon"
              to={n}
              variant={n === page ? "default" : "ghost"}
            >
              {n}
            </PageButton>
          ))}
          <PageButton
            className="px-3 py-2 disabled:text-[#B5B5B5] disabled:opacity-100"
            disabled={page >= pageCount}
            onPage={onPage}
            size="xs"
            to={page + 1}
            variant="ghost"
          >
            Next
            <ChevronRight className="size-3" strokeWidth={1.6} />
          </PageButton>
        </div>
        <Select
          items={PAGE_SIZE_ITEMS}
          onValueChange={handleSize}
          value={String(pageSize)}
        >
          <SelectTrigger
            aria-label="Rows per page"
            className="px-3 py-2 font-medium text-[13px] leading-4"
            variant="pill"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {PAGE_SIZE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  );
}

/** "Showing 25 of 71" and "Show 25 more" (tablet A2T-0, phone G8Q-0). */
function ShowMore({
  shown,
  total,
  pageSize,
  onMore,
}: {
  shown: number;
  total: number;
  pageSize: number;
  onMore: () => void;
}) {
  const more = Math.min(pageSize, total - shown);
  return (
    <>
      <div className="flex items-center justify-between pt-5 max-md:hidden">
        <p className="text-muted text-sm leading-[18px]">
          Showing {shown} of {total}
        </p>
        {more > 0 ? (
          <Button onClick={onMore} size="sm" variant="outline">
            Show {more} more
          </Button>
        ) : null}
      </div>
      {more > 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-[20px] bg-fog p-4 md:hidden">
          <p className="text-[13px] text-muted leading-4">
            Showing {shown} of {total}
          </p>
          <Button
            className="h-12 self-stretch border-ink"
            onClick={onMore}
            variant="outline"
          >
            Show {more} more
          </Button>
        </div>
      ) : null}
    </>
  );
}

const SKELETON_ROWS = [
  { id: "a", name: "w-[150px]", sub: "w-[110px]" },
  { id: "b", name: "w-[120px]", sub: "w-[140px]" },
  { id: "c", name: "w-[170px]", sub: "w-[90px]" },
  { id: "d", name: "w-[140px]", sub: "w-[120px]" },
  { id: "e", name: "w-40", sub: "w-[100px]" },
];

/** Grey rows in place of the list (BPI-0, spec AGW-0 "Lists"). */
function MembersSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col" role="status">
      {SKELETON_ROWS.map((row, index) => (
        <div
          className={cn(
            "flex animate-pulse items-center gap-3 py-3",
            index < SKELETON_ROWS.length - 1
              ? "border-line border-b"
              : "opacity-50"
          )}
          key={row.id}
        >
          <div className="size-9 shrink-0 rounded-full bg-[#ECECE9]" />
          <div className="flex flex-1 flex-col gap-[7px]">
            <div className={cn("h-3 rounded-[6px] bg-[#ECECE9]", row.name)} />
            <div
              className={cn("h-[10px] rounded-[5px] bg-[#F2F2EF]", row.sub)}
            />
          </div>
          <div className="h-[18px] w-14 rounded-full bg-[#F2F2EF] max-md:hidden" />
        </div>
      ))}
    </div>
  );
}

/** "It's just you so far" (spec AGW-0, Members first use). */
function JustYou({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <p className="font-semibold text-base text-ink leading-5">
        It’s just you so far
      </p>
      <p className="max-w-prose text-muted text-sm leading-[20px]">
        Invite coaches and students by email, or make a join code to share on
        WhatsApp.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onInvite} size="sm">
          Invite people
        </Button>
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          to="/admin/join-codes"
        >
          Make a join code
        </Link>
      </div>
    </div>
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

function byName(a: Member, b: Member): number {
  return a.user.name.localeCompare(b.user.name);
}

/** Resend and cancel from a row, with their toasts. */
function useInviteActions(academyId: Id) {
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();
  const onResend = useCallback(
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
  const onCancel = useCallback(
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
  return { onResend, onCancel };
}

function MembersToolbar({
  academyId,
  search,
  onSearchChange,
  hiddenOnPhone,
}: {
  academyId: Id;
  search: MembersSearch;
  onSearchChange: (patch: Partial<MembersSearch>) => void;
  hiddenOnPhone: boolean;
}) {
  const navigate = useNavigate();
  const teams = useQuery(teamListQueryOptions(academyId)).data;
  const counts = useQuery({
    ...memberCountsQueryOptions(academyId),
    throwOnError: false,
  }).data;
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
        navigate({ to: "/admin/join-codes" });
        return;
      }
      const next = value as MembersTab;
      onSearchChange({
        tab: next === "all" ? undefined : next,
        page: undefined,
      });
    },
    [navigate, onSearchChange]
  );
  const handleQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSearchChange({ q: event.target.value || undefined, page: undefined }),
    [onSearchChange]
  );
  const handleTeam = useCallback(
    (value: string | null) =>
      onSearchChange({
        team: !value || value === ALL_TEAMS ? undefined : value,
        page: undefined,
      }),
    [onSearchChange]
  );
  const teamItems = [
    { value: ALL_TEAMS, label: "All teams" },
    ...(teams ?? []).map((t) => ({ value: t.team.id, label: t.team.name })),
    { value: NO_TEAM, label: "No team" },
  ];
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 max-lg:flex-col max-lg:items-stretch",
        hiddenOnPhone && "max-md:hidden"
      )}
    >
      <Tabs onValueChange={handleTab} value={search.tab ?? "all"}>
        <TabsList
          aria-label="Filter by role"
          className="max-md:-mr-5 max-md:overflow-x-auto max-md:rounded-r-none md:w-fit max-md:[scrollbar-width:none]"
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
          <TabsTrigger className="max-md:hidden" value="admins">
            Admins <TabsCount>{counts?.admins}</TabsCount>
          </TabsTrigger>
          <TabsTrigger className="max-md:flex-none" value="invites">
            Invites{" "}
            <TabsCount tone={counts?.invites ? "alert" : "muted"}>
              {counts?.invites}
            </TabsCount>
          </TabsTrigger>
          <TabsTrigger className="max-md:flex-none" value={JOIN_CODES_TAB}>
            Join codes{" "}
            <TabsCount className="max-md:hidden">{activeCodes}</TabsCount>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex gap-2">
        <SearchInput
          aria-label="Search members"
          className="w-[260px] max-md:h-11 max-md:px-4 max-md:text-[15px] max-lg:w-auto max-lg:flex-1"
          onChange={handleQuery}
          placeholder="Search name or email"
          value={search.q ?? ""}
        />
        <Select
          items={teamItems}
          onValueChange={handleTeam}
          value={search.team ?? ALL_TEAMS}
        >
          <SelectTrigger
            aria-label="Team"
            className="py-[10px] max-md:hidden"
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
  );
}

function NoRows({ invitesOnly }: { invitesOnly: boolean }) {
  return (
    <Empty className="flex-none py-10">
      <EmptyHeader>
        <EmptyTitle className="text-[28px] max-md:text-[24px]">
          {invitesOnly ? "No invites waiting" : "No one matches"}
        </EmptyTitle>
        <EmptyDescription className="text-[15px]">
          {invitesOnly
            ? "Everyone you invited has joined."
            : "Try another name, email or team."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function sortRows(members: Member[], invites: Invitation[]): Row[] {
  const staff = members
    .filter((m) => memberRank(m) < 2)
    .sort(
      (a, b) =>
        memberRank(a) - memberRank(b) || a.createdAt.localeCompare(b.createdAt)
    );
  const students = members.filter((m) => memberRank(m) === 2).sort(byName);
  return [
    ...staff.map((m): Row => ({ kind: "member", id: m.id, member: m })),
    ...invites.map((i): Row => ({ kind: "invite", id: i.id, invite: i })),
    ...students.map((m): Row => ({ kind: "member", id: m.id, member: m })),
  ];
}

function MembersResults({
  academyId,
  members,
  invites,
  timeZone,
  search,
  onSearchChange,
  onInvite,
}: {
  academyId: Id;
  members: Member[];
  invites: Invitation[];
  timeZone?: string;
  search: MembersSearch;
  onSearchChange: (patch: Partial<MembersSearch>) => void;
  onInvite: () => void;
}) {
  const viewer = useViewer();
  const now = useReferenceNow();
  const teams = useQuery(teamListQueryOptions(academyId)).data;
  // The owner's name on invites they sent; left out if it fails.
  const owner = useQuery({
    ...platformOwnerQueryOptions(),
    throwOnError: false,
  }).data;
  const { onResend, onCancel } = useInviteActions(academyId);
  const tab = search.tab ?? "all";
  const team = search.team ?? ALL_TEAMS;
  const pageSize = search.per ?? DEFAULT_PAGE_SIZE;
  const needle = (search.q ?? "").trim().toLowerCase();

  const teamName = useCallback(
    (id: Id | null) => teams?.find((t) => t.team.id === id)?.team.name ?? null,
    [teams]
  );
  const rows = useMemo(() => sortRows(members, invites), [members, invites]);
  const visible = rows.filter(
    (row) =>
      matchesTab(row, tab) &&
      matchesTeam(row, team) &&
      matchesQuery(row, needle)
  );
  // Phones list invites only under their own tab (G8Q-0).
  const phoneVisible =
    tab === "invites" ? visible : visible.filter((r) => r.kind === "member");

  const onOpenInvite = useCallback(
    (id: Id) => onSearchChange({ invite: id }),
    [onSearchChange]
  );
  const handlers: RowHandlers = { onCancel, onResend, onOpenInvite };
  const handlePage = useCallback(
    (next: number) => onSearchChange({ page: next > 1 ? next : undefined }),
    [onSearchChange]
  );
  const handlePageSize = useCallback(
    (size: PageSize) =>
      onSearchChange({
        per: size === DEFAULT_PAGE_SIZE ? undefined : size,
        page: undefined,
      }),
    [onSearchChange]
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(search.page ?? 1, pageCount);
  const showMore = useCallback(
    () => onSearchChange({ page: currentPage + 1 }),
    [onSearchChange, currentPage]
  );
  const ctx: RowContext = {
    now,
    teamName,
    timeZone,
    viewerId: viewer.user.id,
    owner: owner ?? null,
  };
  const pageRows = visible.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  // Tablet and phone grow the list instead of paging: `page` is how many lots show.
  const tabletRows = visible.slice(0, currentPage * pageSize);
  const phoneRows = phoneVisible.slice(0, currentPage * pageSize);
  const unfiltered = !needle && team === ALL_TEAMS;
  const justYou =
    members.length === 1 && invites.length === 0 && tab === "all" && unfiltered;

  return (
    <div>
      <div className="max-lg:hidden">
        <MembersTable
          ctx={ctx}
          handlers={handlers}
          members={members}
          rows={pageRows}
        />
        {visible.length > 0 ? (
          <Pagination
            onPage={handlePage}
            onPageSize={handlePageSize}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={visible.length}
          />
        ) : null}
      </div>
      <div className="max-md:hidden lg:hidden">
        <MembersTabletRows
          ctx={ctx}
          handlers={handlers}
          members={members}
          rows={tabletRows}
        />
        {visible.length > 0 ? (
          <ShowMore
            onMore={showMore}
            pageSize={pageSize}
            shown={tabletRows.length}
            total={visible.length}
          />
        ) : null}
      </div>
      <div className="md:hidden">
        <MembersPhoneList
          ctx={ctx}
          onOpenInvite={onOpenInvite}
          rows={phoneRows}
        />
        {phoneVisible.length > 0 ? (
          <ShowMore
            onMore={showMore}
            pageSize={pageSize}
            shown={phoneRows.length}
            total={phoneVisible.length}
          />
        ) : null}
      </div>
      {justYou ? <JustYou onInvite={onInvite} /> : null}
      {visible.length === 0 ? (
        <NoRows invitesOnly={tab === "invites" && unfiltered} />
      ) : null}
    </div>
  );
}

/**
 * Members, stories AO-2/AO-3. Desktop table with pages (1I2-0), tablet two-line rows
 * (A2T-0) and phone rows (G8Q-0) with "Show 25 more"; loading BPI-0. Every row opens
 * the person (/admin/members/$memberId) or the invite (?invite=<id>, GPF-0).
 */
export function MembersScreen({
  academyId,
  timeZone,
  search,
  onSearchChange,
  onInvite,
}: {
  academyId: Id;
  timeZone?: string;
  search: MembersSearch;
  onSearchChange: (patch: Partial<MembersSearch>) => void;
  onInvite: () => void;
}) {
  const members = useQuery(membersQueryOptions(academyId)).data;
  const invites = useQuery(invitationsQueryOptions(academyId)).data;
  const teams = useQuery(teamListQueryOptions(academyId)).data;
  // The eyebrow count is an extra: left out if it fails.
  const counts = useQuery({
    ...memberCountsQueryOptions(academyId),
    throwOnError: false,
  }).data;
  const loaded =
    members !== undefined && invites !== undefined && teams !== undefined;

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow className="max-md:hidden">
            {counts
              ? `${counts.people} people · ${teams?.length ?? 0} teams`
              : " "}
          </Eyebrow>
          <PageTitle>Members</PageTitle>
        </PageHeading>
        <PageActions>
          <Button
            className="max-md:gap-1.5 max-md:px-4 max-md:py-[10px] max-md:text-sm"
            onClick={onInvite}
          >
            <PlusIcon />
            <span className="max-md:hidden">Invite people</span>
            <span className="md:hidden">Invite</span>
          </Button>
        </PageActions>
      </PageHeader>
      <div className="flex flex-col gap-8 max-md:gap-4">
        {loaded ? null : (
          <div className="h-[34px] animate-pulse rounded-full bg-fog md:hidden" />
        )}
        <MembersToolbar
          academyId={academyId}
          hiddenOnPhone={!loaded}
          onSearchChange={onSearchChange}
          search={search}
        />
        {members && invites && teams ? (
          <MembersResults
            academyId={academyId}
            invites={invites}
            members={members}
            onInvite={onInvite}
            onSearchChange={onSearchChange}
            search={search}
            timeZone={timeZone}
          />
        ) : (
          <MembersSkeleton />
        )}
      </div>
    </>
  );
}
