/* Small controls shared by the calendar and attendance screens (Paper 8BX-0, 8EI-0). */
import { Tabs, TabsList, TabsTrigger } from "@hoops-genesis/ui/components/tabs";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type ReactNode, useCallback } from "react";

import { type TeamTone, TONE_BG } from "@/features/calendar/tone";

export function ChevronIcon({
  direction = "right",
  className,
  size = 16,
}: {
  direction?: "left" | "right";
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 16 16"
      width={size}
    >
      <path
        d={
          direction === "left"
            ? "M10 3.5L5.5 8l4.5 4.5"
            : "M6 3.5l4.5 4.5L6 12.5"
        }
      />
    </svg>
  );
}

/** Round previous / next button (34px, 36px on the coach toolbar). */
export function ArrowButton({
  direction,
  label,
  onClick,
  disabled,
  className,
}: {
  direction: "left" | "right";
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-ink outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent max-md:size-11",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <ChevronIcon direction={direction} size={14} />
    </button>
  );
}

/** Two or more pill tabs used as a view switch ("Month | Agenda", "Week | Month"). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "default",
  className,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const handleChange = useCallback(
    (next: unknown) => {
      const match = options.find((option) => option.value === next);
      if (match) {
        onChange(match.value);
      }
    },
    [onChange, options]
  );
  return (
    <Tabs className={className} onValueChange={handleChange} value={value}>
      <TabsList aria-label={label}>
        {options.map((option) => (
          <TabsTrigger
            className={cn(
              size === "sm" && "px-[14px] py-[7px] text-[13px] leading-4"
            )}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Filter pill: ink when selected, outlined with an optional team dot otherwise. */
export function TeamChip({
  selected,
  tone,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  tone?: TeamTone;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-[6px] whitespace-nowrap rounded-full border px-[13px] py-[7px] text-[13px] leading-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        selected
          ? "border-ink bg-ink font-semibold text-white"
          : "border-line bg-white font-medium text-ink hover:bg-fog",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {tone && !selected ? (
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", TONE_BG[tone])}
        />
      ) : null}
      {children}
    </button>
  );
}

/** Thin progress bar for rates (fog track, ink or orange fill). */
export function RateBar({
  rate,
  className,
  alert,
}: {
  rate: number | null;
  className?: string;
  alert?: boolean;
}) {
  const PERCENT = 100;
  const width = rate === null ? 0 : Math.round(rate * PERCENT);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-2 shrink-0 overflow-hidden rounded-full bg-fog",
        className
      )}
    >
      <span
        className={cn("h-full rounded-full", alert ? "bg-orange" : "bg-ink")}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}
