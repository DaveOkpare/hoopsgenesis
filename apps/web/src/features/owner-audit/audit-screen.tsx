import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPrefix,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { OwnerPhoneBar } from "@/components/owner/owner-phone-bar";
import {
  DEFAULT_PER_PAGE,
  Pager,
  type PerPage,
  ShowMore,
} from "@/components/owner/pager";
import { platformAcademiesQueryOptions } from "@/features/owner-academies/queries";
import {
  describeOwnerAudit,
  ownerAuditKind,
} from "@/features/owner-audit/describe";
import {
  type OwnerAuditDate,
  type OwnerAuditFilters,
  type OwnerAuditItem,
  type OwnerAuditType,
  ownerAuditPageQueryOptions,
  personNameQueryOptions,
  recentActorsQueryOptions,
} from "@/features/owner-audit/queries";
import { ZoneDot } from "@/features/owner-users/user-parts";
import type { Id } from "@/features/types";
import {
  formatDayMonth,
  formatLongDate,
  formatRelativeDay,
  formatTime,
  initials,
} from "@/lib/format";
import { appNow } from "@/lib/preview";

export interface OwnerAuditSearch {
  academy?: string;
  date?: OwnerAuditDate;
  page?: number;
  per?: PerPage;
  person?: string;
  type?: OwnerAuditType;
}

export const TYPE_OPTIONS: { value: OwnerAuditType; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "fee", label: "Payments" },
  { value: "attendance", label: "Attendance" },
  { value: "record", label: "Records" },
  { value: "roster", label: "Team rosters" },
  { value: "member", label: "Members and admins" },
  { value: "join_code", label: "Join codes" },
  { value: "calendar", label: "Calendar" },
  { value: "academy", label: "Academies" },
  { value: "qr", label: "QR code" },
  { value: "support", label: "Viewing as someone" },
];

