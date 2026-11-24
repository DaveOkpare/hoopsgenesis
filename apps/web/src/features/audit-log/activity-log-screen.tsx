/*
 * Activity log (AO-9) at every size: a table from 1024px (1N8-0), stacked rows with
 * "Show changes" on tablets (BPL-0), and a day-grouped list with a Filter sheet on
 * phones (7ZY-0). URL state: ?person= ?type= ?date= ?entry=<id open> ?page=
 * (desktop: that page; tablet and phone: that many pages shown).
 */
import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
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
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  auditDetailLine,
  auditKind,
  describeAudit,
  describeAuditWithActor,
  whoLabel,
} from "@/features/audit-log/describe";
import {
  type AuditDateFilter,
  type AuditLogItem,
  type AuditTypeFilter,
  auditActorsQueryOptions,
  auditLogQueryOptions,
  currentTime,
} from "@/features/audit-log/queries";
import { PAGE_SIZE, Pagination } from "@/features/fees/payments-panel";
import type { Id } from "@/features/types";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import { formatDayMonth, formatTime, initials } from "@/lib/format";

export interface ActivitySearch {
  date?: AuditDateFilter;
  entry?: string;
  page?: number;
  person?: string;
  type?: AuditTypeFilter;
}

const TYPE_OPTIONS: { value: AuditTypeFilter; label: string; chip: string }[] =
  [
    { value: "all", label: "All types", chip: "All types" },
    { value: "fees", label: "Fees", chip: "Fees only" },
    { value: "void", label: "Voids", chip: "Voids only" },
    { value: "check_out", label: "Check-outs", chip: "Check-outs only" },
    { value: "ticks", label: "Attendance ticks", chip: "Ticks only" },
    { value: "review", label: "Record reviews", chip: "Reviews only" },
    { value: "roster", label: "Roster changes", chip: "Roster only" },
    { value: "join_codes", label: "Join codes", chip: "Join codes only" },
    { value: "calendar", label: "Calendar", chip: "Calendar only" },
    { value: "qr", label: "QR code", chip: "QR code only" },
    { value: "admins", label: "Admins", chip: "Admins only" },
  ];

const DATE_OPTIONS: { value: AuditDateFilter; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const ANYONE = "anyone";
const DAYS_IN_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const SKELETON_ROWS = ["a", "b", "c", "d", "e"];

export function parseActivitySearch(
  raw: Record<string, unknown>
): ActivitySearch {
  const type = TYPE_OPTIONS.find((o) => o.value === raw.type)?.value;
  const date = DATE_OPTIONS.find((o) => o.value === raw.date)?.value;
  const page = Number(raw.page);
  return {
    person: typeof raw.person === "string" ? raw.person : undefined,
    type: type === "all" ? undefined : type,
    date: date === "30d" ? undefined : date,
    entry: typeof raw.entry === "string" ? raw.entry : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

function dayNumber(value: Date | string, timeZone: string): number {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
  return Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY;
}

/** "Today", "Yesterday", "Fri" (within a week), else "16 Nov". */
function dayLabel(value: string, timeZone: string, now: Date): string {
  const diff = dayNumber(now, timeZone) - dayNumber(value, timeZone);
  if (diff === 0) {
    return "Today";
  }
  if (diff === 1) {
    return "Yesterday";
  }
  if (diff > 1 && diff <= DAYS_IN_WEEK) {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      timeZone,
    }).format(new Date(value));
  }
  return formatDayMonth(value, timeZone);
}

/** Phone day headings: "Today", "Yesterday", "Sat 21 Nov". */
function dayHeading(value: string, timeZone: string, now: Date): string {
  const diff = dayNumber(now, timeZone) - dayNumber(value, timeZone);
  if (diff === 0) {
    return "Today";
  }
  if (diff === 1) {
    return "Yesterday";
  }
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone,
  }).format(new Date(value));
  return `${weekday} ${formatDayMonth(value, timeZone)}`;
}

/** Tablet "Today, 09:14" / "Fri 20 Nov, 14:20". */
function tabletWhen(value: string, timeZone: string, now: Date): string {
  return `${dayHeading(value, timeZone, now)}, ${formatTime(value, timeZone)}`;
}

