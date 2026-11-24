import { Button } from "@hoops-genesis/ui/components/button";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { QueryBoundary } from "@/components/error-state";
import { describeOwnerAudit } from "@/features/owner-audit/describe";
import {
  type OwnerAuditItem,
  ownerAuditPageQueryOptions,
} from "@/features/owner-audit/queries";
import {
  AddToAcademyDialog,
  MakeAdminDialog,
  RemoveAdminDialog,
} from "@/features/owner-users/admin-dialogs";
import { BanDialog } from "@/features/owner-users/ban-dialog";
import {
  type PlatformUser,
  type PlatformUserMembership,
  platformUserQueryOptions,
  userSessionsQueryOptions,
} from "@/features/owner-users/queries";
import {
  ACCOUNT_ACTIONS_NOTE,
  countryOfZone,
  DetailRow,
  devicesText,
  EyeIcon,
  FALLBACK_TIMEZONE,
  formatFullDate,
  lastSignInText,
  plural,
  UserAvatar,
  useSignOutEverywhere,
  ZoneDot,
} from "@/features/owner-users/user-parts";
import { useViewAs } from "@/features/owner-users/view-as";
import type { AcademyRole, Id } from "@/features/types";
import { firstName, formatRelativeDay, formatTime } from "@/lib/format";
import { appNow } from "@/lib/preview";

export type PersonDialog = "ban" | "add" | "make-admin" | "remove-admin";

export interface PersonSearch {
  academy?: string;
  dialog?: PersonDialog;
}

const ACTIVITY_LIMIT = 4;
const MS_PER_DAY = 86_400_000;
const DAYS_IN_WEEK = 7;
const LEADING_WEEKDAY = /^\w+ /;

const COUNTRY_NAME = { india: "India", rwanda: "Rwanda", uganda: "Uganda" };

function placeOf(timeZone: string): string {
  const country = countryOfZone(timeZone);
  return country
    ? COUNTRY_NAME[country]
    : (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

const ROLE_TITLE: Record<AcademyRole, string> = {
  admin: "Admin",
  coach: "Coach",
  student: "Student",
};

/** "Admin since 3 Mar 2026. Also coaches U12, U14, U16." */
function membershipLine(m: PlatformUserMembership): string {
  const [first] = m.roles;
  const since = first
    ? `${ROLE_TITLE[first]} since ${formatFullDate(m.joinedAt, m.timezone)}.`
    : `Member since ${formatFullDate(m.joinedAt, m.timezone)}.`;
  if (m.teamNames.length === 0) {
    return since;
  }
  const teams = m.teamNames.join(", ");
  if (m.roles.includes("coach")) {
    return `${since} ${first === "coach" ? "Coaches" : "Also coaches"} ${teams}.`;
  }
  return `${since} Plays on ${teams}.`;
}

/** Phone: "Admin · coaches U12, U14, U16". */
function membershipShort(m: PlatformUserMembership): string {
  const roles = m.roles.map((r) => ROLE_TITLE[r]).join(", ");
  if (m.teamNames.length === 0) {
    return roles;
  }
  const verb = m.roles.includes("coach") ? "coaches" : "plays on";
  return `${roles} · ${verb} ${m.teamNames.join(", ")}`;
}

function RoleBadge({ role }: { role: AcademyRole }) {
  return (
    <span
      className={cn(
        "rounded-full px-[10px] py-[5px] font-semibold text-[12px] leading-4",
        role === "admin"
          ? "bg-ink text-white"
          : "border border-[#D4D4D4] bg-white text-ink"
      )}
    >
      {ROLE_TITLE[role]}
    </span>
  );
}

function useDialogState() {
  const navigate = useNavigate({ from: "/owner/users/$userId" });
  const open = useCallback(
    (dialog: PersonDialog, academy?: Id) =>
      navigate({ search: (prev) => ({ ...prev, dialog, academy }) }),
    [navigate]
  );
  const close = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        navigate({
          search: (prev) => ({
            ...prev,
            dialog: undefined,
            academy: undefined,
          }),
          replace: true,
        });
      }
    },
    [navigate]
  );
  return { open, close };
}

