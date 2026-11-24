import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { CountryDot, FilterChip } from "@hoops-genesis/ui/components/chip";
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
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ChangeEvent, useCallback } from "react";

import { QueryBoundary } from "@/components/error-state";
import { PlusIcon } from "@/components/icons";
import { OwnerPhoneBar } from "@/components/owner/owner-phone-bar";
import {
  DEFAULT_PER_PAGE,
  Pager,
  type PerPage,
  ShowMore,
} from "@/components/owner/pager";
import { AcademyDetail } from "@/features/owner-academies/academy-detail";
import { AcademyDetailPage } from "@/features/owner-academies/academy-detail-page";
import {
  type AcademySort,
  applyConsoleSearch,
  COUNTRY_LABEL,
  type ConsoleSearch,
  type CountryFilter,
  countriesIn,
  knownCountry,
  placeLabel,
  SORT_OPTIONS,
} from "@/features/owner-academies/console-search";
import {
  academyRoleCountsQueryOptions,
  type PlatformAcademy,
  platformAcademiesQueryOptions,
} from "@/features/owner-academies/queries";
import type { Id } from "@/features/types";

const ALL = "all";

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function subtitle(row: PlatformAcademy): string {
  const place = placeLabel(row.academy.timezone);
  if (row.adminName) {
    return `${place} · Admin ${row.adminName}`;
  }
  return row.pendingAdminEmail
    ? `${place} · Admin invited`
    : `${place} · No admin yet`;
}

function Dot({
  timeZone,
  className,
}: {
  timeZone: string;
  className?: string;
}) {
  const country = knownCountry(timeZone);
  return country ? (
    <CountryDot className={className} country={country} />
  ) : (
    <span
      aria-hidden="true"
      className={cn("size-[7px] shrink-0 rounded-full bg-stone", className)}
    />
  );
}

function AcademyTile({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-[12px] font-display text-lg leading-[22px]",
        selected ? "bg-orange text-ink" : "bg-ink text-white"
      )}
    >
      HG
    </span>
  );
}

/** Coaches and students are not in the list endpoint: one members call per row. */
function useRoleCounts(academyId: Id) {
  const { data } = useQuery({
    ...academyRoleCountsQueryOptions(academyId),
    throwOnError: false,
  });
  return data;
}

function Chip({
  count,
  one,
  many,
  width,
  alert = false,
}: {
  count: number | undefined;
  one: string;
  many: string;
  width: string;
  alert?: boolean;
}) {
  if (count === undefined) {
    return <Skeleton className={cn("h-[26px] shrink-0 rounded-full", width)} />;
  }
  const label = count === 1 ? one : many;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center gap-1 rounded-full py-[5px] text-[13px] leading-4",
        width,
        alert ? "bg-orange-soft text-orange-deep" : "bg-fog text-ink-soft"
      )}
    >
      <span className={cn("font-semibold", alert ? "" : "text-ink")}>
        {count}
      </span>
      {label}
    </span>
  );
}

function RoleChips({ row }: { row: PlatformAcademy }) {
  const counts = useRoleCounts(row.academy.id);
  const admins = row.admins.length;
  return (
    <span className="flex shrink-0 justify-end gap-[6px]">
      <Chip
        alert={admins === 0}
        count={admins}
        many="admins"
        one="admin"
        width="w-[76px]"
      />
      <Chip
        count={counts?.coaches}
        many="coaches"
        one="coach"
        width="w-[90px]"
      />
      <Chip
        count={counts?.students}
        many="students"
        one="student"
        width="w-[108px]"
      />
    </span>
  );
}

/** Desktop and tablet card: tile, name + place + admin, role chips. */
function AcademyCard({
  row,
  selected,
  search,
}: {
  row: PlatformAcademy;
  selected: boolean;
  search: ConsoleSearch;
}) {
  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex items-center gap-[14px] rounded-md p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        selected
          ? "border-2 border-ink p-[15px] max-lg:border max-lg:border-line max-lg:p-4"
          : "border border-line hover:border-stone hover:bg-fog/50"
      )}
      params={{ academyId: row.academy.id }}
      search={search}
      to="/owner/academies/$academyId"
    >
      <AcademyTile selected={selected} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate font-semibold text-base text-ink leading-5">
          {row.academy.name}
        </span>
        <span className="flex items-center gap-[6px]">
          <Dot timeZone={row.academy.timezone} />
          <span className="truncate text-muted text-sm leading-[18px]">
            {subtitle(row)}
          </span>
        </span>
      </span>
      <RoleChips row={row} />
    </Link>
  );
}

function RoleLine({ row }: { row: PlatformAcademy }) {
  const counts = useRoleCounts(row.academy.id);
  const admins = row.admins.length;
  return (
    <span className="truncate text-[13px] text-muted leading-4">
      <span
        className={cn(
          "font-semibold",
          admins === 0 ? "text-orange-deep" : "text-ink"
        )}
      >
        {admins}
      </span>{" "}
      {admins === 1 ? "admin" : "admins"}
      {counts ? (
        <>
          {" · "}
          <span className="font-semibold text-ink">{counts.coaches}</span>{" "}
          {counts.coaches === 1 ? "coach" : "coaches"}
          {" · "}
          <span className="font-semibold text-ink">{counts.students}</span>{" "}
          {counts.students === 1 ? "student" : "students"}
        </>
      ) : null}
    </span>
  );
}