/* ---------- Filters ---------- */

function FilterSelect<T extends string>({
  prefix,
  value,
  options,
  onChange,
  className,
}: {
  prefix: string;
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
        aria-label={prefix}
        className={cn("shrink-0 py-[10px]", className)}
        variant="pill"
      >
        <SelectPrefix>{prefix}</SelectPrefix>
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

function EntryDetail({
  entry,
  id,
  className,
}: {
  entry: AuditLogItem;
  id: string;
  className?: string;
}) {
  const reason = entry.reason ? (
    <DetailCard className="grow-[1.2] md:max-lg:basis-auto" title="Reason">
      <p className="text-[15px] text-ink leading-body">“{entry.reason}”</p>
    </DetailCard>
  ) : null;
  return (
    <div
      className={cn(
        "flex gap-3 max-md:flex-col md:max-lg:flex-col md:max-lg:gap-[10px]",
        className
      )}
      id={id}
    >
      <div className="flex flex-[2] gap-3 max-md:flex-col md:max-lg:gap-[10px]">
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
      </div>
      {reason}
    </div>
  );
}

/* ---------- Rows ---------- */

function Chevron({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 14 14" width={size}>
      <path
        d={open ? "M3.5 9l3.5-3.5L10.5 9" : "M3.5 5.5L7 9l3.5-3.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function KindBadge({ action }: { action: string }) {
  const kind = auditKind(action);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-[9px] py-[3px] font-bold text-[12px] uppercase leading-4 tracking-[0.04em] md:max-lg:px-2 md:max-lg:tracking-[0.06em]",
        kind.tone === "alert"
          ? "bg-orange-soft text-orange-deep"
          : "bg-fog text-ink-soft"
      )}
    >
      {kind.label}
    </span>
  );
}

interface RowProps {
  entry: AuditLogItem;
  now: Date;
  onToggle: (id: Id) => void;
  open: boolean;
  timeZone: string;
}

/** 1N8-0: When · Who · What happened, click to expand. */
function DesktopRow({ entry, open, timeZone, now, onToggle }: RowProps) {
  const handleClick = useCallback(
    () => onToggle(entry.id),
    [entry.id, onToggle]
  );
  const detailId = `audit-detail-${entry.id}`;
  const when = `${dayLabel(entry.createdAt, timeZone, now)}, ${formatTime(entry.createdAt, timeZone)}`;
  const who = whoLabel(entry);
  return (
    <li className={cn("flex flex-col border-line border-b", open && "bg-fog")}>
      <button
        aria-controls={detailId}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center py-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset"
        onClick={handleClick}
        type="button"
      >
        <span className="flex w-[170px] shrink-0 flex-col pl-3">
          <span className="text-[15px] text-ink leading-[18px]">{when}</span>
          <span className="text-[13px] text-muted leading-4">
            {formatDayMonth(entry.createdAt, timeZone)}
          </span>
        </span>
        <span className="flex w-[220px] shrink-0 items-center gap-[10px]">
          <Avatar size={30} tone={open ? "white" : "fog"}>
            <AvatarFallback>
              {initials(entry.impersonatedBy?.name ?? entry.actor?.name ?? "")}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-[15px] text-ink leading-[18px]">
            {who}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-[10px]">
          <KindBadge action={entry.action} />
          <span className="text-[15px] text-ink leading-[18px]">
            {describeAudit(entry)}
          </span>
        </span>
        <span className="flex w-10 shrink-0 justify-center text-muted">
          <Chevron open={open} />
        </span>
      </button>
      {open ? (
        <EntryDetail
          className="pr-3 pb-4 pl-[170px]"
          entry={entry}
          id={detailId}
        />
      ) : null}
    </li>
  );
}

/** BPL-0: avatar, badge and sentence, "who · when", "Show changes". */
function TabletRow({ entry, open, timeZone, now, onToggle }: RowProps) {
  const handleClick = useCallback(
    () => onToggle(entry.id),
    [entry.id, onToggle]
  );
  const detailId = `audit-tablet-detail-${entry.id}`;
  return (
    <li
      className={cn(
        "flex flex-col gap-[14px] border-line border-b p-4",
        open && "bg-fog"
      )}
    >
      <div className="flex items-start gap-[14px]">
        <Avatar size={32} tone={open ? "white" : "fog"}>
          <AvatarFallback className="text-[12px]">
            {initials(entry.impersonatedBy?.name ?? entry.actor?.name ?? "")}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <div className="flex items-center gap-2">
            <KindBadge action={entry.action} />
            <p className="min-w-0 flex-1 text-[15px] text-ink leading-5">
              {describeAudit(entry)}
            </p>
          </div>
          <p className="text-muted text-sm leading-[18px]">
            {whoLabel(entry, { short: true })} ·{" "}
            {tabletWhen(entry.createdAt, timeZone, now)}
          </p>
        </div>
        <button
          aria-controls={detailId}
          aria-expanded={open}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-[6px] rounded-sm font-semibold text-ink text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
          onClick={handleClick}
          type="button"
        >
          {open ? "Hide changes" : "Show changes"}
          <Chevron open={open} />
        </button>
      </div>
      {open ? (
        <EntryDetail className="pl-[46px]" entry={entry} id={detailId} />
      ) : null}
    </li>
  );
}

/** 7ZY-0: time, "**You** voided a payment for **Jean**", detail, before and after. */
function PhoneRow({
  entry,
  open,
  timeZone,
  viewerId,
  onToggle,
}: Omit<RowProps, "now"> & { viewerId: Id }) {
  const handleClick = useCallback(
    () => onToggle(entry.id),
    [entry.id, onToggle]
  );
  const detailId = `audit-phone-detail-${entry.id}`;
  const detail = auditDetailLine(entry);
  const hasChanges = Boolean(entry.before && entry.after);
  return (
    <li className="flex flex-col gap-3 border-line border-b py-[11px]">
      <div className="flex gap-3">
        <span className="w-[42px] shrink-0 text-[13px] text-muted leading-5">
          {formatTime(entry.createdAt, timeZone)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <p className="text-[15px] text-ink leading-5">
            {describeAuditWithActor(entry, viewerId)}
          </p>
          {entry.reason ? (
            <p className="text-[13px] text-orange-deep leading-4">
              “{entry.reason}”
            </p>
          ) : null}
          {detail && !entry.reason ? (
            <p className="text-[13px] text-muted leading-4">{detail}</p>
          ) : null}
          {hasChanges ? (
            <button
              aria-controls={detailId}
              aria-expanded={open}
              className="cursor-pointer self-start rounded-sm font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
              onClick={handleClick}
              type="button"
            >
              {open ? "Hide before and after" : "Show before and after"}
            </button>
          ) : null}
        </div>
      </div>
      {open && hasChanges ? (
        <EntryDetail
          className="rounded-[14px] bg-fog p-3"
          entry={{ ...entry, reason: null }}
          id={detailId}
        />
      ) : null}
    </li>
  );
}

function LogSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col" role="status">
      <span className="sr-only">Loading activity</span>
      {SKELETON_ROWS.map((key) => (
        <div
          className="flex items-center gap-6 border-line border-b py-[14px] lg:pl-3"
          key={key}
        >
          <Skeleton className="h-8 w-[146px] max-lg:hidden" />
          <Skeleton className="size-8 rounded-full max-md:hidden lg:hidden" />
          <Skeleton className="h-[30px] w-[180px] max-lg:hidden" />
          <Skeleton className="h-5 flex-1" />
        </div>
      ))}
    </div>
  );
}

