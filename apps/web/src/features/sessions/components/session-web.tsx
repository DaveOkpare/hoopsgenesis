/*
 * Session screens at md and up:
 *   SessionWebLive   check-in open or still to come (91C-0 "[Coach · Web] Live session").
 *                    Ticking stays on the phone (spec 5OE-0: live ticking is view only
 *                    on coach web); checking in by hand works here.
 *   SessionWebReview ended: not closed out (GFQ-0, HRK-0) or closed out.
 */
import { Button } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";

import { GET_THE_APP_HREF } from "@/components/app-shell/phone-nudge-card";
import { Pill } from "@/features/events/components/detail-parts";
import { longDate, shortDate, timesLabel } from "@/features/events/model";
import {
  closedOutBy,
  closesAtLabel,
  isClosedOut,
  markedBy,
  opensAtLabel,
  personLabel,
  type SessionCounts,
  type StatusTally,
  sessionTitle,
} from "@/features/sessions/model";
import type { Session, SessionEntry } from "@/features/sessions/queries";
import { formatWeekdayDayMonth, localTime } from "@/features/sessions/time";
import type { Id } from "@/features/types";
import { initials } from "@/lib/format";

const PERCENT = 100;
/** "Not yet" rows shown before "Show N more" (91C-0). */
const NOT_YET_PREVIEW = 4;
/** Review rows shown before "Show all N students" (GFQ-0). */
const REVIEW_PREVIEW = 6;

export interface SessionActions {
  canManage: boolean;
  isAdmin: boolean;
  onChange: (event: MouseEvent<HTMLElement>) => void;
  onCheckIn: (event: MouseEvent<HTMLButtonElement>) => void;
  onMarkAbsent: () => void;
  onOpenCancel: () => void;
  onTickOne: (event: MouseEvent<HTMLElement>) => void;
  pending: boolean;
}

/** What may be done to one row after the session (mirrors the server's rules). */
export function rowActions(
  entry: SessionEntry,
  actions: Pick<SessionActions, "canManage" | "isAdmin">
): { change: boolean; tick: boolean } {
  const row = entry.attendance;
  const arrived = row?.status === "present" || row?.status === "late";
  return {
    // Recording is for coaches of the team and admins; replacing a row needs a void,
    // which only academy admins may do.
    change: actions.canManage && (!row || actions.isAdmin),
    tick: actions.canManage && arrived && !row?.verifiedAt,
  };
}

function Face({ entry, tone }: { entry: SessionEntry; tone: "soft" | "fog" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full font-semibold text-[12px] text-ink leading-4",
        tone === "soft" ? "bg-orange-soft" : "bg-fog"
      )}
    >
      {initials(entry.student.name)}
    </span>
  );
}

function SmallPill({
  tone,
  children,
}: {
  tone: "fog" | "soft";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-[2px] font-semibold text-[12px] leading-4",
        tone === "fog"
          ? "bg-fog text-ink-soft"
          : "bg-orange-soft text-orange-deep"
      )}
    >
      {children}
    </span>
  );
}

