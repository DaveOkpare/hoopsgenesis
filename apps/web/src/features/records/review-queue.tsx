/*
 * Records review queue (1PT-0), for coaches at /coach/records (academy admins get the
 * read-only ./admin-records.tsx).
 * `scope="coach"` limits it to the coach's teams and hides their own entries.
 * URL state: ?tab=verified|rejected, ?id=<recordId> (selected / open on phones),
 * ?reject=1 (reject dialog for the selected record).
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import {
  Tabs,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@hoops-genesis/ui/components/tabs";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  recordSubtitle,
  recordTitle,
  waitingLabel,
} from "@/features/records/describe";
import {
  currentTime,
  type ReviewItem,
  type ReviewScope,
  reviewRecordsQueryOptions,
  useRejectRecord,
  useVerifyRecord,
} from "@/features/records/queries";
import {
  DocumentIcon,
  PhotoIcon,
  RecordActions,
  RecordBody,
  RecordHeader,
} from "@/features/records/record-detail";
import { RejectRecordDialog } from "@/features/records/reject-dialog";
import type { Id, RecordStatus } from "@/features/types";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";
import { firstName } from "@/lib/format";
import { useIsPhone } from "@/lib/use-is-phone";

export type ReviewTab = RecordStatus;

export interface ReviewSearch {
  id?: string;
  reject?: 1;
  tab?: Exclude<ReviewTab, "pending">;
}

export function parseReviewSearch(raw: Record<string, unknown>): ReviewSearch {
  return {
    tab: raw.tab === "verified" || raw.tab === "rejected" ? raw.tab : undefined,
    id: typeof raw.id === "string" ? raw.id : undefined,
    reject: raw.reject === 1 || raw.reject === "1" ? 1 : undefined,
  };
}

const SKELETON_ROWS = ["a", "b", "c", "d"];

const EMPTY_COPY: Record<ReviewTab, { title: string; description: string }> = {
  pending: {
    title: "Nothing waiting",
    description: "New uploads and results show up here for review.",
  },
  verified: {
    title: "Nothing verified yet",
    description: "Records you verify stay here for reference.",
  },
  rejected: {
    title: "Nothing rejected",
    description: "Rejected records show here with the note the student saw.",
  },
};

/* ---------- Queue list ---------- */