/* ---------- Phone filter sheet ---------- */

function FilterIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
      <path
        d="M2 4h12M4.5 8h7M7 12h2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function RemoveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      aria-label={`Remove filter: ${label}`}
      className="flex shrink-0 cursor-pointer items-center gap-[6px] rounded-full bg-fog py-[6px] pr-2 pl-3 font-medium text-[13px] text-ink leading-4 outline-none focus-visible:ring-2 focus-visible:ring-ink"
      onClick={onRemove}
      type="button"
    >
      {label}
      <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
        <path
          d="M4.5 4.5l7 7M11.5 4.5l-7 7"
          fill="none"
          stroke="#6B6B6B"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    </button>
  );
}

interface LogViewsProps {
  /** The entry open by default (desktop and tablet): ?entry= or the newest. */
  defaultOpen: Id | undefined;
  /** ?entry=, the only entry open by default on phones. */
  entryId: Id | undefined;
  hasMore: boolean;
  items: AuditLogItem[];
  now: Date;
  onMore: () => void;
  onPage: (page: number) => void;
  onToggle: (id: Id) => void;
  /** Entries the user opened or closed; null until they touch one. */
  openIds: Set<Id> | null;
  page: number;
  scope: string;
  timeZone: string;
  typeLabel: string | null;
  viewerId: Id;
}

