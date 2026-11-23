import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Metric tile (Dashboard, Fees, phone Home).
 * <Stat>
 *   <StatLabel>Outstanding fees</StatLabel>
 *   <StatValue unit="RWF">420,000</StatValue>
 *   <StatHint><strong className="font-semibold text-orange-deep">14 students</strong> for November</StatHint>
 * </Stat>
 * Desktop: 22px padding, 52px Anton number. Phone: 14px padding, 40px number.
 * Pass `render` via a wrapping <Link> when the tile navigates; `arrow` shows the ↗.
 */

function Stat({
  className,
  tone = "fog",
  ...props
}: React.ComponentProps<"div"> & { tone?: "fog" | "soft" | "ink" }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[14px] rounded-[20px] p-[22px] max-md:gap-2 max-md:rounded-[18px] max-md:p-[14px]",
        tone === "fog" && "bg-fog text-ink",
        tone === "soft" && "bg-orange-soft text-ink",
        tone === "ink" && "bg-ink text-white",
        className
      )}
      data-slot="stat"
      data-tone={tone}
      {...props}
    />
  );
}

function StatLabel({
  className,
  children,
  arrow = false,
  ...props
}: React.ComponentProps<"div"> & { arrow?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 font-medium text-muted text-sm leading-[18px] max-md:font-regular",
        className
      )}
      data-slot="stat-label"
      {...props}
    >
      <span>{children}</span>
      {arrow ? (
        <svg
          aria-hidden="true"
          className="shrink-0 max-md:hidden"
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <path
            d="M5 11l6-6M6 5h5v5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      ) : null}
    </div>
  );
}

function StatValue({
  className,
  children,
  unit,
  ...props
}: React.ComponentProps<"div"> & { unit?: React.ReactNode }) {
  return (
    <div
      className={cn("flex items-end gap-[6px]", className)}
      data-slot="stat-value"
      {...props}
    >
      {unit ? (
        <span className="pb-1 font-semibold text-base text-muted leading-4">
          {unit}
        </span>
      ) : null}
      <span className="font-display text-[52px] leading-[90%] max-md:text-[40px]">
        {children}
      </span>
    </div>
  );
}

function StatHint({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-muted text-sm leading-[18px] max-md:text-[13px] max-md:leading-4",
        className
      )}
      data-slot="stat-hint"
      {...props}
    />
  );
}

export { Stat, StatHint, StatLabel, StatValue };
