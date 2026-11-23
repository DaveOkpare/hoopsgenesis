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
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { auditKind, describeAudit } from "@/features/audit-log/describe";
import {
  type AuditDateFilter,
  type AuditLogItem,
  type AuditTypeFilter,
  auditActorsQueryOptions,
  auditLogQueryOptions,
  currentTime,
} from "@/features/audit-log/queries";
import type { Id } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";
import { formatDayMonth, formatTime, initials } from "@/lib/format";

export interface ActivitySearch {
  date?: AuditDateFilter;
  entry?: string;
  person?: string;
  type?: AuditTypeFilter;
}

const TYPE_OPTIONS: { value: AuditTypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "void", label: "Voids" },
  { value: "check_out", label: "Check-outs" },
  { value: "review", label: "Record reviews" },
  { value: "roster", label: "Roster changes" },
  { value: "qr", label: "QR code" },
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
  return {
    person: typeof raw.person === "string" ? raw.person : undefined,
    type: type === "all" ? undefined : type,
    date: date === "30d" ? undefined : date,
    entry: typeof raw.entry === "string" ? raw.entry : undefined,
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

/* ---------- Filters ---------- */

function FilterSelect<T extends string>({
  prefix,
  value,
  options,
  onChange,
}: {
  prefix: string;
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
        aria-label={prefix}
        className="shrink-0 py-[10px]"
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
    <dl className="whitespace-pre font-mono text-[13px] text-ink-soft leading-[160%]">
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
        "flex flex-1 basis-0 flex-col gap-2 rounded-[12px] bg-white px-4 py-[14px] max-md:basis-auto",
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

function EntryDetail({ entry, id }: { entry: AuditLogItem; id: string }) {
  return (
    <div
      className="flex gap-3 pr-3 pb-4 pl-[170px] max-md:flex-col max-md:px-0"
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
  const kind = auditKind(action);
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

function EntryRow({
  entry,
  open,
  timeZone,
  now,
  onToggle,
}: {
  entry: AuditLogItem;
  open: boolean;
  timeZone: string;
  now: Date;
  onToggle: (id: Id) => void;
}) {
  const handleClick = useCallback(
    () => onToggle(entry.id),
    [entry.id, onToggle]
  );
  const detailId = `audit-detail-${entry.id}`;
  const when = `${dayLabel(entry.createdAt, timeZone, now)}, ${formatTime(entry.createdAt, timeZone)}`;
  const actorName = entry.actor?.name ?? "System";
  return (
    <li
      className={cn(
        "flex flex-col border-line border-b",
        open && "bg-fog max-md:-mx-5 max-md:px-5"
      )}
    >
      <button
        aria-controls={detailId}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center py-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset max-md:items-start max-md:gap-3"
        onClick={handleClick}
        type="button"
      >
        {/* Desktop columns */}
        <span className="flex w-[170px] shrink-0 flex-col pl-3 max-md:hidden">
          <span className="text-[15px] text-ink leading-[18px]">{when}</span>
          <span className="text-[13px] text-muted leading-4">
            {formatDayMonth(entry.createdAt, timeZone)}
          </span>
        </span>
        <span className="flex w-[220px] shrink-0 items-center gap-[10px] max-md:hidden">
          <Avatar size={30} tone={open ? "white" : "fog"}>
            <AvatarFallback>{initials(actorName)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-[15px] text-ink leading-[18px]">
            {actorName}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-[10px] max-md:flex-col max-md:items-start max-md:gap-[6px]">
          <KindBadge action={entry.action} />
          <span className="text-[15px] text-ink leading-[18px] max-md:leading-5">
            {describeAudit(entry)}
          </span>
          <span className="text-[13px] text-muted leading-4 md:hidden">
            {actorName} · {when}
          </span>
        </span>
        <span className="flex w-10 shrink-0 justify-center max-md:w-4 max-md:pt-1">
          <Chevron open={open} />
        </span>
      </button>
      {open ? <EntryDetail entry={entry} id={detailId} /> : null}
    </li>
  );
}

function LogSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col" role="status">
      <span className="sr-only">Loading activity</span>
      {SKELETON_ROWS.map((key) => (
        <div
          className="flex items-center gap-6 border-line border-b py-[14px] pl-3"
          key={key}
        >
          <Skeleton className="h-8 w-[146px] max-md:hidden" />
          <Skeleton className="h-[30px] w-[180px] max-md:hidden" />
          <Skeleton className="h-5 flex-1" />
        </div>
      ))}
    </div>
  );
}

/* ---------- Screen ---------- */

export function ActivityLogScreen({
  search,
  onSearchChange,
}: {
  search: ActivitySearch;
  onSearchChange: (patch: Partial<ActivitySearch>) => void;
}) {
  const membership = useActiveMembership();
  const academyId = membership?.academy.id ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const now = currentTime();

  const params = useMemo(
    () => ({
      actorId: search.person ?? null,
      type: search.type ?? "all",
      date: search.date ?? "30d",
    }),
    [search.person, search.type, search.date]
  );
  const log = useQuery(auditLogQueryOptions(academyId, params));
  const actors = useQuery(auditActorsQueryOptions(academyId));

  /** null = the design's default: the newest entry open. */
  const [openIds, setOpenIds] = useState<Set<Id> | null>(null);
  const defaultOpen = search.entry ?? log.data?.[0]?.id;
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

  const personOptions = useMemo(
    () => [
      { value: ANYONE, label: "Anyone" },
      ...(actors.data ?? []).map((a) => ({ value: a.id, label: a.name })),
    ],
    [actors.data]
  );
  const handlePerson = useCallback(
    (value: string) =>
      onSearchChange({ person: value === ANYONE ? undefined : value }),
    [onSearchChange]
  );
  const handleType = useCallback(
    (value: AuditTypeFilter) =>
      onSearchChange({ type: value === "all" ? undefined : value }),
    [onSearchChange]
  );
  const handleDate = useCallback(
    (value: AuditDateFilter) =>
      onSearchChange({ date: value === "30d" ? undefined : value }),
    [onSearchChange]
  );

  let body: ReactNode;
  if (!log.data) {
    body = <LogSkeleton />;
  } else if (log.data.length === 0) {
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
      <section aria-label="Changes, newest first">
        <div
          aria-hidden="true"
          className="flex items-center border-line border-b py-[10px] font-semibold text-[13px] text-muted uppercase leading-4 tracking-[0.04em] max-md:hidden"
        >
          <span className="w-[170px] shrink-0">When</span>
          <span className="w-[220px] shrink-0">Who</span>
          <span className="flex-1">What happened</span>
          <span className="w-10 shrink-0" />
        </div>
        <ul className="flex flex-col max-md:border-line max-md:border-t">
          {log.data.map((entry) => (
            <EntryRow
              entry={entry}
              key={entry.id}
              now={now}
              onToggle={handleToggle}
              open={isOpen(entry.id)}
              timeZone={timeZone}
            />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow>Every void, check-out, review and roster change</Eyebrow>
          <PageTitle>Activity log</PageTitle>
        </PageHeading>
      </PageHeader>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
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
      </div>
      {body}
    </>
  );
}