/** The log at the three sizes (only one shows). */
function LogViews({
  defaultOpen,
  entryId,
  hasMore,
  openIds,
  items,
  now,
  onMore,
  onPage,
  onToggle,
  page,
  scope,
  timeZone,
  typeLabel,
  viewerId,
}: LogViewsProps) {
  const isOpen = (id: Id) => (openIds ? openIds.has(id) : id === defaultOpen);
  const isPhoneOpen = (id: Id) => (openIds ? openIds.has(id) : id === entryId);
  const total = `${items.length}${hasMore ? "+" : ""}`;
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const desktopPage = Math.min(page, pageCount);
  const desktopRows = items.slice(
    (desktopPage - 1) * PAGE_SIZE,
    desktopPage * PAGE_SIZE
  );
  const shownRows = items.slice(0, page * PAGE_SIZE);
  const canShowMore = shownRows.length < items.length;
  const typeNoun = typeLabel === null ? "changes" : typeLabel.toLowerCase();
  const days = groupByDay(shownRows, timeZone, now);
  return (
    <>
      {/* Desktop */}
      <section aria-label="Changes, newest first" className="max-lg:hidden">
        <div
          aria-hidden="true"
          className="flex items-center border-line border-b py-[10px] font-semibold text-[13px] text-muted uppercase leading-4 tracking-[0.04em]"
        >
          <span className="w-[170px] shrink-0">When</span>
          <span className="w-[220px] shrink-0">Who</span>
          <span className="flex-1">What happened</span>
          <span className="w-10 shrink-0" />
        </div>
        <ul className="flex flex-col">
          {desktopRows.map((entry) => (
            <DesktopRow
              entry={entry}
              key={entry.id}
              now={now}
              onToggle={onToggle}
              open={isOpen(entry.id)}
              timeZone={timeZone}
            />
          ))}
        </ul>
        <Pagination
          onPage={onPage}
          page={desktopPage}
          pageCount={pageCount}
          total={items.length}
        />
        {hasMore ? (
          <p className="pt-2 text-[13px] text-muted leading-4">
            Only the newest {items.length} are loaded. Narrow the filters to see
            older changes.
          </p>
        ) : null}
      </section>

      {/* Tablet */}
      <section
        aria-label="Changes, newest first"
        className="hidden flex-col gap-6 md:max-lg:flex"
      >
        <ul className="flex flex-col border-line border-t">
          {shownRows.map((entry) => (
            <TabletRow
              entry={entry}
              key={entry.id}
              now={now}
              onToggle={onToggle}
              open={isOpen(entry.id)}
              timeZone={timeZone}
            />
          ))}
        </ul>
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted text-sm leading-[18px]">
            Showing {shownRows.length} of {total} {scope}
          </p>
          {canShowMore ? (
            <Button onClick={onMore} size="sm" variant="outline">
              Load older
            </Button>
          ) : null}
        </div>
      </section>

      {/* Phone */}
      <section
        aria-label="Changes, newest first"
        className="flex flex-col gap-4 md:hidden"
      >
        {days.map((day) => (
          <div className="flex flex-col" key={day.key}>
            <h2 className="pb-[2px] font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
              {day.label}
            </h2>
            <ul className="flex flex-col">
              {day.entries.map((entry) => (
                <PhoneRow
                  entry={entry}
                  key={entry.id}
                  onToggle={onToggle}
                  open={isPhoneOpen(entry.id)}
                  timeZone={timeZone}
                  viewerId={viewerId}
                />
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-col items-center gap-3 rounded-[20px] bg-fog p-4">
          <p className="text-[13px] text-muted leading-4">
            Showing {shownRows.length} of {total} {typeNoun}
          </p>
          {canShowMore ? (
            <Button
              className="h-12 w-full border-ink bg-white text-[15px]"
              onClick={onMore}
              variant="outline"
            >
              Show {Math.min(PAGE_SIZE, items.length - shownRows.length)} more
            </Button>
          ) : null}
        </div>
      </section>
    </>
  );
}

/** The phone's removable chips for the filters that aren't at their default. */
function activeFilterChips({
  search,
  typeChip,
  personName,
  dateLabel,
  clear,
}: {
  search: ActivitySearch;
  typeChip: string | undefined;
  personName: string | undefined;
  dateLabel: string | undefined;
  clear: { type: () => void; person: () => void; date: () => void };
}): { key: string; label: string; clear: () => void }[] {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search.type) {
    chips.push({ key: "type", label: typeChip ?? "", clear: clear.type });
  }
  if (search.person) {
    chips.push({
      key: "person",
      label: personName ?? "One person",
      clear: clear.person,
    });
  }
  if (search.date) {
    chips.push({ key: "date", label: dateLabel ?? "", clear: clear.date });
  }
  return chips;
}

/* ---------- Screen ---------- */

export function ActivityLogScreen({
  search,
  onSearchChange,
}: {
  search: ActivitySearch;
  onSearchChange: (patch: Partial<ActivitySearch>) => void;
}) {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const academyId = membership?.academy.id ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const now = currentTime();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const params = useMemo(
    () => ({
      actorId: search.person ?? null,
      type: search.type ?? "all",
      date: search.date ?? "30d",
    }),
    [search.person, search.type, search.date]
  );
  const log = useQuery(auditLogQueryOptions(academyId, params));
  // Only the names in the "Person" filter: left out if it fails.
  const actors = useQuery({
    ...auditActorsQueryOptions(academyId),
    throwOnError: false,
  });

  /** null = the design's default: the newest entry open (desktop and tablet). */
  const [openIds, setOpenIds] = useState<Set<Id> | null>(null);
  const items = log.data?.items;
  const defaultOpen = search.entry ?? items?.[0]?.id;

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

  const personOptions = useMemo(
    () => [
      { value: ANYONE, label: "Anyone" },
      ...(actors.data ?? []).map((a) => ({ value: a.id, label: a.name })),
    ],
    [actors.data]
  );
  const handlePerson = useCallback(
    (value: string) =>
      onSearchChange({
        person: value === ANYONE ? undefined : value,
        page: undefined,
      }),
    [onSearchChange]
  );
  const handleType = useCallback(
    (value: AuditTypeFilter) =>
      onSearchChange({
        type: value === "all" ? undefined : value,
        page: undefined,
      }),
    [onSearchChange]
  );
  const handleDate = useCallback(
    (value: AuditDateFilter) =>
      onSearchChange({
        date: value === "30d" ? undefined : value,
        page: undefined,
      }),
    [onSearchChange]
  );
  const handlePage = useCallback(
    (next: number) => onSearchChange({ page: next > 1 ? next : undefined }),
    [onSearchChange]
  );
  const page = search.page ?? 1;
  const handleMore = useCallback(
    () => onSearchChange({ page: page + 1 }),
    [onSearchChange, page]
  );
  const clearPerson = useCallback(() => handlePerson(ANYONE), [handlePerson]);
  const clearType = useCallback(() => handleType("all"), [handleType]);
  const clearDate = useCallback(() => handleDate("30d"), [handleDate]);
  const openFilters = useCallback(() => setFiltersOpen(true), []);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const typeOption = TYPE_OPTIONS.find((o) => o.value === params.type);
  const personName = personOptions.find(
    (o) => o.value === search.person
  )?.label;
  const dateLabel = DATE_OPTIONS.find((o) => o.value === params.date)?.label;
  const activeFilters = activeFilterChips({
    search,
    typeChip: typeOption?.chip,
    personName,
    dateLabel,
    clear: { type: clearType, person: clearPerson, date: clearDate },
  });

  const filterSelects = (
    <>
      <FilterSelect
        onChange={handlePerson}
        options={personOptions}
        prefix="Person"
        value={search.person ?? ANYONE}
      />
      <FilterSelect
        onChange={handleType}
        options={TYPE_OPTIONS}
        prefix="Type"
        value={params.type}
      />
      <FilterSelect
        onChange={handleDate}
        options={DATE_OPTIONS}
        prefix="Date"
        value={params.date}
      />
    </>
  );

  const scope = dateLabel ? `in the ${dateLabel.toLowerCase()}` : "";
  let body: ReactNode;
  if (!items) {
    body = <LogSkeleton />;
  } else if (items.length === 0) {
    body = (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>
            No changes match these filters. Try a longer date range or another
            person.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = (
      <LogViews
        defaultOpen={defaultOpen}
        entryId={search.entry}
        hasMore={log.data?.hasMore ?? false}
        items={items}
        now={now}
        onMore={handleMore}
        onPage={handlePage}
        onToggle={handleToggle}
        openIds={openIds}
        page={page}
        scope={scope}
        timeZone={timeZone}
        typeLabel={params.type === "all" ? null : (typeOption?.label ?? null)}
        viewerId={viewer.user.id}
      />
    );
  }

  return (
    <>
      <PageHeader className="max-md:flex-row max-md:items-end max-md:justify-between">
        <PageHeading>
          <Eyebrow>
            <span className="max-md:hidden">
              Every void, check-out, review and roster change
            </span>
            <span className="md:hidden">Who changed what</span>
          </Eyebrow>
          <PageTitle>
            <span className="max-md:hidden">Activity log</span>
            <span className="md:hidden">Activity</span>
          </PageTitle>
        </PageHeading>
        <button
          className="flex shrink-0 cursor-pointer items-center gap-[6px] rounded-full border border-line px-[14px] py-[9px] font-semibold text-ink text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink md:hidden"
          onClick={openFilters}
          type="button"
        >
          <FilterIcon />
          Filter
          {activeFilters.length > 0 ? (
            <span className="flex size-[18px] items-center justify-center rounded-full bg-orange font-bold text-[11px] text-ink leading-[14px]">
              {activeFilters.length}
            </span>
          ) : null}
        </button>
      </PageHeader>

      <div className="flex gap-2 max-md:hidden md:max-lg:-mx-8 md:max-lg:overflow-x-auto md:max-lg:px-8">
        {filterSelects}
      </div>
      {activeFilters.length > 0 ? (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 md:hidden">
          {activeFilters.map((chip) => (
            <RemoveChip
              key={chip.key}
              label={chip.label}
              onRemove={chip.clear}
            />
          ))}
        </div>
      ) : null}

      {body}

      <Dialog onOpenChange={setFiltersOpen} open={filtersOpen}>
        <DialogContent>
          <DialogHeader showCloseButton>
            <DialogTitle>Filter</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3 [&_[data-slot=select-trigger]]:w-full">
            {filterSelects}
          </DialogBody>
          <DialogFooter>
            <Button onClick={closeFilters}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function groupByDay(
  entries: AuditLogItem[],
  timeZone: string,
  now: Date
): { key: string; label: string; entries: AuditLogItem[] }[] {
  const days: { key: string; label: string; entries: AuditLogItem[] }[] = [];
  for (const entry of entries) {
    const key = String(dayNumber(entry.createdAt, timeZone));
    const last = days.at(-1);
    if (last?.key === key) {
      last.entries.push(entry);
    } else {
      days.push({
        key,
        label: dayHeading(entry.createdAt, timeZone, now),
        entries: [entry],
      });
    }
  }
  return days;
}