/** Phone row (DKC-0): ink tile with an orange mark, name, role counts. */
function AcademyPhoneRow({
  row,
  search,
}: {
  row: PlatformAcademy;
  search: ConsoleSearch;
}) {
  return (
    <li>
      <Link
        className="flex items-center gap-3 border-line border-b py-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset"
        params={{ academyId: row.academy.id }}
        search={search}
        to="/owner/academies/$academyId"
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-ink font-display text-orange text-sm leading-[18px]"
        >
          HG
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate font-semibold text-[15px] text-ink leading-5">
            {row.academy.name}
          </span>
          <span className="flex min-w-0 items-center gap-[6px]">
            <Dot timeZone={row.academy.timezone} />
            <RoleLine row={row} />
          </span>
        </span>
      </Link>
    </li>
  );
}

function PillSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const handleChange = useCallback(
    (next: unknown) => {
      const match = options.find((o) => o.value === next);
      if (match) {
        onChange(match.value);
      }
    },
    [onChange, options]
  );
  return (
    <Select items={options} onValueChange={handleChange} value={value}>
      <SelectTrigger
        aria-label={label}
        className="shrink-0 py-[10px]"
        variant="pill"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CountryChip({
  country,
  selected,
  onSelect,
}: {
  country: CountryFilter | typeof ALL;
  selected: boolean;
  onSelect: (country: CountryFilter | typeof ALL) => void;
}) {
  const handleClick = useCallback(() => onSelect(country), [country, onSelect]);
  const dot = country === ALL || country === "other" ? null : country;
  return (
    <FilterChip
      className="gap-[5px]"
      onClick={handleClick}
      selected={selected}
      size="sm"
    >
      {dot ? <CountryDot country={dot} /> : null}
      {country === ALL ? "All" : COUNTRY_LABEL[country]}
    </FilterChip>
  );
}

export type ConsoleSearchChange = (
  patch: Partial<ConsoleSearch>,
  options?: { resetPage?: boolean }
) => void;

function Toolbar({
  rows,
  search,
  onSearchChange,
}: {
  rows: PlatformAcademy[];
  search: ConsoleSearch;
  onSearchChange: ConsoleSearchChange;
}) {
  const countries = countriesIn(rows);
  const countryOptions = [
    { value: ALL, label: "All countries" },
    ...countries.map((c) => ({ value: c, label: COUNTRY_LABEL[c] })),
  ];
  const handleQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSearchChange({ q: event.target.value || undefined }),
    [onSearchChange]
  );
  const handleCountry = useCallback(
    (value: string) =>
      onSearchChange({
        country: value === ALL ? undefined : (value as CountryFilter),
      }),
    [onSearchChange]
  );
  const handleSort = useCallback(
    (value: AcademySort) =>
      onSearchChange({ sort: value === "newest" ? undefined : value }),
    [onSearchChange]
  );
  return (
    <>
      <search className="flex w-full items-center gap-2 max-md:hidden">
        <SearchInput
          aria-label="Search academies"
          className="w-[360px] shrink-0 max-lg:w-auto max-lg:flex-1"
          onChange={handleQuery}
          placeholder="Search academy, city or admin"
          value={search.q ?? ""}
        />
        <PillSelect
          label="Country"
          onChange={handleCountry}
          options={countryOptions}
          value={search.country ?? ALL}
        />
        <span className="flex-1 max-lg:hidden" />
        <PillSelect
          label="Sort"
          onChange={handleSort}
          options={SORT_OPTIONS}
          value={search.sort ?? "newest"}
        />
      </search>
      <search className="flex flex-col gap-[10px] md:hidden">
        <SearchInput
          aria-label="Search academies"
          className="gap-[10px] px-4 py-[11px] text-[15px] leading-5"
          onChange={handleQuery}
          placeholder="Search academies"
          value={search.q ?? ""}
        />
        <div className="-mx-5 flex gap-[6px] overflow-x-auto px-5">
          <CountryChip
            country={ALL}
            onSelect={handleCountry}
            selected={!search.country}
          />
          {countries.map((country) => (
            <CountryChip
              country={country}
              key={country}
              onSelect={handleCountry}
              selected={search.country === country}
            />
          ))}
        </div>
      </search>
    </>
  );
}

function NoAcademies({ filtered }: { filtered: boolean }) {
  return (
    <Empty className="rounded-md border border-line border-dashed">
      <EmptyHeader>
        <EmptyTitle>
          {filtered ? "No academy matches" : "No academies yet"}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Check the spelling, or search by city or admin name instead."
            : "Create the first academy and invite its admin."}
        </EmptyDescription>
      </EmptyHeader>
      {filtered ? null : (
        <Link className={buttonVariants()} to="/owner/academies/new">
          <PlusIcon />
          Create academy
        </Link>
      )}
    </Empty>
  );
}