export const DATE_OPTIONS: { value: OwnerAuditDate; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const ALL = "all";
const SKELETON_ROWS = ["a", "b", "c", "d", "e"];
const MS_PER_DAY = 86_400_000;
const DAYS_IN_WEEK = 7;

/**
 * Rows mix academies in different zones and platform rows that have none, so every
 * time on the page is the viewer's own (undefined = the browser's zone), as stated
 * under the title. That keeps the newest-first list reading in order.
 */
const VIEWER_TIME_ZONE = undefined;

/** "Europe/London": the zone the page's times are in. */
function viewerZoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** "Today, 09:14", "Fri, 14:20", "16 Nov, 08:11", in the viewer's time zone. */
function whenLabel(value: string): string {
  const now = appNow();
  const day = formatRelativeDay(value, VIEWER_TIME_ZONE, now);
  const old = (now.getTime() - Date.parse(value)) / MS_PER_DAY >= DAYS_IN_WEEK;
  return `${old ? formatDayMonth(value, VIEWER_TIME_ZONE) : day}, ${formatTime(value, VIEWER_TIME_ZONE)}`;
}

function FilterPill<T extends string>({
  prefix,
  value,
  options,
  onChange,
  className,
}: {
  prefix?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
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
        aria-label={prefix ?? options[0]?.label}
        className={cn("shrink-0 py-[10px]", className)}
        variant="pill"
      >
        {prefix ? <SelectPrefix>{prefix}</SelectPrefix> : null}
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

/* ---------- Before / after ---------- */

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function Diff({
  values,
  other,
  highlightChanges,
}: {
  values: Record<string, unknown> | null;
  other: Record<string, unknown> | null;
  highlightChanges: boolean;
}) {
  const keys = [
    ...new Set([...Object.keys(values ?? {}), ...Object.keys(other ?? {})]),
  ];
  if (keys.length === 0) {
    return <p className="text-muted text-sm leading-body">Nothing recorded</p>;
  }
  const width = Math.max(...keys.map((k) => k.length)) + 2;
  return (
    <dl className="overflow-x-auto whitespace-pre font-mono text-[13px] text-ink-soft leading-[160%]">
      {keys.map((key) => {
        const changed =
          highlightChanges &&
          formatValue(values?.[key]) !== formatValue(other?.[key]);
        return (
          <div className={cn("flex", changed && "text-orange-deep")} key={key}>
            <dt>{key.padEnd(width, " ")}</dt>
            <dd className="whitespace-pre-wrap">
              {formatValue(values?.[key])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function DetailCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 basis-0 flex-col gap-2 rounded-[12px] bg-white px-4 py-[14px] max-md:basis-auto",
        className
      )}
    >
      <p className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label">
        {title}
      </p>
      {children}
    </div>
  );
}

function EntryDetail({ entry, id }: { entry: OwnerAuditItem; id: string }) {
  return (
    <div
      className="flex gap-3 pr-3 pb-4 pl-[170px] max-md:flex-col max-md:px-0 max-lg:pl-3"
      id={id}
    >
      <DetailCard title="Before">
        <Diff
          highlightChanges={false}
          other={entry.after}
          values={entry.before}
        />
      </DetailCard>
      <DetailCard title="After">
        <Diff highlightChanges other={entry.before} values={entry.after} />
      </DetailCard>
      {entry.reason ? (
        <DetailCard className="grow-[1.2]" title="Reason">
          <p className="text-[15px] text-ink leading-body">“{entry.reason}”</p>
        </DetailCard>
      ) : null}
    </div>
  );
}

/* ---------- Rows ---------- */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <path
        d={open ? "M3 9l4-4 4 4" : "M3 5l4 4 4-4"}
        fill="none"
        stroke={open ? "#111111" : "#6B6B6B"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function KindBadge({ action }: { action: string }) {
  const kind = ownerAuditKind(action);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-[9px] py-[3px] font-bold text-[12px] uppercase leading-4 tracking-[0.04em]",
        kind.tone === "alert"
          ? "bg-orange-soft text-orange-deep"
          : "bg-fog text-ink-soft"
      )}
    >
      {kind.label}
    </span>
  );
}

/** "Sharika D.", and who was really acting when the owner was viewing as them. */
function actorText(entry: OwnerAuditItem): string {
  return entry.actor?.name ?? "System";
}

function ViaLine({ entry }: { entry: OwnerAuditItem }) {
  if (!entry.impersonatedBy) {
    return null;
  }
  return (
    <span className="block text-[13px] text-orange-deep leading-4">
      {entry.impersonatedBy.name}, viewing as
    </span>
  );
}

function EntryRow({
  entry,
  open,
  onToggle,
}: {
  entry: OwnerAuditItem;
  open: boolean;
  onToggle: (id: Id) => void;
}) {
  const handleClick = useCallback(
    () => onToggle(entry.id),
    [entry.id, onToggle]
  );
  const detailId = `owner-audit-${entry.id}`;
  const actorName = actorText(entry);
  return (
    <li className={cn("flex flex-col border-line border-b", open && "bg-fog")}>
      <button
        aria-controls={detailId}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center py-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset"
        onClick={handleClick}
        type="button"
      >
        <span className="flex w-[170px] shrink-0 flex-col pl-3 max-lg:w-[150px]">
          <span className="text-[15px] text-ink leading-[18px]">
            {whenLabel(entry.createdAt)}
          </span>
          <span className="text-[13px] text-muted leading-4">
            {formatDayMonth(entry.createdAt, VIEWER_TIME_ZONE)}
            {entry.academy ? (
              <>
                {" · "}
                <span className="font-semibold text-ink">
                  {entry.academy.shortName}
                </span>
              </>
            ) : (
              " · Platform"
            )}
          </span>
        </span>
        <span className="flex w-[220px] shrink-0 items-center gap-[10px] max-lg:w-[180px]">
          <Avatar size={30} tone={open ? "white" : "fog"}>
            <AvatarFallback>{initials(actorName)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-[15px] text-ink leading-[18px]">
              {actorName}
            </span>
            <ViaLine entry={entry} />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-[10px] max-lg:flex-col max-lg:items-start max-lg:gap-1">
          <KindBadge action={entry.action} />
          <span className="text-[15px] text-ink leading-[18px]">
            {describeOwnerAudit(entry)}
          </span>
        </span>
        <span className="flex w-10 shrink-0 justify-center">
          <Chevron open={open} />
        </span>
      </button>
      {open ? <EntryDetail entry={entry} id={detailId} /> : null}
    </li>
  );
}

/** Phone row (E84-0): time, sentence, then academy · who · reason. */
function PhoneEntry({ entry }: { entry: OwnerAuditItem }) {
  const tz = entry.academy?.timezone;
  const meta = [
    entry.academy?.shortName ?? "Platform",
    actorText(entry),
    entry.impersonatedBy ? `by ${entry.impersonatedBy.name}, viewing as` : null,
    entry.reason ? `“${entry.reason}”` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const isQr = entry.action === "academy_qr.regenerate";
  return (
    <li className="flex gap-3 border-line border-b py-[11px]">
      <span className="w-10 shrink-0 font-semibold text-[12px] text-muted leading-[18px]">
        {formatTime(entry.createdAt, VIEWER_TIME_ZONE)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-ink text-sm leading-[18px]">
          {describeOwnerAudit(entry)}
        </span>
        <span className="flex items-center gap-[5px]">
          {tz ? <ZoneDot className="size-[6px]" timeZone={tz} /> : null}
          <span
            className={cn(
              "text-[12px] leading-4",
              isQr || entry.impersonatedBy ? "text-orange-deep" : "text-muted"
            )}
          >
            {meta}
          </span>
        </span>
      </span>
    </li>
  );
}

function dayHeading(value: string): string {
  const day = formatRelativeDay(value, VIEWER_TIME_ZONE, appNow());
  if (day === "Today" || day === "Yesterday") {
    return day;
  }
  return formatLongDate(value).replace(",", "");
}

function PhoneLog({ items }: { items: OwnerAuditItem[] }) {
  const groups: { heading: string; items: OwnerAuditItem[] }[] = [];
  for (const item of items) {
    const heading = dayHeading(item.createdAt);
    const last = groups.at(-1);
    if (last && last.heading === heading) {
      last.items.push(item);
    } else {
      groups.push({ heading, items: [item] });
    }
  }
  return (
    <div className="flex flex-col md:hidden">
      {groups.map((group, index) => (
        <section aria-label={group.heading} key={group.heading}>
          <h2
            className={cn(
              "pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label",
              index > 0 && "pt-4"
            )}
          >
            {group.heading}
          </h2>
          <ul>
            {group.items.map((item) => (
              <PhoneEntry entry={item} key={item.id} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LogSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col" role="status">
      <span className="sr-only">Loading the audit log</span>
      {SKELETON_ROWS.map((key) => (
        <div
          className="flex items-center gap-6 border-line border-b py-[14px] pl-3"
          key={key}
        >
          <Skeleton className="h-8 w-[146px] max-md:w-10" />
          <Skeleton className="h-[30px] w-[180px] max-md:hidden" />
          <Skeleton className="h-5 flex-1" />
        </div>
      ))}
    </div>
  );
}

function usePersonOptions(personId: string | undefined) {
  // Only the names in the "Person" filter: left out if it fails.
  const actors = useQuery({
    ...recentActorsQueryOptions(),
    throwOnError: false,
  });
  const known = actors.data?.some((a) => a.id === personId) ?? false;
  const person = useQuery({
    ...personNameQueryOptions(personId ?? ""),
    enabled: Boolean(personId) && actors.isSuccess && !known,
    throwOnError: false,
  });
  return useMemo(() => {
    const options = [
      { value: ALL, label: "Anyone" },
      ...(actors.data ?? []).map((a) => ({ value: a.id, label: a.name })),
    ];
    if (personId && !options.some((o) => o.value === personId)) {
      options.push({ value: personId, label: person.data ?? "This person" });
    }
    return options;
  }, [actors.data, person.data, personId]);
}

export type OwnerAuditSearchChange = (
  patch: Partial<OwnerAuditSearch>,
  options?: { resetPage?: boolean }
) => void;

/**
 * "[Owner · Web] Audit log, all academies" (EWF-0), phone E84-0. Filters and page
 * live in the URL. The server pages by cursor and does not count, so the footer has
 * no "of N" and page numbers only reach one past the furthest page seen.
 */
export function OwnerAuditScreen({
  search,
  onSearchChange,
}: {
  search: OwnerAuditSearch;
  onSearchChange: OwnerAuditSearchChange;
}) {
  const queryClient = useQueryClient();
  const perPage = search.per ?? DEFAULT_PER_PAGE;
  const page = search.page ?? 1;
  const filters: OwnerAuditFilters = useMemo(
    () => ({
      academyId: search.academy ?? null,
      actorId: search.person ?? null,
      type: search.type ?? "all",
      date: search.date ?? "30d",
    }),
    [search.academy, search.person, search.type, search.date]
  );
  const current = useQuery(
    ownerAuditPageQueryOptions(queryClient, filters, perPage, page)
  );
  // Phone: every page up to this one ("Show 25 more"), each cached on its own.
  const pages = useQueries({
    queries: Array.from({ length: page }, (_, index) =>
      ownerAuditPageQueryOptions(queryClient, filters, perPage, index + 1)
    ),
  });
  // Only the "Academy" filter's names: left out if it fails.
  const academies = useQuery({
    ...platformAcademiesQueryOptions(),
    throwOnError: false,
  });
  const personOptions = usePersonOptions(search.person);
  const academyOptions = useMemo(
    () => [
      { value: ALL, label: "All academies" },
      ...(academies.data ?? [])
        .map((row) => ({ value: row.academy.id, label: row.academy.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [academies.data]
  );
  const phoneTypeOptions = useMemo(
    () =>
      TYPE_OPTIONS.map((o) =>
        o.value === "all" ? { ...o, label: "All changes" } : o
      ),
    []
  );

  /** null = the design's default: the newest entry open. */
  const [openIds, setOpenIds] = useState<Set<Id> | null>(null);
  const items = current.data?.items;
  const defaultOpen = page === 1 ? items?.[0]?.id : undefined;
  const isOpen = (id: Id) => (openIds ? openIds.has(id) : id === defaultOpen);
  const handleToggle = useCallback(
    (id: Id) => {
      setOpenIds((previous) => {
        const next = new Set(previous ?? (defaultOpen ? [defaultOpen] : []));
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [defaultOpen]
  );

  const setAcademy = useCallback(
    (value: string) =>
      onSearchChange({ academy: value === ALL ? undefined : value }),
    [onSearchChange]
  );
  const setPerson = useCallback(
    (value: string) =>
      onSearchChange({ person: value === ALL ? undefined : value }),
    [onSearchChange]
  );
  const setType = useCallback(
    (value: OwnerAuditType) =>
      onSearchChange({ type: value === "all" ? undefined : value }),
    [onSearchChange]
  );
  const setDate = useCallback(
    (value: OwnerAuditDate) =>
      onSearchChange({ date: value === "30d" ? undefined : value }),
    [onSearchChange]
  );
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

  const grown = pages.flatMap((p) => p.data?.items ?? []);
  const lastLoaded = pages.at(-1)?.data;

  let body: ReactNode;
  if (!items) {
    body = <LogSkeleton />;
  } else if (items.length === 0 && grown.length === 0) {
    body = (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>
            No changes match these filters. Try a longer date range, another
            academy or another person.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = (
      <>
        <section aria-label="Changes, newest first" className="max-md:hidden">
          <div
            aria-hidden="true"
            className="flex items-center border-line border-b py-[10px] font-semibold text-[13px] text-muted uppercase leading-4 tracking-[0.04em]"
          >
            <span className="w-[170px] shrink-0 max-lg:w-[150px]">When</span>
            <span className="w-[220px] shrink-0 max-lg:w-[180px]">Who</span>
            <span className="flex-1">What happened</span>
            <span className="w-10 shrink-0" />
          </div>
          <ul className="flex flex-col">
            {items.map((entry) => (
              <EntryRow
                entry={entry}
                key={entry.id}
                onToggle={handleToggle}
                open={isOpen(entry.id)}
              />
            ))}
          </ul>
          <Pager
            hasNext={Boolean(current.data?.nextCursor)}
            onPage={setPage}
            onPerPage={setPerPage}
            page={page}
            perPage={perPage}
            shown={items.length}
          />
        </section>
        <PhoneLog items={grown} />
        <ShowMore
          className="md:hidden"
          hasMore={Boolean(lastLoaded?.nextCursor)}
          onMore={showMore}
          pending={pages.some((p) => p.isFetching)}
          shown={grown.length}
          step={perPage}
        />
      </>
    );
  }

  return (
    <>
      <OwnerPhoneBar />
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            <span className="max-md:hidden">
              All academies · platform audit log
            </span>
            <span className="md:hidden">All academies</span>
          </Eyebrow>
          <PageTitle>Audit log</PageTitle>
          <p className="text-muted text-sm leading-[18px]">
            Newest first. Times are in your time zone ({viewerZoneName()}).
          </p>
        </PageHeading>
      </PageHeader>
      <div className="flex flex-wrap gap-2 max-md:hidden">
        <FilterPill
          onChange={setAcademy}
          options={academyOptions}
          prefix="Academy"
          value={search.academy ?? ALL}
        />
        <FilterPill
          onChange={setPerson}
          options={personOptions}
          prefix="Person"
          value={search.person ?? ALL}
        />
        <FilterPill
          onChange={setType}
          options={TYPE_OPTIONS}
          prefix="Type"
          value={filters.type}
        />
        <FilterPill
          onChange={setDate}
          options={DATE_OPTIONS}
          prefix="Date"
          value={filters.date}
        />
      </div>
      <div className="-mx-5 flex gap-[6px] overflow-x-auto px-5 md:hidden">
        <FilterPill
          className="px-3 py-2 font-semibold text-[13px] leading-4"
          onChange={setAcademy}
          options={academyOptions}
          value={search.academy ?? ALL}
        />
        <FilterPill
          className="px-3 py-2 font-semibold text-[13px] leading-4"
          onChange={setType}
          options={phoneTypeOptions}
          value={filters.type}
        />
        <FilterPill
          className="px-3 py-2 font-semibold text-[13px] leading-4"
          onChange={setPerson}
          options={personOptions}
          value={search.person ?? ALL}
        />
        <FilterPill
          className="px-3 py-2 font-semibold text-[13px] leading-4"
          onChange={setDate}
          options={DATE_OPTIONS}
          value={filters.date}
        />
      </div>
      <div>{body}</div>
    </>
  );
}
