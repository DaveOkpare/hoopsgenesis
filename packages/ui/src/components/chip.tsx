import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Small pill pieces:
 * - <CountryDot country="rwanda" />: the only place country colour appears.
 * - <CountryTag country="india">India</CountryTag>: fog pill with a dot (labels stay ink).
 * - <FilterChip selected>U14 · 6</FilterChip>: single-select filter row (phone Fees,
 *   Cancel-session reasons, Invite team picker). Use aria-pressed semantics via <button>.
 */

const dotColors = {
  india: "bg-india",
  rwanda: "bg-rwanda",
  uganda: "bg-uganda",
} as const;

type CountryKey = keyof typeof dotColors;

function CountryDot({
  country,
  className,
}: {
  country: CountryKey;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full",
        dotColors[country],
        className
      )}
      data-slot="country-dot"
    />
  );
}

function CountryTag({
  country,
  size = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  country: CountryKey;
  size?: "default" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full bg-fog font-medium text-ink",
        size === "default" && "gap-2 px-[14px] py-2 text-[15px] leading-[18px]",
        size === "sm" && "gap-[6px] px-[10px] py-1 text-[13px] leading-4",
        className
      )}
      data-slot="country-tag"
      {...props}
    >
      <CountryDot
        className={size === "default" ? "size-[10px]" : "size-[7px]"}
        country={country}
      />
      {children}
    </span>
  );
}

function FilterChip({
  selected = false,
  size = "default",
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  selected?: boolean;
  size?: "default" | "sm";
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        size === "default" && "px-[13px] py-2 text-sm leading-[18px]",
        size === "sm" && "px-3 py-[6px] text-[13px] leading-4",
        selected
          ? "border-ink bg-ink font-semibold text-white"
          : "border-line bg-white font-medium text-ink hover:bg-fog",
        className
      )}
      data-slot="filter-chip"
      type={type}
      {...props}
    />
  );
}

export type { CountryKey };
export { CountryDot, CountryTag, FilterChip };