/**
 * "[Owner · Web] Academies console, search and pages" (ET2-0), tablet CL4-0, phone
 * DKC-0. Desktop (lg+): cards, numbered pages and the selected academy's panel
 * (`/owner/academies/$academyId` selects one; `/owner` the first on the page).
 * Tablet and phone: the list with "Show 25 more"; an academy opens its own page
 * (tablet CQ5-0, phone E51-0).
 */
export function AcademyConsole({
  academyId,
  search,
  onSearchChange,
}: {
  academyId?: Id;
  search: ConsoleSearch;
  onSearchChange: ConsoleSearchChange;
}) {
  const { data: rows } = useSuspenseQuery(platformAcademiesQueryOptions());
  const perPage: PerPage = search.per ?? DEFAULT_PER_PAGE;
  const matching = applyConsoleSearch(rows, search);
  const pageCount = Math.max(1, Math.ceil(matching.length / perPage));
  const page = Math.min(search.page ?? 1, pageCount);
  const pageRows = matching.slice((page - 1) * perPage, page * perPage);
  const shownRows = matching.slice(0, page * perPage);
  const selectedId = academyId ?? pageRows[0]?.academy.id;
  const isDetailPage = Boolean(academyId);
  const countries = countriesIn(rows).length;
  const filtered = Boolean(search.q || search.country);

  const setPage = useCallback(
    (next: number) =>
      onSearchChange(
        { page: next > 1 ? next : undefined },
        { resetPage: false }
      ),
    [onSearchChange]
  );
  const setPerPage = useCallback(
    (per: PerPage) =>
      onSearchChange({ per: per === DEFAULT_PER_PAGE ? undefined : per }),
    [onSearchChange]
  );
  const showMore = useCallback(() => setPage(page + 1), [setPage, page]);

  return (
    <>
      {isDetailPage ? (
        <AcademyDetailPage
          academyId={academyId ?? ""}
          className="lg:hidden"
          search={search}
        />
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-8 max-md:gap-[18px] max-lg:gap-5",
          isDetailPage && "max-lg:hidden"
        )}
      >
        <OwnerPhoneBar />
        <PageHeader>
          <PageHeading>
            <Eyebrow>
              {plural(rows.length, "academy", "academies")} ·{" "}
              {plural(countries, "country", "countries")}
            </Eyebrow>
            <PageTitle>Academies</PageTitle>
          </PageHeading>
          <PageActions className="max-md:hidden">
            <Link className={buttonVariants()} to="/owner/academies/new">
              <PlusIcon />
              Create academy
            </Link>
          </PageActions>
        </PageHeader>

        <div className="flex flex-col gap-8 max-md:gap-[18px] max-lg:gap-5">
          <Toolbar
            onSearchChange={onSearchChange}
            rows={rows}
            search={search}
          />

          {matching.length === 0 ? (
            <NoAcademies filtered={filtered} />
          ) : (
            <div className="flex w-full items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Desktop: one page at a time. */}
                <nav
                  aria-label="Academies"
                  className="flex flex-col gap-2 max-lg:hidden"
                >
                  {pageRows.map((row) => (
                    <AcademyCard
                      key={row.academy.id}
                      row={row}
                      search={search}
                      selected={row.academy.id === selectedId}
                    />
                  ))}
                </nav>
                <Pager
                  className="max-lg:hidden"
                  hasNext={page < pageCount}
                  onPage={setPage}
                  onPerPage={setPerPage}
                  page={page}
                  perPage={perPage}
                  shown={pageRows.length}
                  total={matching.length}
                />
                {/* Tablet: cards, growing with "Show more". */}
                <nav
                  aria-label="Academies"
                  className="flex flex-col gap-2 max-md:hidden lg:hidden"
                >
                  {shownRows.map((row) => (
                    <AcademyCard
                      key={row.academy.id}
                      row={row}
                      search={search}
                      selected={false}
                    />
                  ))}
                </nav>
                {/* Phone: rows. */}
                <nav aria-label="Academies" className="md:hidden">
                  <ul className="flex flex-col">
                    {shownRows.map((row) => (
                      <AcademyPhoneRow
                        key={row.academy.id}
                        row={row}
                        search={search}
                      />
                    ))}
                  </ul>
                </nav>
                <ShowMore
                  className="pt-6 max-md:pt-[14px] lg:hidden"
                  hasMore={shownRows.length < matching.length}
                  onMore={showMore}
                  shown={shownRows.length}
                  step={perPage}
                  total={matching.length}
                />
              </div>
              {selectedId ? (
                <QueryBoundary
                  className="w-[440px] shrink-0 self-start max-lg:hidden"
                  resetKey={selectedId}
                  what="this academy"
                >
                  <AcademyDetail
                    academyId={selectedId}
                    className="w-[440px] shrink-0 max-lg:hidden"
                  />
                </QueryBoundary>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
