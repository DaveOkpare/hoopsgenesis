/* Small pieces shared by the event and session detail screens (DZQ-0, F26-0, G4Z-0, GFQ-0). */
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ReactNode } from "react";

import { BackIcon } from "@/components/coach/coach-icons";
import { dayNumber, monthShort, weekdayShort } from "@/features/events/model";
import type { DateOnly } from "@/features/types";

/** 16px grey chevron at the end of a row. */
export function RowChevron({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0", className)}
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M6 3l5 5-5 5"
        fill="none"
        stroke="#6B6B6B"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/** "‹ Calendar" text link above the page title (web: muted 15/500, phone: ink). */
export function BackText({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-[6px] font-medium text-[15px] text-muted leading-5 max-md:gap-1 max-md:text-ink">
      <BackIcon className="max-md:hidden" size={14} />
      <BackIcon className="md:hidden" size={16} />
      {children}
    </span>
  );
}

export const backLinkClass =
  "flex w-fit min-h-11 items-center rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink md:min-h-0";

/** "23 / MON NOV" date block. Web: 64px column; phone: 44px with weekday only. */
export function DateBlock({
  date,
  struck = false,
}: {
  date: DateOnly;
  struck?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex w-16 shrink-0 flex-col max-md:w-11"
    >
      <span
        className={cn(
          "font-display text-[26px] leading-7 max-md:text-xl max-md:leading-[26px]",
          struck ? "text-muted line-through decoration-1" : "text-ink"
        )}
      >
        {dayNumber(date)}
      </span>
      <span className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label max-md:text-[11px] max-md:leading-[14px] max-md:tracking-[0.06em]">
        {weekdayShort(date)}
        <span className="max-md:hidden"> {monthShort(date)}</span>
      </span>
    </span>
  );
}

type PillTone = "fog" | "ink" | "soft" | "muted" | "success";

const PILL_TONE: Record<PillTone, string> = {
  fog: "bg-fog text-ink",
  muted: "bg-fog text-muted",
  ink: "bg-ink text-white",
  soft: "bg-orange-soft text-orange-deep",
  success: "bg-[#E3F4EA] text-success",
};

/** Rounded status pill ("Today", "Cancelled", "Closed out", "Not closed"). */
export function Pill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-[10px] py-[5px] font-semibold text-[12px] leading-4 max-md:px-[9px] max-md:py-1",
        PILL_TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** A "When · Mon and Wed, 15:30 to 17:00" row of a details list. */
export function FactRow({
  label,
  children,
  size = "default",
}: {
  label: string;
  children: ReactNode;
  size?: "default" | "lg";
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 border-line border-b last:border-b-0",
        size === "lg" ? "py-4 max-md:py-3" : "py-3"
      )}
    >
      <dt
        className={cn(
          "shrink-0 text-muted leading-5",
          size === "lg" ? "text-base max-md:text-[15px]" : "text-[15px]"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "text-right font-medium text-ink leading-5",
          size === "lg" ? "text-base max-md:text-[15px]" : "text-[15px]"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** Uppercase section label ("COMING UP · 7 DATES", "DETAILS"). */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-medium text-[13px] text-muted uppercase leading-4 tracking-label",
        className
      )}
    >
      {children}
    </h2>
  );
}

/** Grey shapes for a detail page while it loads (spec AGW-0: no spinners). */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-8 max-md:gap-5">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-12 w-72 max-md:h-11" />
      </div>
      <div className="flex items-start gap-6 max-lg:flex-col">
        <div className="flex w-full flex-col gap-2 rounded-[20px] border border-line p-6 max-md:border-0 max-md:p-0">
          {["a", "b", "c", "d"].map((key) => (
            <div className="flex items-center gap-4 py-3" key={key}>
              <Skeleton className="h-10 w-12" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-72 w-[380px] shrink-0 rounded-[20px] max-md:hidden max-lg:w-full" />
      </div>
    </div>
  );
}
