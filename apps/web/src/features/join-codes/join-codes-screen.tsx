import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import {
  List,
  ListLabel,
  ListRow,
  ListRowChevron,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
import {
  Eyebrow,
  PageActions,
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
import {
  type MouseEvent,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { PlusIcon } from "@/components/icons";
import { CodeDetail } from "@/features/join-codes/code-detail";
import { PhoneCodeDetail } from "@/features/join-codes/code-detail-phone";
import {
  codeByline,
  codeFor,
  codeStatusLabel,
  type StatusLabel,
  usesShort,
} from "@/features/join-codes/describe";
import { CloseIcon } from "@/features/join-codes/icons";
import {
  type InvitationCode,
  joinCodesQueryOptions,
  useJoinCodesNow,
} from "@/features/join-codes/queries";
import { memberCountsQueryOptions } from "@/features/members/queries";
import type { Id } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import { useIsPhone } from "@/lib/use-is-phone";

const FAR_FUTURE = Number.POSITIVE_INFINITY;
/** Codes that stopped working shown before "Show all" (6G1-0). */
const SHOWN_INACTIVE = 2;

/*
 * Below 1024px the detail opens on its own (spec D5O-0, "Join code detail: Sheet"):
 * a 440px sheet from the right on tablets (BJI-0), a full page on phones (9LI-0).
 */
const BELOW_LG_QUERY = "(max-width: 1023.98px)";

function subscribeBelowLg(onChange: () => void): () => void {
  const list = window.matchMedia(BELOW_LG_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

const isBelowLgNow = () => window.matchMedia(BELOW_LG_QUERY).matches;
const notBelowLgOnServer = () => false;

function useIsBelowLg(): boolean {
  return useSyncExternalStore(
    subscribeBelowLg,
    isBelowLgNow,
    notBelowLgOnServer
  );
}

/** Tablet side sheet: overrides the centred dialog between md and lg (BJI-0). */
const SIDE_SHEET_CLASS =
  "md:top-0! md:right-0! md:left-auto! md:h-dvh! md:max-h-none! md:w-[440px]! md:max-w-none! md:translate-x-0! md:translate-y-0! md:rounded-none! md:shadow-[-12px_0_40px_#1111112E]! md:data-open:slide-in-from-right md:data-closed:slide-out-to-right md:data-open:zoom-in-100 md:data-closed:zoom-out-100";

function expiryOrder(code: InvitationCode): number {
  return code.expiresAt ? Date.parse(code.expiresAt) : FAR_FUTURE;
}

/** Working codes, soonest to stop first; then the ones that stopped, newest first. */
export function splitCodes(codes: InvitationCode[]) {
  const active = codes
    .filter((c) => c.status === "active")
    .sort((a, b) => expiryOrder(a) - expiryOrder(b));
  const inactive = codes
    .filter((c) => c.status !== "active")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { active, inactive };
}

function StatusPill({ label }: { label: StatusLabel }) {
  if (label.tone === "off") {
    return (
      <span className="text-muted text-sm leading-[18px]">{label.text}</span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-[10px] py-[3px] font-semibold text-[13px] leading-4",
        label.tone === "soon"
          ? "bg-orange-soft text-orange-deep"
          : "bg-[#E5F5EC] text-success"
      )}
    >
      {label.text}
    </span>
  );
}

interface RowContext {
  now: Date;
  onSelect: (event: MouseEvent<HTMLElement>) => void;
  selectedId: Id | null;
  timeZone: string;
  viewerId: Id;
}

function CodeRow({ code, ctx }: { code: InvitationCode; ctx: RowContext }) {
  const isSelected = code.id === ctx.selectedId;
  const isOff = code.status !== "active";
  return (
    <li>
      <button
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "flex w-full cursor-pointer items-center border-line border-b py-[14px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink",
          isSelected
            ? "-mx-3 w-[calc(100%+24px)] rounded-[14px] border-transparent bg-fog px-3"
            : "hover:bg-fog/50",
          isOff && "opacity-60"
        )}
        data-code-id={code.id}
        onClick={ctx.onSelect}
        type="button"
      >
        <span
          className={cn(
            "w-[170px] shrink-0 font-mono font-semibold text-ink text-sm leading-[18px]",
            code.status === "revoked" && "line-through decoration-1"
          )}
        >
          {code.code}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="font-medium text-[15px] text-ink leading-5">
            {codeFor(code)}
          </span>
          <span className="truncate text-[13px] text-muted leading-4">
            {codeByline(code, ctx.viewerId, ctx.timeZone)}
          </span>
        </span>
        <span className="w-[90px] shrink-0 font-semibold text-ink text-sm leading-[18px]">
          {usesShort(code)}
        </span>
        <span className="flex w-[120px] shrink-0">
          <StatusPill label={codeStatusLabel(code, ctx.now, ctx.timeZone)} />
        </span>
      </button>
    </li>
  );
}

function CodesTable({
  active,
  inactive,
  ctx,
}: {
  active: InvitationCode[];
  inactive: InvitationCode[];
  ctx: RowContext;
}) {
  const [showingAll, setShowingAll] = useState(false);
  const showAll = useCallback(() => setShowingAll(true), []);
  const selectedIndex = inactive.findIndex((c) => c.id === ctx.selectedId);
  // Keep a selected old code in view even when the list is folded.
  const shownCount = Math.max(SHOWN_INACTIVE, selectedIndex + 1);
  const shownInactive = showingAll ? inactive : inactive.slice(0, shownCount);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        aria-hidden="true"
        className="flex items-center border-line border-b py-3 font-medium text-[13px] text-muted leading-4 tracking-label"
      >
        <span className="w-[170px] shrink-0">CODE</span>
        <span className="flex-1">FOR</span>
        <span className="w-[90px] shrink-0">USES</span>
        <span className="w-[120px] shrink-0">STATUS</span>
      </div>
      <ul aria-label="Working codes">
        {active.map((code) => (
          <CodeRow code={code} ctx={ctx} key={code.id} />
        ))}
      </ul>
      {active.length === 0 ? (
        <p className="border-line border-b py-5 text-muted text-sm leading-5">
          No working codes. Make one to let people join.
        </p>
      ) : null}
      {inactive.length > 0 ? (
        <>
          <h2 className="pt-[18px] pb-2 font-medium text-[13px] text-muted leading-4 tracking-label">
            NO LONGER WORKING
          </h2>
          <ul aria-label="Codes that no longer work">
            {shownInactive.map((code) => (
              <CodeRow code={code} ctx={ctx} key={code.id} />
            ))}
          </ul>
          {shownInactive.length < inactive.length ? (
            <div className="flex items-center justify-between gap-4 pt-[18px] text-sm leading-[18px]">
              <p className="text-muted">
                Showing {shownInactive.length} of {inactive.length} codes that
                stopped working
              </p>
              <button
                className="cursor-pointer rounded-sm font-semibold text-ink underline decoration-1 outline-none [text-underline-position:from-font] hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
                onClick={showAll}
                type="button"
              >
                Show all {inactive.length}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PhoneRows({
  codes,
  ctx,
  label,
}: {
  codes: InvitationCode[];
  ctx: RowContext;
  label?: string;
}) {
  if (codes.length === 0) {
    return null;
  }
  return (
    <List>
      {label ? <ListLabel>{label}</ListLabel> : null}
      {codes.map((code) => (
        <ListRow
          className={cn(
            "w-full cursor-pointer",
            code.status !== "active" && "opacity-60"
          )}
          data-code-id={code.id}
          key={code.id}
          onClick={ctx.onSelect}
          render={<button type="button" />}
        >
          <ListRowContent>
            <ListRowTitle
              className={cn(
                "font-mono text-sm",
                code.status === "revoked" && "line-through decoration-1"
              )}
            >
              {code.code}
            </ListRowTitle>
            <ListRowDescription>
              {codeFor(code)} · {usesShort(code)}
            </ListRowDescription>
          </ListRowContent>
          <StatusPill label={codeStatusLabel(code, ctx.now, ctx.timeZone)} />
          <ListRowChevron />
        </ListRow>
      ))}
    </List>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

export type MembersSection = "all" | "invites" | "join-codes";

/**
 * Members → Join codes (Paper 6G1-0), story AO-2: list with uses and status, the
 * selected code's detail on the right (a bottom sheet on phones), copy, extend, revoke.
 */
export function JoinCodesScreen({
  academyId,
  academyName,
  onNew,
  onRevoke,
  onSection,
  onSelect,
  selectedId,
  timeZone,
}: {
  academyId: Id;
  academyName: string;
  onNew: () => void;
  onRevoke: (id: Id) => void;
  onSection: (section: MembersSection) => void;
  onSelect: (id: Id | null) => void;
  selectedId: Id | null;
  timeZone: string;
}) {
  const viewer = useViewer();
  const now = useJoinCodesNow();
  const isPhone = useIsPhone();
  const isBelowLg = useIsBelowLg();
  const isTablet = isBelowLg && !isPhone;
  const codes = useQuery(joinCodesQueryOptions(academyId)).data;
  // Only the tab counts; left out if it fails.
  const counts = useQuery({
    ...memberCountsQueryOptions(academyId),
    throwOnError: false,
  }).data;
  const { active, inactive } = useMemo(() => splitCodes(codes ?? []), [codes]);

  const desktopSelected =
    codes?.find((c) => c.id === selectedId) ?? active[0] ?? inactive[0] ?? null;
  // Below lg nothing is selected until a row is tapped.
  const pickedCode = codes?.find((c) => c.id === selectedId) ?? null;

  const handleSelect = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      onSelect(event.currentTarget.dataset.codeId ?? null);
    },
    [onSelect]
  );
  const handleSection = useCallback(
    (value: unknown) => onSection(value as MembersSection),
    [onSection]
  );
  const handleSheet = useCallback(
    (open: boolean) => {
      if (!open) {
        onSelect(null);
      }
    },
    [onSelect]
  );

  const ctx: RowContext = {
    now,
    onSelect: handleSelect,
    selectedId: isBelowLg
      ? (pickedCode?.id ?? null)
      : (desktopSelected?.id ?? null),
    timeZone,
    viewerId: viewer.user.id,
  };

  let body = <LoadingRows />;
  if (codes && codes.length === 0) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No join codes yet</EmptyTitle>
          <EmptyDescription>
            A code lets people join without their own invite link. Send it on
            WhatsApp, read it out or print it.
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={onNew} size="lg">
          New join code
        </Button>
      </Empty>
    );
  } else if (codes) {
    body = (
      <>
        <div className="flex items-start gap-5 max-md:hidden">
          <CodesTable active={active} ctx={ctx} inactive={inactive} />
          {desktopSelected ? (
            <aside
              aria-label={`Code ${desktopSelected.code}`}
              className="w-[400px] shrink-0 rounded-lg border border-line p-6 max-lg:hidden"
            >
              <CodeDetail
                academyId={academyId}
                code={desktopSelected}
                key={desktopSelected.id}
                now={now}
                onRevoke={onRevoke}
                timeZone={timeZone}
              />
            </aside>
          ) : null}
        </div>
        <div className="flex flex-col gap-6 md:hidden">
          <PhoneRows codes={active} ctx={ctx} />
          <PhoneRows codes={inactive} ctx={ctx} label="No longer working" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            {codes ? `Members · ${active.length} active codes` : " "}
          </Eyebrow>
          <PageTitle>Join codes</PageTitle>
        </PageHeading>
        <PageActions>
          <Button
            className="max-md:px-4 max-md:py-[9px] max-md:text-sm"
            onClick={onNew}
          >
            <PlusIcon />
            <span className="max-md:hidden">New join code</span>
            <span className="md:hidden">New code</span>
          </Button>
        </PageActions>
      </PageHeader>
      <div className="flex flex-col gap-8 max-md:gap-4">
        <Tabs onValueChange={handleSection} value="join-codes">
          <TabsList aria-label="Members">
            <TabsTrigger className="md:text-[15px] md:leading-5" value="all">
              All <TabsCount>{counts?.people}</TabsCount>
            </TabsTrigger>
            <TabsTrigger
              className="md:text-[15px] md:leading-5"
              value="invites"
            >
              Invites{" "}
              <TabsCount tone={counts?.invites ? "alert" : "muted"}>
                {counts?.invites}
              </TabsCount>
            </TabsTrigger>
            <TabsTrigger
              className="md:text-[15px] md:leading-5"
              value="join-codes"
            >
              Join codes <TabsCount>{codes ? active.length : null}</TabsCount>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {body}
      </div>
      <Dialog onOpenChange={handleSheet} open={isTablet && pickedCode !== null}>
        <DialogContent className={SIDE_SHEET_CLASS}>
          {pickedCode ? (
            <>
              <div className="flex shrink-0 items-center justify-between border-line border-b py-[14px] pr-4 pl-6">
                <DialogTitle className="font-sans font-semibold text-[15px] normal-case leading-[18px]">
                  Join code
                </DialogTitle>
                <DialogClose
                  aria-label="Close"
                  className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line text-ink outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <CloseIcon />
                </DialogClose>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-8">
                <CodeDetail
                  academyId={academyId}
                  code={pickedCode}
                  key={pickedCode.id}
                  now={now}
                  onRevoke={onRevoke}
                  timeZone={timeZone}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={handleSheet} open={isPhone && pickedCode !== null}>
        <DialogContent mobile="fullscreen">
          {pickedCode ? (
            <PhoneCodeDetail
              academyId={academyId}
              academyName={academyName}
              code={pickedCode}
              key={pickedCode.id}
              now={now}
              onRevoke={onRevoke}
              timeZone={timeZone}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