function MembershipRow({
  membership,
  onMakeAdmin,
  onChange,
}: {
  membership: PlatformUserMembership;
  onMakeAdmin: (academyId: Id) => void;
  onChange: (academyId: Id) => void;
}) {
  const isAdmin = membership.roles.includes("admin");
  const handleClick = useCallback(
    () =>
      isAdmin
        ? onChange(membership.academyId)
        : onMakeAdmin(membership.academyId),
    [isAdmin, membership.academyId, onChange, onMakeAdmin]
  );
  return (
    <li className="flex items-center gap-[14px] rounded-md bg-fog p-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[10px] font-display text-base leading-5",
          isAdmin ? "bg-orange text-ink" : "bg-ink text-white"
        )}
      >
        HG
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            className="font-semibold text-[15px] text-ink leading-5 hover:underline"
            params={{ academyId: membership.academyId }}
            to="/owner/academies/$academyId"
          >
            {membership.academyName}
          </Link>
          <span className="flex items-center gap-2 text-[13px] text-muted leading-4">
            <ZoneDot timeZone={membership.timezone} />
            {placeOf(membership.timezone)}
          </span>
        </span>
        <span className="text-[13px] text-muted leading-4">
          {membershipLine(membership)}
        </span>
      </span>
      <span className="flex shrink-0 gap-[6px]">
        {membership.roles.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
      </span>
      <button
        className="shrink-0 cursor-pointer font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-[3px] outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
        onClick={handleClick}
        type="button"
      >
        {isAdmin ? "Change" : "Make admin"}
      </button>
    </li>
  );
}

