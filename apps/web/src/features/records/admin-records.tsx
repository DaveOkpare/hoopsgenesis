/*
 * Records for academy admins, READ ONLY (CO-9 is the coaches' job):
 *   /admin/records                 list; from 1024px up a split view with the record on
 *                                  the right (IGD-0), ?id= picks it; below that a list
 *                                  of links (AUK-0 tablet, 7UQ-0 phone)
 *   /admin/records/$recordId       the record as its own page (B88-0 tablet, 7XC-0 and
 *                                  F4U-0 phone)
 * ?tab=verified|rejected picks the list on both. The server would still let an academy
 * admin verify or reject (`record:verify`), but the design gives admins no such control;
 * an admin who is also a coach reviews from /coach/records.
 */
import { buttonVariants } from "@hoops-genesis/ui/components/button";
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
import {
  Tabs,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@hoops-genesis/ui/components/tabs";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";

import {
  adminRecordSubtitle,
  type ReviewState,
  recordPhoneProvenance,
  recordProvenance,
  recordTitle,
  reviewStatusLine,
  waitingLabel,
} from "@/features/records/describe";
import {
  currentTime,
  type ReviewItem,
  type ReviewScope,
  reviewRecordsQueryOptions,
} from "@/features/records/queries";
import {
  DocumentIcon,
  EnteredFields,
  enteredByName,
  NoFileCard,
  OpenFileLink,
  PhotoIcon,
  READ_ONLY_NOTE,
  RecordBody,
  RecordHeader,
  RejectionNote,
} from "@/features/records/record-detail";
import type { Id, RecordStatus } from "@/features/types";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

export type AdminRecordsTab = Exclude<RecordStatus, "pending">;

export interface AdminRecordsSearch {
  id?: string;
  tab?: AdminRecordsTab;
}

export function parseAdminRecordsSearch(
  raw: Record<string, unknown>
): AdminRecordsSearch {
  return {
    tab: raw.tab === "verified" || raw.tab === "rejected" ? raw.tab : undefined,
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : undefined,
  };
}

const SKELETON_ROWS = ["a", "b", "c", "d"];

const EMPTY_COPY: Record<RecordStatus, { title: string; description: string }> =
  {
    pending: {
      title: "Nothing waiting",
      description:
        "New uploads and results show up here until a coach reviews them.",
    },
    verified: {
      title: "Nothing verified yet",
      description: "Records a coach has verified show up here.",
    },
    rejected: {
      title: "Nothing rejected",
      description: "Rejected records show here with the note the student saw.",
    },
  };

const DOT: Record<ReviewState, string> = {
  waiting: "bg-orange",
  verified: "bg-success",
  rejected: "bg-orange-deep",
};

/** The academy's records as the admin sees them (all three statuses), sorted per tab. */
function useAdminRecords() {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const academyId = membership?.academy.id ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const viewerId = viewer.user.id;
  const scope = useMemo<ReviewScope>(
    () => ({ kind: "admin", viewerId }),
    [viewerId]
  );
  const records = useQuery(reviewRecordsQueryOptions(academyId, scope));
  return { all: records.data, timeZone };
}

function itemsFor(all: ReviewItem[], status: RecordStatus): ReviewItem[] {
  return all.filter((item) => item.status === status);
}

/* ---------- Icons ---------- */

function ChevronIcon({
  direction,
  className,
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0", className)}
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d={direction === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function TypeIcon({ item }: { item: ReviewItem }) {
  return item.recordType === "academic" ? <DocumentIcon /> : <PhotoIcon />;
}

/* ---------- Tabs ---------- */

function StatusTabs({
  tab,
  waitingCount,
  onChange,
}: {
  tab: RecordStatus;
  waitingCount: number;
  onChange: (tab: RecordStatus) => void;
}) {
  const handleChange = useCallback(
    (value: unknown) => {
      if (value === "pending" || value === "verified" || value === "rejected") {
        onChange(value);
      }
    },
    [onChange]
  );
  return (
    <Tabs onValueChange={handleChange} value={tab}>
      <TabsList>
        <TabsTrigger value="pending">
          Waiting
          {waitingCount > 0 ? <TabsCount>{waitingCount}</TabsCount> : null}
        </TabsTrigger>
        <TabsTrigger value="verified">Verified</TabsTrigger>
        <TabsTrigger value="rejected">Rejected</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/* ---------- Rows ---------- */

/** Desktop split view row (IGD-0): selects the record on the right. */
function SelectRow({
  item,
  selected,
  now,
  timeZone,
  onSelect,
}: {
  item: ReviewItem;
  selected: boolean;
  now: Date;
  timeZone: string;
  onSelect: (id: Id) => void;
}) {
  const handleClick = useCallback(() => onSelect(item.id), [item.id, onSelect]);
  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-[14px] p-[14px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
          selected ? "bg-ink text-white" : "hover:bg-fog"
        )}
        onClick={handleClick}
        type="button"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
            selected ? "bg-[#2A2A2A] text-white" : "bg-fog text-ink"
          )}
        >
          <TypeIcon item={item} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span
            className={cn(
              "truncate font-semibold text-[15px] leading-[18px]",
              selected ? "text-white" : "text-ink"
            )}
          >
            {item.student.name}
          </span>
          <span
            className={cn(
              "truncate text-[13px] leading-4",
              selected ? "text-[#BDBDBD]" : "text-muted"
            )}
          >
            {adminRecordSubtitle(item)}
          </span>
        </span>
        <span
          className={cn(
            "w-16 shrink-0 text-right text-[13px] leading-4",
            selected ? "text-[#BDBDBD]" : "text-muted"
          )}
        >
          {waitingLabel(item.createdAt, now, timeZone)}
        </span>
      </button>
    </li>
  );
}

/** Tablet and phone row (AUK-0, 7UQ-0): opens the record page. */
function LinkRow({
  item,
  tab,
  now,
  timeZone,
}: {
  item: ReviewItem;
  tab: AdminRecordsTab | undefined;
  now: Date;
  timeZone: string;
}) {
  return (
    <li>
      <Link
        className="flex items-center gap-3 border-line border-b py-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ink max-md:py-3"
        params={{ recordId: item.id }}
        search={{ tab }}
        to="/admin/records/$recordId"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-fog text-ink max-md:rounded-[12px]">
          <TypeIcon item={item} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate font-semibold text-[15px] text-ink leading-[18px] max-md:leading-5">
            {item.student.name}
          </span>
          <span className="truncate text-[13px] text-muted leading-4">
            {adminRecordSubtitle(item)}
          </span>
        </span>
        <span className="w-16 shrink-0 text-right text-[13px] text-muted leading-4 max-md:w-14">
          {waitingLabel(item.createdAt, now, timeZone)}
        </span>
        <ChevronIcon className="text-muted md:hidden" direction="right" />
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[6px]" role="status">
      <span className="sr-only">Loading records</span>
      {SKELETON_ROWS.map((key) => (
        <div
          className="flex items-center gap-3 py-[14px] lg:p-[14px]"
          key={key}
        >
          <Skeleton className="size-10" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyList({ status }: { status: RecordStatus }) {
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyTitle>{EMPTY_COPY[status].title}</EmptyTitle>
        <EmptyDescription>{EMPTY_COPY[status].description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/* ---------- Status line ---------- */

function StatusLine({
  item,
  className,
}: {
  item: ReviewItem;
  className?: string;
}) {
  const { state, text } = reviewStatusLine(item);
  return (
    <p
      className={cn(
        "flex items-center gap-[10px] font-semibold text-[15px] text-ink leading-5",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", DOT[state])}
      />
      {text}
    </p>
  );
}

/* ---------- Desktop selected record (IGD-0) ---------- */

function SelectedRecord({
  item,
  position,
  timeZone,
}: {
  item: ReviewItem;
  position: string | null;
  timeZone: string;
}) {
  return (
    <>
      <RecordHeader item={item} position={position} timeZone={timeZone} />
      <RecordBody item={item} readOnly />
      <div className="flex items-center justify-between gap-4 border-line border-t px-6 py-5">
        <StatusLine item={item} />
        <p className="shrink-0 text-muted text-sm leading-[18px]">
          Read only. Coaches review records.
        </p>
      </div>
    </>
  );
}

/* ---------- List screen ---------- */

export function AdminRecordsScreen({
  search,
  onSearchChange,
}: {
  search: AdminRecordsSearch;
  onSearchChange: (patch: Partial<AdminRecordsSearch>) => void;
}) {
  const { all: loaded, timeZone } = useAdminRecords();
  const isLoading = loaded === undefined;
  const now = currentTime();
  const status: RecordStatus = search.tab ?? "pending";
  const all = loaded ?? [];
  const items = itemsFor(all, status);
  const waitingCount = itemsFor(all, "pending").length;
  const selectedId = search.id ?? items[0]?.id;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const index = selected ? items.indexOf(selected) : -1;
  const position = index >= 0 ? `${index + 1} of ${items.length}` : null;

  const handleTab = useCallback(
    (next: RecordStatus) =>
      onSearchChange({
        tab: next === "pending" ? undefined : next,
        id: undefined,
      }),
    [onSearchChange]
  );
  const handleSelect = useCallback(
    (id: Id) => onSearchChange({ id }),
    [onSearchChange]
  );

  let list: ReactNode;
  if (isLoading) {
    list = <ListSkeleton />;
  } else if (items.length === 0) {
    list = <EmptyList status={status} />;
  } else {
    list = (
      <>
        <ul
          aria-label="Records"
          className="flex flex-col gap-[6px] max-lg:hidden"
        >
          {items.map((item) => (
            <SelectRow
              item={item}
              key={item.id}
              now={now}
              onSelect={handleSelect}
              selected={item.id === selected?.id}
              timeZone={timeZone}
            />
          ))}
        </ul>
        <ul aria-label="Records" className="flex flex-col lg:hidden">
          {items.map((item) => (
            <LinkRow
              item={item}
              key={item.id}
              now={now}
              tab={search.tab}
              timeZone={timeZone}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            <span className="max-md:hidden">
              Report cards and results · read only
            </span>
            <span className="md:hidden">Read only</span>
          </Eyebrow>
          <PageTitle>Records</PageTitle>
        </PageHeading>
      </PageHeader>

      <div className="flex flex-1 gap-4 max-md:gap-4 max-lg:flex-col max-lg:gap-5">
        <div className="flex w-[400px] shrink-0 flex-col gap-3 max-md:gap-4 max-lg:w-full max-lg:gap-5">
          <StatusTabs
            onChange={handleTab}
            tab={status}
            waitingCount={waitingCount}
          />
          {list}
          <p className="flex items-center gap-[10px] rounded-[14px] bg-orange-soft px-4 py-[14px] text-ink-soft text-sm leading-[18px] max-md:hidden lg:hidden">
            <InfoGlyph />
            Coaches review records. You can read them here.
          </p>
          <p className="text-[13px] text-muted leading-[18px] md:hidden">
            Coaches review records. You can read them here. Waiting means the
            coach hasn't checked it yet.
          </p>
        </div>

        <section
          aria-label="Selected record"
          className="flex min-h-[640px] min-w-0 flex-1 flex-col rounded-[20px] border border-line bg-white max-lg:hidden"
        >
          {selected ? (
            <SelectedRecord
              item={selected}
              position={position}
              timeZone={timeZone}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-muted text-sm">
              {isLoading ? "Loading…" : "Nothing to show here."}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function InfoGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <circle
        cx="8"
        cy="8"
        fill="none"
        r="6.5"
        stroke="#6B6B6B"
        strokeWidth="1.4"
      />
      <path
        d="M8 7v4M8 5h.01"
        fill="none"
        stroke="#6B6B6B"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/* ---------- Record page (B88-0 tablet, 7XC-0 / F4U-0 phone) ---------- */

function StepLink({
  item,
  tab,
  direction,
}: {
  item: ReviewItem | undefined;
  tab: AdminRecordsTab | undefined;
  direction: "left" | "right";
}) {
  const label = direction === "left" ? "Previous record" : "Next record";
  const classes = cn(
    buttonVariants({ variant: "outline", size: "icon-lg" }),
    "size-11 rounded-full"
  );
  if (!item) {
    return (
      <span aria-disabled="true" className={cn(classes, "text-[#C8C8C8]")}>
        <ChevronIcon direction={direction} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link
      aria-label={label}
      className={classes}
      params={{ recordId: item.id }}
      replace
      search={{ tab }}
      to="/admin/records/$recordId"
    >
      <ChevronIcon direction={direction} />
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5" role="status">
      <span className="sr-only">Loading the record</span>
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-4 w-80" />
      <div className="flex gap-6 max-md:flex-col">
        <Skeleton className="h-[200px] flex-1 rounded-[20px] md:h-[480px]" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Phone file block (7XC-0): small drawn page, then the file name and "Open". */
function PhoneFile({ item }: { item: ReviewItem }) {
  if (!item.hasFile) {
    return <NoFileCard item={item} />;
  }
  return (
    <div className="flex h-[200px] shrink-0 flex-col items-center justify-center gap-[10px] rounded-[20px] bg-fog">
      <div
        aria-hidden="true"
        className="flex h-[124px] w-24 shrink-0 flex-col gap-[7px] rounded-[6px] bg-white px-3 py-[14px] shadow-[0_2px_8px_#11111114]"
      >
        <div className="h-[6px] w-[50px] rounded-[3px] bg-ink" />
        <div className="h-1 rounded-[2px] bg-line" />
        <div className="h-1 rounded-[2px] bg-line" />
        <div className="h-1 w-[54px] rounded-[2px] bg-line" />
        <div className="h-1 rounded-[2px] bg-line" />
        <div className="h-1 w-10 rounded-[2px] bg-orange" />
      </div>
      <OpenFileLink item={item} />
    </div>
  );
}

/** Tablet file block (B88-0): the drawn page at full height, then "Open". */
function TabletFile({ item }: { item: ReviewItem }) {
  if (!item.hasFile) {
    return <NoFileCard className="w-[340px] shrink-0" item={item} />;
  }
  return (
    <div className="flex h-[480px] w-[340px] shrink-0 flex-col items-center gap-3 rounded-[14px] bg-fog p-6">
      <div
        aria-hidden="true"
        className="flex w-full flex-1 flex-col gap-3 bg-white px-[22px] py-6 shadow-[0_2px_10px_#11111114]"
      >
        <div className="h-[10px] w-[60%] rounded-[3px] bg-ink-soft" />
        <div className="h-[7px] w-[40%] rounded-[3px] bg-[#C8C8C8]" />
        <div className="flex flex-col gap-[9px] pt-3">
          {["45%", "38%", "50%", "42%", "35%", "48%"].map((width) => (
            <div className="flex justify-between" key={width}>
              <div
                className="h-[7px] rounded-[3px] bg-stone"
                style={{ width }}
              />
              <div className="h-[7px] w-[12%] rounded-[3px] bg-ink-soft" />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-line border-t pt-[14px]">
          <div className="h-2 w-[30%] rounded-[3px] bg-ink-soft" />
          <div className="h-2 w-[14%] rounded-[3px] bg-ink" />
        </div>
        <div className="h-9 w-20 self-end rounded-full border-2 border-[#C8C8C8]" />
      </div>
      <OpenFileLink item={item} />
    </div>
  );
}

export function AdminRecordDetailScreen({
  recordId,
  tab,
}: {
  recordId: Id;
  tab: AdminRecordsTab | undefined;
}) {
  const { all: loaded, timeZone } = useAdminRecords();
  const now = currentTime();
  const all = loaded ?? [];
  const item = all.find((record) => record.id === recordId);
  // Step through the records with the same status as this one.
  const items = item ? itemsFor(all, item.status) : [];
  const index = item ? items.indexOf(item) : -1;
  const back = (
    <Link
      className="flex h-11 items-center gap-[6px] rounded-sm font-semibold text-[15px] text-ink leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink max-md:h-auto max-md:font-medium max-md:text-[13px] max-md:text-muted max-md:uppercase max-md:leading-4 max-md:tracking-label"
      search={{ tab, id: item ? recordId : undefined }}
      to="/admin/records"
    >
      <ChevronIcon direction="left" />
      Records
    </Link>
  );

  if (loaded === undefined) {
    return <DetailSkeleton />;
  }
  if (!item) {
    return (
      <div className="flex flex-col gap-5">
        <div>{back}</div>
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyTitle>Record not found</EmptyTitle>
            <EmptyDescription>
              It may have been deleted, or it belongs to someone you can't see.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const position = `${index + 1} of ${items.length}`;
  return (
    <div className="flex flex-1 flex-col gap-5 max-md:gap-4">
      <div className="flex items-center justify-between">
        {back}
        <div className="flex items-center gap-2">
          <p className="text-muted text-sm leading-[18px] max-md:font-medium max-md:text-[13px] max-md:leading-4">
            {position}
          </p>
          <div className="flex items-center gap-2 max-md:hidden">
            <StepLink direction="left" item={items[index - 1]} tab={tab} />
            <StepLink direction="right" item={items[index + 1]} tab={tab} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[10px] max-md:gap-1">
        <h1 className="font-display text-2xl text-ink uppercase leading-[95%] max-md:leading-10">
          <span className="max-md:hidden">{item.student.name} · </span>
          {recordTitle(item)}
        </h1>
        <p className="text-muted text-sm leading-[18px] max-md:hidden">
          {recordProvenance(item, timeZone)}
          {item.student.teamName ? ` · ${item.student.teamName}` : ""}
        </p>
        <p className="text-muted text-sm leading-[18px] md:hidden">
          {recordPhoneProvenance(item, timeZone, now)}
        </p>
      </div>

      {/* Tablet and desktop: file beside the fields. */}
      <div className="flex items-start gap-6 max-md:hidden">
        <TabletFile item={item} />
        <div className="flex flex-1 basis-0 flex-col gap-[18px]">
          <h2 className="font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
            What {enteredByName(item)} entered
          </h2>
          <EnteredFields item={item} />
          <RejectionNote item={item} />
          <div className="flex gap-[10px] rounded-[12px] bg-fog p-[14px]">
            <InfoGlyph />
            <p className="text-ink-soft text-sm leading-body">
              {READ_ONLY_NOTE}
            </p>
          </div>
        </div>
      </div>

      {/* Phone: file, then the fields. */}
      <div className="flex flex-col gap-4 md:hidden">
        <PhoneFile item={item} />
        <div className="flex flex-col">
          <h2 className="pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
            What {enteredByName(item)} entered
          </h2>
          <EnteredFields
            className="[&>div:last-child]:border-b [&>div]:leading-5"
            item={item}
          />
        </div>
        <RejectionNote item={item} />
      </div>

      <footer className="-mx-11 mt-auto -mb-12 flex items-center justify-between gap-4 border-line border-t bg-white px-11 pt-[22px] pb-[30px] max-md:-mx-5 max-md:mb-0 max-md:flex-col max-md:items-stretch max-md:gap-[6px] max-md:px-5 max-md:pt-4 max-md:pb-0 md:max-lg:-mx-8 md:max-lg:px-8">
        <StatusLine
          className="max-md:rounded-[14px] max-md:bg-fog max-md:px-[14px] max-md:py-3"
          item={item}
        />
        <p className="shrink-0 text-muted text-sm leading-[18px] max-md:hidden">
          Read only
        </p>
        <p className="text-center text-[13px] text-muted leading-[18px] md:hidden">
          Coaches review records. You can read them here.
        </p>
      </footer>
    </div>
  );
}