function QueueRow({
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
  const Icon = item.recordType === "academic" ? DocumentIcon : PhotoIcon;
  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-[14px] p-[14px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
          selected ? "bg-ink text-white" : "hover:bg-fog",
          "max-md:rounded-none max-md:border-line max-md:border-b max-md:px-0 max-md:py-3 max-md:hover:bg-transparent"
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
          <Icon />
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
            {recordSubtitle(item)}
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

function QueueSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[6px]" role="status">
      <span className="sr-only">Loading records</span>
      {SKELETON_ROWS.map((key) => (
        <div className="flex items-center gap-3 p-[14px]" key={key}>
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

function QueueList({
  isLoading,
  isPhone,
  items,
  now,
  selectedId,
  tab,
  timeZone,
  onSelect,
}: {
  isLoading: boolean;
  isPhone: boolean;
  items: ReviewItem[];
  now: Date;
  selectedId: Id | undefined;
  tab: ReviewTab;
  timeZone: string;
  onSelect: (id: Id) => void;
}) {
  if (isLoading) {
    return <QueueSkeleton />;
  }
  if (items.length === 0) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyTitle>{EMPTY_COPY[tab].title}</EmptyTitle>
          <EmptyDescription>{EMPTY_COPY[tab].description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul aria-label="Records" className="flex flex-col gap-[6px] max-md:gap-0">
      {items.map((item) => (
        <QueueRow
          item={item}
          key={item.id}
          now={now}
          onSelect={onSelect}
          selected={!isPhone && item.id === selectedId}
          timeZone={timeZone}
        />
      ))}
    </ul>
  );
}

function PhoneReview({
  item,
  open,
  position,
  timeZone,
  actions,
  onClose,
}: {
  item: ReviewItem | undefined;
  open: boolean;
  position: string | null;
  timeZone: string;
  actions: ReactNode;
  onClose: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onClose} open={open}>
      <DialogContent mobile="fullscreen">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>{recordTitle(item)}</DialogTitle>
              <DialogDescription>{item.student.name}</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <RecordHeader
                className="border-b-0 px-5 pt-1 pb-4"
                item={item}
                position={position}
                timeZone={timeZone}
              />
              <div className="flex flex-col px-5 pb-4">
                <RecordBody item={item} />
              </div>
            </div>
            {actions}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Screen ---------- */

export function ReviewQueueScreen({
  scope: scopeKind,
  search,
  onSearchChange,
}: {
  scope: "admin" | "coach";
  search: ReviewSearch;
  onSearchChange: (patch: Partial<ReviewSearch>) => void;
}) {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const isPhone = useIsPhone();
  const academyId = membership?.academy.id ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const viewerId = viewer.user.id;
  const teamIds = useMemo(
    () => membership?.teams.map((t) => t.id) ?? [],
    [membership]
  );
  const scope = useMemo<ReviewScope>(
    () =>
      scopeKind === "admin"
        ? { kind: "admin", viewerId }
        : { kind: "coach", viewerId, teamIds },
    [scopeKind, viewerId, teamIds]
  );
  const now = currentTime();

  const records = useQuery(reviewRecordsQueryOptions(academyId, scope));
  const verify = useVerifyRecord(academyId);
  const reject = useRejectRecord(academyId);
  const [advance, setAdvance] = useState(true);

  const tab: ReviewTab = search.tab ?? "pending";
  const all = records.data ?? [];
  const items = all.filter((item) => item.status === tab);
  const pending = all.filter((item) => item.status === "pending");
  const selectedId = search.id ?? (isPhone ? undefined : items[0]?.id);
  const selected = all.find((item) => item.id === selectedId);
  const index = items.findIndex((item) => item.id === selectedId);
  const position = index >= 0 ? `${index + 1} of ${items.length}` : null;
  const canDecide = selected ? selected.recordedBy !== viewerId : false;

  const handleTab = useCallback(
    (value: unknown) => {
      if (value === "pending" || value === "verified" || value === "rejected") {
        onSearchChange({
          tab: value === "pending" ? undefined : value,
          id: undefined,
          reject: undefined,
        });
      }
    },
    [onSearchChange]
  );
  const handleSelect = useCallback(
    (id: Id) => onSearchChange({ id, reject: undefined }),
    [onSearchChange]
  );

  /** After a decision: the next pending record (or stay put, if the box is unticked). */
  const moveOn = useCallback(
    (decidedId: Id) => {
      if (!advance) {
        onSearchChange({ id: decidedId, reject: undefined });
        return;
      }
      const at = pending.findIndex((item) => item.id === decidedId);
      const rest = pending.filter((item) => item.id !== decidedId);
      const next = rest[Math.min(Math.max(at, 0), rest.length - 1)];
      onSearchChange({ id: next?.id, reject: undefined });
    },
    [advance, onSearchChange, pending]
  );

  const handleVerify = useCallback(async () => {
    if (!selected) {
      return;
    }
    try {
      await verify.mutateAsync(selected.id);
      toast.success(
        `Verified ${firstName(selected.student.name)}’s ${recordTitle(selected).toLowerCase()}`
      );
      moveOn(selected.id);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't verify it. Try again."));
    }
  }, [moveOn, selected, verify]);

  const handleOpenReject = useCallback(
    () => onSearchChange({ id: selected?.id, reject: 1 }),
    [onSearchChange, selected]
  );
  const handleRejectOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onSearchChange({ reject: undefined });
      }
    },
    [onSearchChange]
  );
  const handleReject = useCallback(
    async (note: string) => {
      if (!selected) {
        return;
      }
      try {
        await reject.mutateAsync({ recordId: selected.id, reason: note });
        toast.success(
          `Rejected. ${firstName(selected.student.name)} will see your note.`
        );
        moveOn(selected.id);
      } catch (error) {
        toast.error(errorMessage(error, "Couldn't reject it. Try again."));
      }
    },
    [moveOn, reject, selected]
  );
  const handleAdvance = useCallback(
    (checked: boolean) => setAdvance(checked),
    []
  );
  const handlePhoneClose = useCallback(
    (open: boolean) => {
      if (!open) {
        onSearchChange({ id: undefined, reject: undefined });
      }
    },
    [onSearchChange]
  );

  const busy = verify.isPending || reject.isPending;
  const actions = selected ? (
    <RecordActions
      advance={advance}
      busy={busy}
      canDecide={canDecide}
      className="mt-auto"
      item={selected}
      onAdvanceChange={handleAdvance}
      onReject={handleOpenReject}
      onVerify={handleVerify}
    />
  ) : null;

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow>Report cards and results</Eyebrow>
          <PageTitle>Waiting for review</PageTitle>
        </PageHeading>
      </PageHeader>

      <div className="flex flex-1 gap-4 max-md:flex-col">
        <div className="flex w-[400px] shrink-0 flex-col gap-3 max-md:w-full max-md:gap-4 max-lg:w-[320px]">
          <Tabs onValueChange={handleTab} value={tab}>
            <TabsList>
              <TabsTrigger value="pending">
                Pending
                {pending.length > 0 ? (
                  <TabsCount tone="alert">{pending.length}</TabsCount>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="verified">Verified</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
          <QueueList
            isLoading={records.isPending}
            isPhone={isPhone}
            items={items}
            now={now}
            onSelect={handleSelect}
            selectedId={selectedId}
            tab={tab}
            timeZone={timeZone}
          />
        </div>

        {isPhone ? null : (
          <section
            aria-label="Selected record"
            className="flex min-h-[640px] min-w-0 flex-1 flex-col rounded-[20px] border border-line bg-white"
          >
            {selected ? (
              <>
                <RecordHeader
                  item={selected}
                  position={position}
                  timeZone={timeZone}
                />
                <RecordBody item={selected} />
                {actions}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-muted text-sm">
                {items.length > 0
                  ? "Pick a record from the list."
                  : "Nothing to review here."}
              </div>
            )}
          </section>
        )}
      </div>

      {isPhone ? (
        <PhoneReview
          actions={actions}
          item={selected}
          onClose={handlePhoneClose}
          open={Boolean(selected) && !search.reject}
          position={position}
          timeZone={timeZone}
        />
      ) : null}

      <RejectRecordDialog
        item={selected?.status === "pending" ? selected : undefined}
        onOpenChange={handleRejectOpenChange}
        onReject={handleReject}
        open={Boolean(search.reject)}
      />
    </>
  );
}
