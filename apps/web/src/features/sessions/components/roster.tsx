import { Button } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type MouseEvent, type ReactNode, useState } from "react";

import { TickIcon } from "@/components/coach/coach-icons";
import type { SessionEntry } from "@/features/sessions/queries";
import { initials } from "@/lib/format";

/** 40px photo stand-in from 3O4-0 (tinted while present, fog + muted when not here). */
export function StudentFace({
  entry,
  muted = false,
  size = 40,
}: {
  entry: SessionEntry;
  muted?: boolean;
  size?: 40 | 52;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === 40
          ? "size-10 text-[13px] leading-4"
          : "size-[52px] text-base leading-5",
        muted ? "bg-fog text-muted" : "text-ink"
      )}
      style={muted ? undefined : { backgroundColor: entry.student.tint }}
    >
      {initials(entry.student.name)}
    </span>
  );
}

/** "FEES 18D" tag (CO-7): read-only, from GET /fees/outstanding. */
function FeesTag({ days }: { days: number }) {
  return (
    <span
      className="shrink-0 rounded-full bg-orange-soft px-[7px] py-px font-bold text-[11px] text-orange-deep leading-[14px]"
      title={`Fees ${days} days overdue`}
    >
      FEES {days}D
    </span>
  );
}

export function RosterGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="pb-1 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
      {children}
    </h2>
  );
}

export function RosterRow({
  entry,
  description,
  muted = false,
  trailing,
}: {
  entry: SessionEntry;
  description: ReactNode;
  muted?: boolean;
  trailing?: ReactNode;
}) {
  const days = entry.student.feesOverdueDays;
  return (
    <li className="flex items-center gap-3 border-line border-b py-[10px] last:border-b-0">
      <StudentFace entry={entry} muted={muted} />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="flex min-w-0 items-center gap-[6px]">
          <p
            className={cn(
              "truncate font-semibold text-[15px] leading-[18px]",
              muted ? "text-muted" : "text-ink"
            )}
          >
            {entry.student.name}
          </p>
          {days ? <FeesTag days={days} /> : null}
        </div>
        <p className="text-[13px] text-muted leading-4">{description}</p>
      </div>
      {trailing}
    </li>
  );
}

const tickBase =
  "flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink";

/**
 * The large checkmark (CO-3). Phone: a button (tick, or untick until the window
 * closes). Web at md and up: view only, per the "Phone first, web works" spec.
 */
export function TickControl({
  name,
  ticked,
  canUntick,
  pending,
  onToggle,
}: {
  name: string;
  ticked: boolean;
  canUntick: boolean;
  pending: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const look = ticked ? "bg-ink text-white" : "bg-white text-[#C8C8C8]";
  return (
    <>
      <button
        aria-label={ticked ? `Untick ${name}` : `Tick ${name}`}
        aria-pressed={ticked}
        className={cn(
          tickBase,
          look,
          "cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-default md:hidden"
        )}
        disabled={pending || (ticked && !canUntick)}
        onClick={onToggle}
        type="button"
      >
        <TickIcon />
      </button>
      <span
        aria-label={ticked ? "Ticked" : "Not ticked yet"}
        className={cn(tickBase, look, "max-md:hidden")}
        role="img"
      >
        <TickIcon />
      </span>
    </>
  );
}

/** "+ 8 more, all ticked · Show" collapse under the checked-in group. */
export function useCollapsedTicked(entries: SessionEntry[]) {
  const [expanded, setExpanded] = useState(false);
  const unticked = entries.filter((e) => !e.attendance?.verifiedAt);
  const ticked = entries.filter((e) => e.attendance?.verifiedAt);
  const MIN_ROWS = 3;
  const keep = Math.max(1, MIN_ROWS - unticked.length);
  const hidden = expanded ? 0 : Math.max(0, ticked.length - keep);
  return {
    visible: [...unticked, ...ticked.slice(0, ticked.length - hidden)],
    hiddenCount: Math.max(0, ticked.length - keep),
    expanded,
    toggle: () => setExpanded((value) => !value),
  };
}

export function MoreTickedRow({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <div className="flex items-center justify-between py-3">
      <p className="text-muted text-sm leading-[18px]">
        {expanded ? `${count} ticked shown` : `+ ${count} more, all ticked`}
      </p>
      <Button
        aria-expanded={expanded}
        className="h-auto px-0 py-0 hover:bg-transparent hover:underline"
        onClick={onToggle}
        size="sm"
        variant="ghost"
      >
        {expanded ? "Hide" : "Show"}
      </Button>
    </div>
  );
}