function PlusSmall() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AcademiesCard({
  user,
  onDialog,
}: {
  user: PlatformUser;
  onDialog: (dialog: PersonDialog, academy?: Id) => void;
}) {
  const openAdd = useCallback(() => onDialog("add"), [onDialog]);
  const makeAdmin = useCallback(
    (academyId: Id) => onDialog("make-admin", academyId),
    [onDialog]
  );
  const change = useCallback(
    (academyId: Id) => onDialog("remove-admin", academyId),
    [onDialog]
  );
  return (
    <section
      aria-labelledby="person-academies"
      className="flex flex-col gap-3 rounded-[20px] border border-line px-6 py-[22px]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className="font-semibold text-[17px] text-ink leading-[22px]"
          id="person-academies"
        >
          Academies
        </h2>
        <Button
          className="px-[14px]"
          disabled={user.platformRole === "admin"}
          onClick={openAdd}
          size="sm"
          variant="outline"
        >
          <PlusSmall />
          Add to an academy
        </Button>
      </div>
      {user.memberships.length === 0 ? (
        <p className="rounded-md bg-fog p-4 text-muted text-sm leading-[18px]">
          {user.platformRole === "admin"
            ? "Platform owners don't belong to academies."
            : "Not in any academy yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {user.memberships.map((m) => (
            <MembershipRow
              key={m.academyId}
              membership={m}
              onChange={change}
              onMakeAdmin={makeAdmin}
            />
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted leading-[18px]">
        Only you can make someone an academy admin. Academy admins can only
        switch people between coach and student.
      </p>
    </section>
  );
}

/** "Today 08:12", "Sat 21 Nov". */
function activityWhen(value: string, timeZone: string | undefined): string {
  const now = appNow();
  const day = formatRelativeDay(value, timeZone, now);
  if (day === "Today" || day === "Yesterday") {
    return `${day} ${formatTime(value, timeZone)}`;
  }
  const old = (now.getTime() - Date.parse(value)) / MS_PER_DAY >= DAYS_IN_WEEK;
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  })
    .format(new Date(value))
    .replace(",", "");
  return old ? date.replace(LEADING_WEEKDAY, "") : date;
}

/** Phone: "11:12" today, "Sun" this week, "16 Nov" before. */
function shortWhen(value: string, timeZone: string | undefined): string {
  const now = appNow();
  if (formatRelativeDay(value, timeZone, now) === "Today") {
    return formatTime(value, timeZone);
  }
  const old = (now.getTime() - Date.parse(value)) / MS_PER_DAY >= DAYS_IN_WEEK;
  return new Intl.DateTimeFormat("en-GB", {
    ...(old ? { day: "numeric", month: "short" } : { weekday: "short" }),
    timeZone,
  }).format(new Date(value));
}

function useActivity(userId: Id) {
  const queryClient = useQueryClient();
  return useQuery({
    ...ownerAuditPageQueryOptions(
      queryClient,
      { actorId: userId, academyId: null, type: "all", date: "all" },
      ACTIVITY_LIMIT,
      1
    ),
  });
}

function ActivityRows({ items }: { items: OwnerAuditItem[] }) {
  if (items.length === 0) {
    return (
      <p className="border-line border-t py-3 text-muted text-sm leading-[18px]">
        Nothing yet.
      </p>
    );
  }
  return (
    <ul>
      {items.map((item) => (
        <li
          className="flex items-center gap-4 border-line border-t py-3 max-md:items-start max-md:gap-[10px] max-md:border-0 max-md:py-1"
          key={item.id}
        >
          <span className="w-24 shrink-0 text-[13px] text-muted leading-4 max-md:hidden">
            {activityWhen(item.createdAt, item.academy?.timezone)}
          </span>
          <span className="w-[42px] shrink-0 font-semibold text-[12px] text-muted leading-[18px] md:hidden">
            {shortWhen(item.createdAt, item.academy?.timezone)}
          </span>
          <span className="min-w-0 flex-1 text-ink text-sm leading-[18px]">
            {describeOwnerAudit(item)}
            {item.academy ? (
              <span className="md:hidden"> in {item.academy.shortName}</span>
            ) : null}
          </span>
          {item.academy ? (
            <span className="flex shrink-0 items-center gap-[6px] text-[13px] text-muted leading-4 max-md:hidden">
              <ZoneDot timeZone={item.academy.timezone} />
              {item.academy.shortName}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ActivityCard({ userId }: { userId: Id }) {
  const { data } = useActivity(userId);
  return (
    <section
      aria-labelledby="person-activity"
      className="flex flex-col rounded-[20px] border border-line px-6 pt-[22px] pb-[10px]"
    >
      <div className="flex items-center justify-between pb-3">
        <h2
          className="font-semibold text-[17px] text-ink leading-[22px]"
          id="person-activity"
        >
          Recent activity
        </h2>
        <Link
          className="font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-[3px] hover:decoration-2"
          search={{ person: userId, date: "all" }}
          to="/owner/audit"
        >
          Open in audit log
        </Link>
      </div>
      {data ? (
        <ActivityRows items={data.items} />
      ) : (
        <Skeleton className="mb-3 h-[120px]" />
      )}
    </section>
  );
}

function AccountActions({
  user,
  onBan,
  className,
}: {
  user: PlatformUser;
  onBan: () => void;
  className?: string;
}) {
  const { data: sessions } = useQuery({
    ...userSessionsQueryOptions(user.id),
    throwOnError: false,
  });
  const { viewAs, isPending } = useViewAs();
  const { signOut, isPending: signOutPending } = useSignOutEverywhere(user);
  const handleViewAs = useCallback(() => viewAs(user.id), [viewAs, user.id]);
  const first = firstName(user.name);
  const isOwner = user.platformRole === "admin";
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Button
        disabled={user.banned || isOwner || isPending}
        onClick={handleViewAs}
      >
        <EyeIcon />
        View as {first}
      </Button>
      <Button
        className="max-md:hidden"
        disabled={(sessions?.length ?? 0) === 0 || signOutPending}
        onClick={signOut}
        variant="outline"
      >
        Sign out everywhere
      </Button>
      <Button
        className={cn(!user.banned && "text-orange-deep hover:bg-white")}
        disabled={isOwner}
        onClick={onBan}
        variant="ghost"
      >
        {user.banned ? "Unban account…" : "Ban account…"}
      </Button>
    </div>
  );
}

function AccountRows({ user }: { user: PlatformUser }) {
  const { data: sessions } = useQuery({
    ...userSessionsQueryOptions(user.id),
    throwOnError: false,
  });
  const timeZone = user.memberships[0]?.timezone ?? FALLBACK_TIMEZONE;
  return (
    <>
      <DetailRow label="Email" value={user.email} />
      <DetailRow
        label="Created"
        value={formatFullDate(user.createdAt, timeZone)}
      />
      {user.banned ? (
        <DetailRow
          label="Ban reason"
          tone="alert"
          value={user.banReason ?? "None given"}
        />
      ) : null}
      <DetailRow
        label="Last sign-in"
        value={lastSignInText(sessions, timeZone)}
      />
      <DetailRow label="Signed in on" value={devicesText(sessions?.length)} />
    </>
  );
}

function StatusChip({ banned }: { banned: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-[6px] rounded-full px-[10px] py-1 font-semibold text-[13px] leading-4",
        banned ? "bg-orange-soft text-orange-deep" : "bg-[#E3F4EA] text-success"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-[7px] rounded-full",
          banned ? "bg-orange-deep" : "bg-success"
        )}
      />
      {banned ? "Banned" : "Active account"}
    </span>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 14 14" width="18">
      <path
        d="M8.5 3L4.5 7l4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** EQE-0 (desktop and tablet). */
function DesktopPerson({
  user,
  onDialog,
}: {
  user: PlatformUser;
  onDialog: (dialog: PersonDialog, academy?: Id) => void;
}) {
  const openBan = useCallback(() => onDialog("ban"), [onDialog]);
  return (
    <div className="flex flex-col gap-8 max-md:hidden">
      <div className="flex flex-col gap-2">
        <Link
          className="w-fit font-medium text-muted text-sm uppercase leading-[18px] tracking-label hover:text-ink"
          to="/owner/users"
        >
          ← Users
        </Link>
        <h1 className="font-display text-display-sm text-ink uppercase leading-[95%]">
          {user.name}
        </h1>
        <div className="flex flex-wrap items-center gap-[10px] pt-[6px]">
          <span className="rounded-full bg-fog px-[10px] py-1 font-semibold text-[13px] text-ink leading-4">
            {plural(user.memberships.length, "academy", "academies")}
          </span>
          <StatusChip banned={user.banned} />
          <span className="text-muted text-sm leading-[18px]">
            {user.email}
          </span>
        </div>
      </div>
      <div className="flex w-full items-start gap-6 max-lg:flex-col">
        <div className="flex min-w-0 flex-1 flex-col gap-6 max-lg:w-full">
          <AcademiesCard onDialog={onDialog} user={user} />
          <QueryBoundary what="recent activity">
            <ActivityCard userId={user.id} />
          </QueryBoundary>
        </div>
        <section
          aria-labelledby="person-account"
          className="flex w-[400px] shrink-0 flex-col gap-4 rounded-[20px] bg-fog px-6 py-[22px] max-lg:w-full"
        >
          <h2
            className="font-semibold text-[17px] text-ink leading-[22px]"
            id="person-account"
          >
            Account
          </h2>
          <dl className="flex flex-col rounded-[14px] bg-white px-4 py-1">
            <AccountRows user={user} />
          </dl>
          <AccountActions onBan={openBan} user={user} />
          <p className="text-[13px] text-muted leading-[18px]">
            {ACCOUNT_ACTIONS_NOTE}
          </p>
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
      {children}
    </h2>
  );
}

/** E73-0 (phone). */
function PhonePerson({
  user,
  onDialog,
}: {
  user: PlatformUser;
  onDialog: (dialog: PersonDialog, academy?: Id) => void;
}) {
  const openBan = useCallback(() => onDialog("ban"), [onDialog]);
  const { data: activity } = useActivity(user.id);
  return (
    <div className="flex flex-col gap-5 md:hidden">
      <div className="flex items-center justify-between">
        <Link
          className="flex items-center gap-[6px] font-semibold text-[15px] text-ink leading-5"
          to="/owner/users"
        >
          <BackIcon />
          Users
        </Link>
        <UserAvatar size={36} tone="ink" user={user} />
      </div>
      <div className="flex flex-col gap-[2px]">
        <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label">
          {user.banned ? "Banned account" : "Account"} ·{" "}
          {plural(user.memberships.length, "academy", "academies")}
        </p>
        <h1 className="font-display text-display-sm text-ink uppercase leading-[95%]">
          {user.name}
        </h1>
      </div>
      <section className="flex flex-col gap-2">
        <SectionLabel>Memberships</SectionLabel>
        {user.memberships.length === 0 ? (
          <p className="text-muted text-sm">Not in any academy yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {user.memberships.map((m) => (
              <li
                className="flex items-center gap-3 rounded-[14px] bg-fog p-[14px]"
                key={m.academyId}
              >
                <ZoneDot className="size-2" timeZone={m.timezone} />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate font-semibold text-[15px] text-ink leading-5">
                    {m.academyName}
                  </span>
                  <span className="truncate text-[13px] text-muted leading-4">
                    {membershipShort(m)}
                  </span>
                </span>
                {m.roles[0] ? <RoleBadge role={m.roles[0]} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col">
        <SectionLabel>Account</SectionLabel>
        <dl className="flex flex-col">
          <AccountRows user={user} />
        </dl>
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>Recent activity</SectionLabel>
        {activity ? (
          <ActivityRows items={activity.items} />
        ) : (
          <Skeleton className="h-16" />
        )}
      </section>
      <AccountActions className="gap-2" onBan={openBan} user={user} />
    </div>
  );
}

function PersonSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6" role="status">
      <span className="sr-only">Loading this person</span>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-14 w-1/2" />
      <div className="flex gap-6 max-lg:flex-col">
        <Skeleton className="h-[260px] flex-1" />
        <Skeleton className="h-[260px] w-[400px] max-lg:w-full" />
      </div>
    </div>
  );
}

/**
 * A person, for the owner (PA-2): "[Owner · Web] Member detail, person" (EQE-0),
 * phone E73-0. Their academies and roles, account and sessions, recent activity,
 * and the owner's actions: view as, sign out everywhere, ban, and appoint or remove
 * them as an academy admin. Dialogs are in the URL (`?dialog=`, `&academy=`).
 */
export function PersonScreen({
  userId,
  search,
}: {
  userId: Id;
  search: PersonSearch;
}) {
  const { data: user } = useQuery(platformUserQueryOptions(userId));
  const { open, close } = useDialogState();
  if (user === undefined) {
    return <PersonSkeleton />;
  }
  if (user === null) {
    return (
      <div className="flex flex-col gap-2">
        <Link className="font-semibold text-ink text-sm" to="/owner/users">
          ← Users
        </Link>
        <h1 className="font-semibold text-ink text-lg">No such person</h1>
        <p className="text-muted text-sm">
          The account may have been removed, or the link is old.
        </p>
      </div>
    );
  }
  const membership = user.memberships.find(
    (m) => m.academyId === search.academy
  );
  return (
    <>
      <DesktopPerson onDialog={open} user={user} />
      <PhonePerson onDialog={open} user={user} />
      <BanDialog
        onOpenChange={close}
        open={search.dialog === "ban"}
        user={user}
      />
      <AddToAcademyDialog
        onOpenChange={close}
        open={search.dialog === "add"}
        user={user}
      />
      <MakeAdminDialog
        membership={membership}
        onOpenChange={close}
        open={search.dialog === "make-admin"}
        user={user}
      />
      <RemoveAdminDialog
        membership={membership}
        onOpenChange={close}
        open={search.dialog === "remove-admin"}
        user={user}
      />
    </>
  );
}
