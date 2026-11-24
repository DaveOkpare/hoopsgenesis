/* Header pieces, the clock and URL state shared by both member detail screens. */
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ReactNode } from "react";

import type { MemberProfile } from "@/features/member-detail/queries";
import { localDate } from "@/features/sessions/time";
import type { DateOnly } from "@/features/types";
import { formatRelativeDay, formatTime, initials } from "@/lib/format";
import { appNow } from "@/lib/preview";

export type DetailAction = "move" | "teams" | "role" | "remove";

/** URL state of a detail page: `?month=prev` shows last month, `?action=` a dialog. */
export interface DetailSearch {
  action?: DetailAction;
  month?: "prev";
}

const ACTIONS: readonly DetailAction[] = ["move", "teams", "role", "remove"];

export function parseDetailSearch(raw: Record<string, unknown>): DetailSearch {
  return {
    month: raw.month === "prev" ? "prev" : undefined,
    action: ACTIONS.includes(raw.action as DetailAction)
      ? (raw.action as DetailAction)
      : undefined,
  };
}

/** Today in the academy's zone (the designs' Mon 23 Nov in preview). */
export function useDetailClock(timeZone: string): {
  now: Date;
  today: DateOnly;
} {
  const now = appNow();
  return { now, today: localDate(now, timeZone) };
}

/** "2026-11" and "2026-10" for today "2026-11-23". */
export function monthKeys(today: DateOnly): {
  current: string;
  previous: string;
} {
  const [year = 0, month = 1] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  return { current: today.slice(0, 7), previous: prev };
}

/** "Today, 15:42". */
export function lastSeenText(at: string, timeZone: string, now: Date): string {
  return `${formatRelativeDay(at, timeZone, now)}, ${formatTime(at, timeZone)}`;
}

/** The plain date someone joined, in the academy's zone. */
export function joinedOn(profile: MemberProfile, timeZone: string): DateOnly {
  return localDate(new Date(profile.joinedAt), timeZone);
}

export function isCoachLike(profile: MemberProfile): boolean {
  return profile.roles.includes("coach") || profile.roles.includes("admin");
}

/** "Student", "Coach", "Admin · Coach". */
export function roleLabel(profile: MemberProfile): string {
  const { roles } = profile;
  if (roles.includes("admin")) {
    return roles.includes("coach") ? "Admin · Coach" : "Admin";
  }
  return roles.includes("coach") ? "Coach" : "Student";
}

export function RoleChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-fog px-[10px] py-1 font-semibold text-[13px] text-ink leading-4">
      {children}
    </span>
  );
}

/** "● U14, basketball" (8JO-0). */
export function TeamChip({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-line px-[10px] py-1 font-semibold text-[13px] text-ink leading-4">
      <span
        aria-hidden="true"
        className="size-[7px] shrink-0 rounded-full bg-orange"
      />
      {children}
    </span>
  );
}

/** The 64px initials disc on phone (7F2-0 orange for students, CHQ-0 ink for staff). */
export function PhoneAvatar({
  name,
  tone,
}: {
  name: string;
  tone: "orange" | "ink";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-16 shrink-0 items-center justify-center rounded-full font-display text-[26px] leading-7",
        tone === "orange" ? "bg-orange text-ink" : "bg-ink text-white"
      )}
    >
      {initials(name)}
    </span>
  );
}

/** "Remove from the academy" (red text link, 8JO-0 / DNS-0). */
export function DangerLink({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "-mx-1 min-h-11 w-fit cursor-pointer rounded-sm px-1 text-left font-semibold text-[#C0392B] text-sm leading-[18px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-orange-deep",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
