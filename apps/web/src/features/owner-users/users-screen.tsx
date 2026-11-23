import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import { CountryDot } from "@hoops-genesis/ui/components/chip";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import {
  List,
  ListRow,
  ListRowChevron,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, useCallback } from "react";
import { toast } from "sonner";

import { BanDialog } from "@/features/owner-users/ban-dialog";
import {
  type PlatformUser,
  type PlatformUserMembership,
  platformUsersQueryOptions,
  useForgetOwnerQueries,
  useImpersonateUser,
  useRevokeUserSessions,
  userSessionsQueryOptions,
} from "@/features/owner-users/queries";
import type { AcademyRole, Country } from "@/features/types";
import { roleLabel } from "@/features/viewer/selectors";
import { errorMessage } from "@/lib/api-client";
import {
  firstName,
  formatRelativeDay,
  formatTime,
  initials,
} from "@/lib/format";
import { appNow } from "@/lib/preview";

export interface UsersSearch {
  dialog?: "ban";
  q?: string;
  user?: string;
}

const COUNTRY_BY_TIMEZONE: Record<string, Country> = {
  "Asia/Kolkata": "india",
  "Africa/Kigali": "rwanda",
  "Africa/Kampala": "uganda",
};
const FALLBACK_TIMEZONE = "Africa/Kigali";

function membershipLabel(m: PlatformUserMembership): string {
  const roles = m.roles.map(roleLabel).join(" · ");
  const team =
    m.roles.includes("student") && m.teamNames[0] ? ` · ${m.teamNames[0]}` : "";
  return `${m.academyShortName} · ${roles}${team}`;
}

function roleSummary(user: PlatformUser): string {
  const roles = [...new Set(user.memberships.flatMap((m) => m.roles))];
  if (roles.length === 0) {
    return "No academy yet";
  }
  const [only] = user.memberships;
  const team =
    user.memberships.length === 1 &&
    only?.roles.includes("student") &&
    only.teamNames[0]
      ? ` · ${only.teamNames[0]}`
      : "";
  return `${roles.map((r: AcademyRole) => roleLabel(r)).join(" · ")}${team}`;
}