function LiveBadge({ session }: { session: Session }) {
  if (session.status === "open") {
    return (
      <span className="flex items-center gap-[10px] rounded-full bg-orange px-[14px] py-2 font-semibold text-[13px] text-ink uppercase leading-5 tracking-[0.06em]">
        <span aria-hidden="true" className="size-2 rounded-full bg-ink" />
        Live · check-in closes {closesAtLabel(session)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-fog px-[14px] py-2 font-semibold text-[13px] text-ink uppercase leading-5 tracking-[0.06em]">
      Check-in opens {opensAtLabel(session)}
    </span>
  );
}

function howCheckedIn(entry: SessionEntry, viewerId: Id): string {
  const row = entry.attendance;
  if (!row) {
    return "";
  }
  if (row.checkInDistanceM !== null) {
    return row.verifiedAt ? "Scanned · ticked" : "Scanned the QR";
  }
  return `Checked in by ${personLabel(row.recordedBy, viewerId)}`;
}

function matches(entry: SessionEntry, query: string): boolean {
  return entry.student.name.toLowerCase().includes(query.trim().toLowerCase());
}

/** 91C-0: who is in, who is not yet, and the counts beside them. */
export function SessionWebLive({
  session,
  back,
  checkedIn,
  notYet,
  counts,
  viewerId,
  query,
  onQuery,
  actions,
}: {
  session: Session;
  back: ReactNode;
  checkedIn: SessionEntry[];
  notYet: SessionEntry[];
  counts: SessionCounts;
  viewerId: Id;
  query: string;
  onQuery: (query: string) => void;
  actions: SessionActions;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const handleQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onQuery(event.target.value),
    [onQuery]
  );
  const shownIn = checkedIn.filter((e) => matches(e, query));
  const waiting = notYet.filter((e) => matches(e, query));
  const shownWaiting =
    expanded || query ? waiting : waiting.slice(0, NOT_YET_PREVIEW);
  const hidden = waiting.length - shownWaiting.length;
  const open = session.status === "open";
  const scanned = session.roster.filter(
    (e) => e.attendance?.checkInDistanceM !== null && e.attendance?.checkInAt
  ).length;
  const late = session.roster.filter(
    (e) => e.attendance?.status === "late"
  ).length;
  const total = Math.max(1, counts.total);
  const hasCheckIns = session.roster.some((e) => e.attendance);
  const location = session.event.location ? ` · ${session.event.location}` : "";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-end justify-between gap-4 max-lg:flex-col max-lg:items-start">
        <div className="flex flex-col gap-2">
          {back}
          <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label">
            {formatWeekdayDayMonth(session.sessionDate)} ·{" "}
            {session.event.startTime
              ? `${session.event.startTime} – ${session.event.endTime ?? ""}`
              : "All day"}
            {location}
          </p>
          <h1 className="font-display text-display-sm text-ink uppercase leading-[52px]">
            {sessionTitle(session)}
          </h1>
        </div>
        <LiveBadge session={session} />
      </header>

      <div className="flex items-start gap-5 max-lg:flex-col max-lg:items-stretch">
        <section
          aria-label="Students"
          className="flex min-w-0 flex-1 flex-col rounded-lg border border-line p-6"
        >
          <div className="flex items-center justify-between gap-3 pb-[10px]">
            <h2 className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
              Checked in · {checkedIn.length}
            </h2>
            <label className="flex w-[220px] shrink-0 items-center gap-2 rounded-full border border-line px-[14px] py-[7px] focus-within:ring-2 focus-within:ring-ink">
              <svg
                aria-hidden="true"
                height="14"
                viewBox="0 0 16 16"
                width="14"
              >
                <circle
                  cx="7"
                  cy="7"
                  fill="none"
                  r="5"
                  stroke="#6B6B6B"
                  strokeWidth="1.6"
                />
                <path
                  d="M11 11l3 3"
                  stroke="#6B6B6B"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
              </svg>
              <span className="sr-only">Find a student</span>
              <input
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink leading-4 outline-none placeholder:text-muted"
                onChange={handleQuery}
                placeholder="Find a student"
                type="search"
                value={query}
              />
            </label>
          </div>
          {shownIn.length === 0 ? (
            <p className="border-line border-t py-4 text-muted text-sm leading-5">
              {query
                ? "Nobody checked in matches that name."
                : "Nobody has checked in yet."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {shownIn.map((entry) => (
                <li
                  className="flex items-center gap-[14px] border-line border-t py-3"
                  key={entry.student.id}
                >
                  <Face entry={entry} tone="soft" />
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-semibold text-[15px] text-ink leading-5">
                      {entry.student.name}
                    </span>
                    {entry.attendance?.status === "late" ? (
                      <SmallPill tone="fog">Late</SmallPill>
                    ) : null}
                  </span>
                  <span className="w-[150px] shrink-0 text-[13px] text-muted leading-4">
                    {howCheckedIn(entry, viewerId)}
                  </span>
                  <span className="w-16 shrink-0 font-semibold text-[15px] text-ink leading-5">
                    {entry.attendance?.checkInAt
                      ? localTime(
                          new Date(entry.attendance.checkInAt),
                          session.timeZone
                        )
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="border-line border-t pt-[22px] pb-[10px] font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
            Not yet · {notYet.length}
          </h2>
          <ul className="flex flex-col">
            {shownWaiting.map((entry) => (
              <li
                className="flex items-center gap-[14px] border-line border-t py-3"
                key={entry.student.id}
              >
                <Face entry={entry} tone="fog" />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-semibold text-[15px] text-ink leading-5">
                    {entry.student.name}
                  </span>
                  {entry.student.feesOverdueDays ? (
                    <SmallPill tone="soft">
                      Fees {entry.student.feesOverdueDays} days late
                    </SmallPill>
                  ) : null}
                </span>
                <span className="w-[150px] shrink-0 text-[13px] text-muted leading-4">
                  {open ? "No scan yet" : `Opens ${opensAtLabel(session)}`}
                </span>
                <span className="flex w-[142px] shrink-0 justify-end">
                  {open && actions.canManage ? (
                    <Button
                      className="h-auto rounded-full border-ink px-[14px] py-[7px] text-[13px] leading-4"
                      data-student-id={entry.student.id}
                      onClick={actions.onCheckIn}
                      variant="outline"
                    >
                      Check in
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {waiting.length === 0 ? (
            <p className="border-line border-t py-4 text-muted text-sm leading-5">
              {query ? "Nobody else matches that name." : "Everyone is in."}
            </p>
          ) : null}
          {hidden > 0 || (expanded && waiting.length > NOT_YET_PREVIEW) ? (
            <div className="flex justify-center border-line border-t pt-4">
              <Button
                aria-expanded={expanded}
                className="h-auto px-0 py-1 font-semibold text-ink text-sm leading-[18px] underline underline-offset-2 hover:bg-transparent"
                onClick={toggle}
                variant="ghost"
              >
                {expanded ? "Show fewer" : `Show ${hidden} more`}
              </Button>
            </div>
          ) : null}
        </section>

        <aside className="flex w-[380px] shrink-0 flex-col gap-4 max-lg:w-full">
          <section className="flex flex-col gap-[14px] rounded-lg bg-fog p-6">
            <p className="flex items-end gap-[10px]">
              <span className="font-display text-[64px] text-ink leading-[60px]">
                {counts.arrived}
              </span>
              <span className="pb-[6px] font-semibold text-base text-ink leading-[22px]">
                of {counts.total} checked in
              </span>
            </p>
            <div
              aria-label={`${counts.arrived} of ${counts.total} checked in, ${counts.ticked} ticked`}
              className="flex h-[10px] overflow-hidden rounded-full bg-[#E0E0DC]"
              role="img"
            >
              <span
                className="bg-ink"
                style={{ width: `${(counts.ticked / total) * PERCENT}%` }}
              />
              <span
                className="bg-[#8A8A8A]"
                style={{
                  width: `${((counts.arrived - counts.ticked) / total) * PERCENT}%`,
                }}
              />
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted leading-4">
              <span>{scanned} scanned</span>
              <span>{counts.tickedByViewer} ticked by you</span>
              <span>{late} late</span>
            </p>
          </section>
          {open ? (
            <section className="flex items-center gap-[14px] rounded-[20px] bg-ink p-[18px]">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-orange">
                <svg
                  aria-hidden="true"
                  height="18"
                  viewBox="0 0 18 18"
                  width="18"
                >
                  <rect
                    fill="none"
                    height="15"
                    rx="2"
                    stroke="#111111"
                    strokeWidth="1.8"
                    width="9"
                    x="4.5"
                    y="1.5"
                  />
                </svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="font-semibold text-[15px] text-white leading-5">
                  Tick on your phone
                </span>
                <span className="text-[#BDBDBD] text-[13px] leading-[17px]">
                  At the court, ticking students is faster in the app. Here you
                  can watch check-ins come in.{" "}
                  <a
                    className="font-semibold text-white underline"
                    href={GET_THE_APP_HREF}
                  >
                    Get the app
                  </a>
                </span>
              </span>
            </section>
          ) : null}
          <section className="flex flex-col gap-3 rounded-[20px] border border-line p-5">
            <h2 className="font-semibold text-[15px] text-ink leading-5">
              After the session
            </h2>
            <p className="text-[13px] text-muted leading-[18px]">
              At {closesAtLabel(session)} you can mark everyone who didn't come
              as absent in one go.
            </p>
            <Button
              className="h-auto self-start rounded-full bg-fog px-4 py-[9px] text-[#9A9A9A] text-sm leading-[18px] disabled:opacity-100"
              disabled
              variant="secondary"
            >
              Close out at {closesAtLabel(session)}
            </Button>
            {actions.canManage ? (
              <div className="border-line border-t pt-3">
                {hasCheckIns ? (
                  <p className="text-[13px] text-muted leading-[18px]">
                    You can't cancel this session because students have already
                    checked in.
                  </p>
                ) : (
                  <Button
                    className="h-auto rounded-full border-orange-deep px-4 py-[9px] text-orange-deep text-sm leading-[18px] hover:bg-orange-soft"
                    onClick={actions.onOpenCancel}
                    variant="outline"
                  >
                    Cancel this session
                  </Button>
                )}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function statusPill(entry: SessionEntry) {
  const status = entry.attendance?.status;
  if (!status) {
    return (
      <Pill className="text-[13px]" tone="soft">
        Not marked
      </Pill>
    );
  }
  const label = `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  return (
    <Pill
      className="text-[13px]"
      tone={status === "present" ? "success" : "fog"}
    >
      {label}
    </Pill>
  );
}

/** "Change status", "Tick" for one row; nothing when the viewer may do neither. */
function RowMenu({
  entry,
  actions,
}: {
  entry: SessionEntry;
  actions: SessionActions;
}) {
  const allowed = rowActions(entry, actions);
  if (!(allowed.change || allowed.tick)) {
    return <span className="w-11 shrink-0" />;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${entry.student.name}`}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full font-bold text-[15px] text-muted outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink"
      >
        ···
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {allowed.change ? (
          <DropdownMenuItem
            data-student-id={entry.student.id}
            onClick={actions.onChange}
          >
            {entry.attendance ? "Change status" : "Mark attendance"}
          </DropdownMenuItem>
        ) : null}
        {allowed.tick && entry.attendance ? (
          <DropdownMenuItem
            data-attendance-id={entry.attendance.id}
            onClick={actions.onTickOne}
          >
            Tick: I saw them
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function reviewOrder(roster: SessionEntry[]): SessionEntry[] {
  const rank = (e: SessionEntry) => {
    const status = e.attendance?.status;
    if (!status) {
      return 0;
    }
    return status === "present" || status === "late" ? 1 : 2;
  };
  return [...roster].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.attendance?.checkInAt ?? "").localeCompare(
        b.attendance?.checkInAt ?? ""
      ) ||
      a.student.name.localeCompare(b.student.name)
  );
}

function Tile({
  label,
  value,
  tone = "fog",
  valueClass,
}: {
  label: string;
  value: number;
  tone?: "fog" | "soft";
  valueClass?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[6px] rounded-[20px] px-5 py-[18px]",
        tone === "soft" ? "bg-orange-soft" : "bg-fog"
      )}
    >
      <span
        className={cn(
          "font-medium text-sm leading-[18px]",
          tone === "soft" ? "text-orange-deep" : "text-muted"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-display text-2xl leading-10",
          tone === "soft" ? "text-orange-deep" : "text-ink",
          valueClass
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** "U16 · SAT 21 NOV" */
export function reviewTitle(session: Session): string {
  const day = shortDate(session.sessionDate);
  return session.team
    ? `${session.team.name} · ${day}`
    : `${session.event.title} · ${day}`;
}

/** GFQ-0 / HRK-0: the ended session, its counts and every student's row. */
export function SessionWebReview({
  session,
  back,
  tally,
  viewerId,
  actions,
}: {
  session: Session;
  back: ReactNode;
  tally: StatusTally;
  viewerId: Id;
  actions: SessionActions;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const rows = reviewOrder(session.roster);
  const shown = expanded ? rows : rows.slice(0, REVIEW_PREVIEW);
  const closedOut = isClosedOut(session);
  const closer = closedOutBy(session);
  const location = session.event.location ? ` · ${session.event.location}` : "";
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-[14px]">
        {back}
        <div className="flex items-end justify-between gap-4 max-lg:flex-col max-lg:items-start">
          <div className="flex flex-col gap-2">
            <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label">
              {longDate(session.sessionDate)} ·{" "}
              {timesLabel(session.event.startTime, session.event.endTime)}
              {location}
            </p>
            <h1 className="font-display text-display-sm text-ink uppercase leading-[95%] tracking-[-0.005em]">
              {reviewTitle(session)}
            </h1>
          </div>
          {closedOut ? (
            <span className="flex items-center gap-[6px] rounded-full bg-fog px-[14px] py-2 font-semibold text-ink text-sm leading-[18px]">
              <svg
                aria-hidden="true"
                height="14"
                viewBox="0 0 16 16"
                width="14"
              >
                <path
                  d="M3.5 8.5l3 3 6-7"
                  fill="none"
                  stroke="#111111"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              {closer
                ? `Closed out by ${personLabel(closer, viewerId)}`
                : "Closed out"}
            </span>
          ) : (
            <span className="rounded-full bg-orange-soft px-[14px] py-2 font-semibold text-orange-deep text-sm leading-[18px]">
              Not closed out
            </span>
          )}
        </div>
      </header>

      {tally.notMarked > 0 && actions.canManage ? (
        <section className="flex items-center gap-[18px] rounded-[20px] bg-ink px-6 py-5 max-lg:flex-col max-lg:items-start">
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="font-semibold text-lg text-white leading-[22px]">
              {tally.notMarked}{" "}
              {tally.notMarked === 1 ? "student was" : "students were"} never
              marked
            </h2>
            <p className="text-[#B5B5B5] text-sm leading-5">
              Close out the session to mark them absent.
              {actions.isAdmin ? " You can still change any row after." : ""}
            </p>
          </div>
          <Button
            className="h-auto rounded-full px-5 py-[13px] text-[15px] leading-[18px]"
            disabled={actions.pending}
            onClick={actions.onMarkAbsent}
            variant="brand"
          >
            Mark {tally.notMarked} absent and close
          </Button>
        </section>
      ) : null}

      <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3">
        <Tile label="Present" value={tally.present} valueClass="text-success" />
        <Tile label="Late" value={tally.late} />
        <Tile label="Absent" value={tally.absent} />
        <Tile label="Excused" value={tally.excused} />
        {tally.notMarked > 0 ? (
          <Tile label="Not marked" tone="soft" value={tally.notMarked} />
        ) : null}
      </div>

      <section
        aria-label="Students"
        className="flex flex-col rounded-[20px] border border-line px-6 pt-2 pb-4"
      >
        <div
          aria-hidden="true"
          className="flex items-center gap-4 border-line border-b py-3 font-semibold text-[12px] text-muted leading-4 tracking-label max-lg:hidden"
        >
          <span className="w-9 shrink-0" />
          <span className="flex-1">STUDENT</span>
          <span className="w-[140px] shrink-0">STATUS</span>
          <span className="w-[100px] shrink-0">IN</span>
          <span className="w-[100px] shrink-0">OUT</span>
          <span className="w-[200px] shrink-0">MARKED BY</span>
          <span className="w-11 shrink-0" />
        </div>
        {rows.length === 0 ? (
          <p className="py-5 text-[15px] text-muted leading-5">
            Nobody is on this session's roster.
          </p>
        ) : null}
        <ul className="flex flex-col">
          {shown.map((entry) => {
            const row = entry.attendance;
            const inAt = row?.checkInAt
              ? localTime(new Date(row.checkInAt), session.timeZone)
              : null;
            const outAt = row?.checkOutAt
              ? localTime(new Date(row.checkOutAt), session.timeZone)
              : null;
            return (
              <li
                className="flex items-center gap-4 border-line border-b py-3 max-lg:gap-3"
                key={entry.student.id}
              >
                <Face entry={entry} tone="fog" />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate font-semibold text-[15px] text-ink leading-5">
                    {entry.student.name}
                  </span>
                  <span className="text-[13px] text-muted leading-4 lg:hidden">
                    {[
                      inAt ? `in ${inAt}` : null,
                      outAt ? `out ${outAt}` : null,
                      markedBy(entry, viewerId),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex w-[140px] shrink-0 max-lg:w-auto">
                  {statusPill(entry)}
                </span>
                <span
                  className={cn(
                    "w-[100px] shrink-0 text-[15px] leading-5 max-lg:hidden",
                    inAt ? "text-ink" : "text-muted"
                  )}
                >
                  {inAt ?? "None"}
                </span>
                <span
                  className={cn(
                    "w-[100px] shrink-0 text-[15px] leading-5 max-lg:hidden",
                    outAt ? "text-ink" : "text-muted"
                  )}
                >
                  {outAt ?? "None"}
                </span>
                <span className="w-[200px] shrink-0 text-[15px] text-muted leading-5 max-lg:hidden">
                  {markedBy(entry, viewerId)}
                </span>
                <RowMenu actions={actions} entry={entry} />
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-4 pt-[14px] max-lg:flex-col max-lg:items-start">
          {rows.length > REVIEW_PREVIEW ? (
            <Button
              aria-expanded={expanded}
              className="h-auto px-0 py-1 font-semibold text-ink text-sm leading-[18px] underline underline-offset-2 hover:bg-transparent"
              onClick={toggle}
              variant="ghost"
            >
              {expanded ? "Show fewer" : `Show all ${rows.length} students`}
            </Button>
          ) : (
            <span />
          )}
          <p className="text-muted text-sm leading-[18px]">
            Every change here is saved to the activity log with who made it.
          </p>
        </div>
      </section>
    </div>
  );
}
