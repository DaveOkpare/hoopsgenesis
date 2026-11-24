import { Button } from "@hoops-genesis/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, useCallback } from "react";

import { OwnerPhoneBar } from "@/components/owner/owner-phone-bar";
import {
  DEFAULT_PER_PAGE,
  Pager,
  type PerPage,
  ShowMore,
} from "@/components/owner/pager";
import { platformAcademiesQueryOptions } from "@/features/owner-academies/queries";
import { BanDialog } from "@/features/owner-users/ban-dialog";
import {
  type PlatformUser,
  platformUsersQueryOptions,
  userSessionsQueryOptions,
} from "@/features/owner-users/queries";
import {
  ACCOUNT_ACTIONS_NOTE,
  DetailRow,
  devicesText,
  EyeIcon,
  FALLBACK_TIMEZONE,
  formatJoined,
  lastSeenText,
  MembershipChips,
  plural,
  roleSummary,
  UserAvatar,
  useSignOutEverywhere,
} from "@/features/owner-users/user-parts";
import { useViewAs } from "@/features/owner-users/view-as";
import { firstName } from "@/lib/format";

export interface UsersSearch {
  dialog?: "ban";
  page?: number;
  per?: PerPage;
  q?: string;
  user?: string;
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
    <label className="flex w-full cursor-text items-center gap-[10px] rounded-md border-2 border-ink bg-white px-5 py-4 max-md:rounded-full max-md:border max-md:border-line max-md:px-4 max-md:py-[11px] max-md:focus-within:border-ink">
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
          className="w-full min-w-0 bg-transparent text-[17px] text-ink leading-[22px] outline-none placeholder:text-muted max-md:text-[15px] max-md:leading-5 [&::-webkit-search-cancel-button]:hidden"
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
            <span className="invisible text-[17px] leading-[22px] max-md:text-[15px]">
              {value}
            </span>
            <span className="pl-2 text-[15px] text-muted leading-[18px] max-md:text-[13px]">
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

/** Desktop card: selects the person for the side panel. Tablet: opens their page. */
function UserCard({
  user,
  selected,
  search,
  opensPage,
}: {
  user: PlatformUser;
  selected: boolean;
  search: UsersSearch;
  opensPage: boolean;
}) {
  const className = cn(
    "flex items-center gap-[14px] rounded-md p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
    selected
      ? "border-2 border-ink p-[15px]"
      : "border border-line hover:border-stone hover:bg-fog/50"
  );
  const body = (
    <>
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
    </>
  );
  if (opensPage) {
    return (
      <Link
        className={className}
        params={{ userId: user.id }}
        to="/owner/users/$userId"
      >
        {body}
      </Link>
    );
  }
  return (
    <Link
      aria-current={selected ? "true" : undefined}
      className={className}
      replace
      search={{ ...search, user: user.id, dialog: undefined }}
      to="/owner/users"
    >
      {body}
    </Link>
  );
}

function UserPhoneRow({ user }: { user: PlatformUser }) {
  return (
    <li>
      <Link
        className="flex items-start gap-3 border-line border-b py-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset"
        params={{ userId: user.id }}
        to="/owner/users/$userId"
      >
        <UserAvatar size={44} tone="fog" user={user} />
        <span className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <span className="flex flex-col gap-[2px]">
            <span className="truncate font-semibold text-[15px] text-ink leading-5">
              {user.name}
            </span>
            <span className="truncate text-muted text-sm leading-[18px]">
              {user.banned ? (
                <span className="font-semibold text-orange-deep">
                  Banned ·{" "}
                </span>
              ) : null}
              {user.email}
            </span>
          </span>
          <MembershipChips user={user} />
        </span>
        <svg
          aria-hidden="true"
          className="mt-3 shrink-0"
          height="16"
          viewBox="0 0 14 14"
          width="16"
        >
          <path
            d="M5.5 3l4 4-4 4"
            fill="none"
            stroke="#6B6B6B"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      </Link>
    </li>
  );
}

/** Right-hand panel from "[Owner] Find and support a user" (desktop only). */
function UserPanel({
  user,
  className,
  onBan,
}: {
  user: PlatformUser;
  className?: string;
  onBan: () => void;
}) {
  // Only "last seen" and the device count: left out if it fails.
  const { data: sessions } = useQuery({
    ...userSessionsQueryOptions(user.id),
    throwOnError: false,
  });
  const { viewAs, isPending: viewAsPending } = useViewAs();
  const { signOut, isPending: signOutPending } = useSignOutEverywhere(user);
  const timeZone = user.memberships[0]?.timezone ?? FALLBACK_TIMEZONE;
  const first = firstName(user.name);
  const lastSeen = lastSeenText(sessions?.[0]?.updatedAt, timeZone);
  const deviceCount = sessions?.length ?? 0;
  const handleViewAs = useCallback(() => viewAs(user.id), [viewAs, user.id]);

  return (
    <section
      aria-labelledby="user-panel-title"
      className={cn(
        "flex flex-col gap-[18px] rounded-[20px] bg-fog p-6",
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
            <Link
              className="underline-offset-[3px] outline-none hover:underline focus-visible:underline"
              params={{ userId: user.id }}
              to="/owner/users/$userId"
            >
              {user.name}
            </Link>
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
          <DetailRow label="Ban reason" value={user.banReason} />
        ) : null}
        <DetailRow label="Signed in on" value={devicesText(sessions?.length)} />
        <DetailRow label="Role" value={roleSummary(user)} />
      </dl>
      <div className="flex flex-col gap-2">
        <Button disabled={user.banned || viewAsPending} onClick={handleViewAs}>
          <EyeIcon />
          View as {first}
        </Button>
        <Button
          disabled={deviceCount === 0 || signOutPending}
          onClick={signOut}
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
        {ACCOUNT_ACTIONS_NOTE}{" "}
        <Link
          className="font-semibold text-ink underline underline-offset-[3px]"
          params={{ userId: user.id }}
          to="/owner/users/$userId"
        >
          Open their page
        </Link>
      </p>
    </section>
  );
}

function UsersHeader({
  total,
  academyCount,
}: {
  total: number | undefined;
  academyCount: number | undefined;
}) {
  const people = total === undefined ? null : plural(total, "person", "people");
  const academies =
    academyCount === undefined
      ? ""
      : ` · ${plural(academyCount, "academy", "academies")}`;
  return (
    <>
      <OwnerPhoneBar />
      <PageHeader>
        <PageHeading>
          <Eyebrow className="max-md:hidden">
            {people
              ? `${people} across all academies`
              : "People across all academies"}
          </Eyebrow>
          <Eyebrow className="md:hidden">
            {people ?? "People"}
            {academies}
          </Eyebrow>
          <PageTitle>Users</PageTitle>
        </PageHeading>
      </PageHeader>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2" role="status">
      <span className="sr-only">Loading people</span>
      <Skeleton className="h-[100px] rounded-md" />
      <Skeleton className="h-[100px] rounded-md" />
      <Skeleton className="h-[100px] rounded-md" />
    </div>
  );
}

/**
 * "[Owner] Find and support a user" (36U-0, PA-2), phone E62-0. State lives in the
 * URL: q, page, per, user (desktop panel), dialog. Desktop pages with numbers;
 * tablet and phone grow the list with "Show 25 more" (pages 1..page, each its own
 * cached query) and open a person on their own page.
 */
export function UsersScreen({ search }: { search: UsersSearch }) {
  const navigate = useNavigate({ from: "/owner/users/" });
  const q = search.q ?? "";
  const perPage = search.per ?? DEFAULT_PER_PAGE;
  const page = search.page ?? 1;
  const current = useQuery(platformUsersQueryOptions(q, page, perPage));
  // Tablet and phone show every page up to this one.
  const pages = useQueries({
    queries: Array.from({ length: page }, (_, index) =>
      platformUsersQueryOptions(q, index + 1, perPage)
    ),
  });
  // Only the phone eyebrow's academy count: left out if it fails.
  const academies = useQuery({
    ...platformAcademiesQueryOptions(),
    throwOnError: false,
  });
  const { data } = current;
  const results = data?.users;
  const grown = pages.flatMap((p) => p.data?.users ?? []);
  const selected =
    results?.find((u) => u.id === search.user) ??
    (search.user ? undefined : results?.[0]);
  const matched = data?.matched ?? 0;
  const pageCount = Math.max(1, Math.ceil(matched / perPage));

  const setQuery = useCallback(
    (value: string) =>
      navigate({
        search: (prev) => ({
          ...prev,
          q: value || undefined,
          page: undefined,
          user: undefined,
        }),
        replace: true,
      }),
    [navigate]
  );
  const setPage = useCallback(
    (next: number) =>
      navigate({
        search: (prev) => ({
          ...prev,
          page: next > 1 ? next : undefined,
          user: undefined,
        }),
        replace: true,
      }),
    [navigate]
  );
  const setPerPage = useCallback(
    (per: PerPage) =>
      navigate({
        search: (prev) => ({
          ...prev,
          per: per === DEFAULT_PER_PAGE ? undefined : per,
          page: undefined,
          user: undefined,
        }),
        replace: true,
      }),
    [navigate]
  );
  const showMore = useCallback(
    () =>
      navigate({
        search: (prev) => ({ ...prev, page: page + 1 }),
        replace: true,
        resetScroll: false,
      }),
    [navigate, page]
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
      <UsersHeader academyCount={academies.data?.length} total={data?.total} />

      <search className="flex w-full flex-col gap-[10px]">
        <SearchField
          onChange={setQuery}
          resultCount={data ? matched : null}
          value={q}
        />
        {q ? null : (
          <p className="px-1 text-[13px] text-muted leading-4 md:hidden">
            Everyone, by name.
          </p>
        )}
      </search>

      <div className="flex w-full items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          {results === undefined ? <ResultsSkeleton /> : null}
          {results && results.length === 0 ? (
            <Empty className="rounded-md border border-line border-dashed">
              <EmptyHeader>
                <EmptyTitle>
                  {q ? `No one matches “${q}”` : "No one here yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {q
                    ? "Check the spelling, or search by email instead."
                    : "People appear here once they sign up."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {results && results.length > 0 ? (
            <>
              <ul
                aria-label="Results"
                className="flex flex-col gap-2 max-lg:hidden"
              >
                {results.map((user) => (
                  <li key={user.id}>
                    <UserCard
                      opensPage={false}
                      search={search}
                      selected={user.id === selected?.id}
                      user={user}
                    />
                  </li>
                ))}
              </ul>
              <Pager
                className="max-lg:hidden"
                hasNext={page < pageCount}
                onPage={setPage}
                onPerPage={setPerPage}
                page={page}
                perPage={perPage}
                shown={results.length}
                suffix={q ? ` for “${q}”` : null}
                total={matched}
              />
              <ul
                aria-label="Results"
                className="flex flex-col gap-2 max-md:hidden lg:hidden"
              >
                {grown.map((user) => (
                  <li key={user.id}>
                    <UserCard
                      opensPage
                      search={search}
                      selected={false}
                      user={user}
                    />
                  </li>
                ))}
              </ul>
              <ul aria-label="Results" className="flex flex-col md:hidden">
                {grown.map((user) => (
                  <UserPhoneRow key={user.id} user={user} />
                ))}
              </ul>
              <ShowMore
                className="lg:hidden"
                hasMore={grown.length < matched}
                onMore={showMore}
                pending={pages.some((p) => p.isFetching)}
                shown={grown.length}
                step={perPage}
                total={matched}
              />
            </>
          ) : null}
        </div>
        {selected ? (
          <UserPanel
            className="w-[440px] shrink-0 max-lg:hidden"
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