/** "4 Sep" (en-GB would print "4 Sept"). */
function formatJoined(value: string, timeZone: string): string {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone,
  }).format(date);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone,
  }).format(date);
  return `${day} ${month}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function MembershipChips({ user }: { user: PlatformUser }) {
  if (user.memberships.length === 0) {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-[6px]">
      {user.memberships.map((m) => (
        <span
          className="inline-flex items-center gap-[6px] rounded-full bg-fog px-[10px] py-1 text-[13px] text-ink leading-4"
          key={m.academyId}
        >
          <CountryDot country={COUNTRY_BY_TIMEZONE[m.timezone] ?? "rwanda"} />
          {membershipLabel(m)}
        </span>
      ))}
    </span>
  );
}

function UserAvatar({
  user,
  size,
  tone,
}: {
  user: PlatformUser;
  size: 44 | 52 | 36;
  tone: "fog" | "white";
}) {
  return (
    <Avatar
      className={cn("font-semibold", size === 44 && "text-sm")}
      size={size}
      tone={tone}
    >
      <AvatarFallback>{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}

function SearchField({
  value,
  resultCount,
  onChange,
}: {
  value: string;
  resultCount: number | null;
  onChange: (value: string) => void;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange]
  );
  return (
    <label className="flex w-full cursor-text items-center gap-[10px] rounded-md border-2 border-ink bg-white px-5 py-4 max-md:px-4 max-md:py-3">
      <svg
        aria-hidden="true"
        className="shrink-0 text-ink"
        height="18"
        viewBox="0 0 16 16"
        width="18"
      >
        <circle
          cx="7"
          cy="7"
          fill="none"
          r="4.8"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M10.6 10.6L14 14"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
      <span className="relative flex min-w-0 flex-1">
        <input
          aria-label="Search people by name or email"
          autoComplete="off"
          className="w-full min-w-0 bg-transparent text-[17px] text-ink leading-[22px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          onChange={handleChange}
          placeholder="Search name or email"
          type="search"
          value={value}
        />
        {/* The count sits right after the typed text, as drawn. */}
        {value && resultCount !== null ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex max-w-full items-center overflow-hidden whitespace-pre"
          >
            <span className="invisible text-[17px] leading-[22px]">
              {value}
            </span>
            <span className="pl-2 text-[15px] text-muted leading-[18px]">
              · {plural(resultCount, "result", "results")}
            </span>
          </span>
        ) : null}
        <span aria-live="polite" className="sr-only">
          {value && resultCount !== null
            ? plural(resultCount, "result", "results")
            : ""}
        </span>
      </span>
    </label>
  );
}

function UserCard({
  user,
  selected,
  search,
}: {
  user: PlatformUser;
  selected: boolean;
  search: UsersSearch;
}) {
  return (
    <Link
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex items-center gap-[14px] rounded-md p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        selected
          ? "border-2 border-ink"
          : "border border-line hover:border-stone hover:bg-fog/50"
      )}
      replace
      search={{ q: search.q, user: user.id }}
      to="/owner/users"
    >
      <UserAvatar size={44} tone="fog" user={user} />
      <span className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <span className="flex flex-col">
          <span className="truncate font-semibold text-base text-ink leading-5">
            {user.name}
          </span>
          <span className="truncate text-muted text-sm leading-[18px]">
            {user.email}
          </span>
        </span>
        <MembershipChips user={user} />
      </span>
      {user.banned ? (
        <span className="shrink-0 rounded-full bg-orange-soft px-[10px] py-1 font-semibold text-[13px] text-orange-deep leading-4">
          Banned
        </span>
      ) : null}
    </Link>
  );
}

function UserListRow({
  user,
  search,
}: {
  user: PlatformUser;
  search: UsersSearch;
}) {
  return (
    <ListRow
      className="items-start"
      render={
        <Link search={{ q: search.q, user: user.id }} to="/owner/users" />
      }
    >
      <UserAvatar size={44} tone="fog" user={user} />
      <ListRowContent className="gap-[6px]">
        <span className="flex flex-col gap-[2px]">
          <ListRowTitle>{user.name}</ListRowTitle>
          <ListRowDescription className="truncate">
            {user.banned ? (
              <span className="font-semibold text-orange-deep">Banned · </span>
            ) : null}
            {user.email}
          </ListRowDescription>
        </span>
        <MembershipChips user={user} />
      </ListRowContent>
      <ListRowChevron className="mt-3" />
    </ListRow>
  );
}

function lastSeenText(
  updatedAt: string | undefined,
  timeZone: string
): string | null {
  if (!updatedAt) {
    return null;
  }
  const day = formatRelativeDay(updatedAt, timeZone, appNow());
  const lowered =
    day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return `last seen ${lowered} ${formatTime(updatedAt, timeZone)}`;
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "alert";
}) {
  return (
    <div className="flex justify-between gap-4 border-line border-b py-[11px] last:border-b-0">
      <dt className="text-muted text-sm leading-[18px]">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium text-ink text-sm leading-[18px]",
          tone === "alert" && "font-semibold text-orange-deep"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function devicesText(count: number | undefined): string {
  if (count === undefined) {
    return "…";
  }
  return count === 0 ? "No devices" : plural(count, "device", "devices");
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width="16"
    >
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

/** Right-hand panel from "[Owner] Find and support a user"; the whole page on phones. */
function UserPanel({
  user,
  className,
  onBan,
}: {
  user: PlatformUser;
  className?: string;
  onBan: () => void;
}) {
  const navigate = useNavigate();
  // Only "last seen" and the device count: left out if it fails.
  const { data: sessions } = useQuery({
    ...userSessionsQueryOptions(user.id),
    throwOnError: false,
  });
  const revoke = useRevokeUserSessions();
  const impersonate = useImpersonateUser();
  const forgetOwnerQueries = useForgetOwnerQueries();
  const timeZone = user.memberships[0]?.timezone ?? FALLBACK_TIMEZONE;
  const first = firstName(user.name);
  const lastSeen = lastSeenText(sessions?.[0]?.updatedAt, timeZone);
  const deviceCount = sessions?.length ?? 0;

  const viewAs = useCallback(() => {
    impersonate.mutate(
      { userId: user.id },
      {
        // Preview shows the banner from `?impersonating=1`; for real the session says so.
        onSuccess: async ({ home }) => {
          await navigate({
            href: home === "/app" ? home : `${home}?impersonating=1`,
          });
          forgetOwnerQueries();
        },
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn't start viewing as them. Try again.")
          ),
      }
    );
  }, [impersonate, navigate, user.id, forgetOwnerQueries]);

  const signOutEverywhere = useCallback(() => {
    revoke.mutate(
      { userId: user.id },
      {
        onSuccess: ({ revoked }) =>
          toast.success(
            `${first} is signed out on ${plural(revoked, "device", "devices")}`
          ),
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn't sign them out. Try again.")
          ),
      }
    );
  }, [revoke, user.id, first]);

  return (
    <section
      aria-labelledby="user-panel-title"
      className={cn(
        "flex flex-col gap-[18px] rounded-[20px] bg-fog p-6 max-md:p-5",
        className
      )}
    >
      <div className="flex items-center gap-[14px]">
        <UserAvatar size={52} tone="white" user={user} />
        <div className="flex min-w-0 flex-col">
          <h2
            className="font-semibold text-ink text-lg leading-[22px]"
            id="user-panel-title"
          >
            {user.name}
          </h2>
          <p className="text-muted text-sm leading-[18px]">
            Joined {formatJoined(user.createdAt, timeZone)}
            {lastSeen ? ` · ${lastSeen}` : ""}
          </p>
        </div>
      </div>
      <dl className="flex flex-col rounded-[14px] bg-white px-4 py-1">
        <DetailRow
          label="Account"
          tone={user.banned ? "alert" : undefined}
          value={user.banned ? "Banned" : "Active"}
        />
        {user.banned && user.banReason ? (
          <DetailRow label="Reason" value={user.banReason} />
        ) : null}
        <DetailRow label="Signed in on" value={devicesText(sessions?.length)} />
        <DetailRow label="Role" value={roleSummary(user)} />
      </dl>
      <div className="flex flex-col gap-2">
        <Button
          disabled={user.banned || impersonate.isPending}
          onClick={viewAs}
        >
          <EyeIcon />
          View as {first}
        </Button>
        <Button
          disabled={deviceCount === 0 || revoke.isPending}
          onClick={signOutEverywhere}
          variant="outline"
        >
          Sign out everywhere
        </Button>
        <Button
          className={cn(!user.banned && "text-orange-deep hover:bg-white")}
          onClick={onBan}
          variant="ghost"
        >
          {user.banned ? "Unban account…" : "Ban account…"}
        </Button>
      </div>
      <p className="text-[13px] text-muted leading-body">
        Every action here is written to the platform audit log with your name.
      </p>
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <Skeleton className="h-[100px] rounded-md" />
      <Skeleton className="h-[100px] rounded-md" />
    </div>
  );
}

/** "[Owner] Find and support a user" (PA-2). State lives in the URL: q, user, dialog. */
export function UsersScreen({ search }: { search: UsersSearch }) {
  const navigate = useNavigate({ from: "/owner/users" });
  const q = search.q ?? "";
  const { data } = useQuery(platformUsersQueryOptions(q));
  // Only the "N people across all academies" line: left out if it fails.
  const { data: everyone } = useQuery({
    ...platformUsersQueryOptions(""),
    throwOnError: false,
  });
  const results = data?.users;
  const selected =
    results?.find((u) => u.id === search.user) ??
    (search.user ? undefined : results?.[0]);
  const isPhoneDetail = Boolean(search.user);

  const setQuery = useCallback(
    (value: string) =>
      navigate({
        search: { q: value || undefined },
        replace: true,
      }),
    [navigate]
  );
  const openBan = useCallback(
    () => navigate({ search: (prev) => ({ ...prev, dialog: "ban" as const }) }),
    [navigate]
  );
  const setBanOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        navigate({
          search: (prev) => ({ ...prev, dialog: undefined }),
          replace: true,
        });
      }
    },
    [navigate]
  );

  return (
    <>
      <PageHeader className={cn(isPhoneDetail && "max-md:hidden")}>
        <PageHeading>
          <Eyebrow>
            {everyone
              ? `${plural(everyone.total, "person", "people")} across all academies`
              : "People across all academies"}
          </Eyebrow>
          <PageTitle>Users</PageTitle>
        </PageHeading>
      </PageHeader>

      {isPhoneDetail ? (
        <Link
          className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label md:hidden"
          search={{ q: search.q }}
          to="/owner/users"
        >
          ← Users
        </Link>
      ) : null}

      <search className={cn("w-full", isPhoneDetail && "max-md:hidden")}>
        <SearchField
          onChange={setQuery}
          resultCount={results ? results.length : null}
          value={q}
        />
      </search>

      <div className="flex w-full items-start gap-4">
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            isPhoneDetail && "max-md:hidden"
          )}
        >
          {results === undefined ? <ResultsSkeleton /> : null}
          {results && results.length === 0 ? (
            <Empty className="rounded-md border border-line border-dashed">
              <EmptyHeader>
                <EmptyTitle>No one matches “{q}”</EmptyTitle>
                <EmptyDescription>
                  Check the spelling, or search by email instead.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {results && results.length > 0 ? (
            <>
              <ul
                aria-label="Results"
                className="flex flex-col gap-2 max-md:hidden"
              >
                {results.map((user) => (
                  <li key={user.id}>
                    <UserCard
                      search={search}
                      selected={user.id === selected?.id}
                      user={user}
                    />
                  </li>
                ))}
              </ul>
              <List aria-label="Results" className="md:hidden">
                {results.map((user) => (
                  <UserListRow key={user.id} search={search} user={user} />
                ))}
              </List>
            </>
          ) : null}
        </div>
        {selected ? (
          <UserPanel
            className={cn(
              "w-[440px] shrink-0 max-md:w-full max-lg:w-[360px]",
              !isPhoneDetail && "max-md:hidden"
            )}
            onBan={openBan}
            user={selected}
          />
        ) : null}
      </div>

      <BanDialog
        onOpenChange={setBanOpen}
        open={search.dialog === "ban"}
        user={selected}
      />
    </>
  );
}
