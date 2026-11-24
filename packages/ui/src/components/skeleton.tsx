import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Loading placeholders ("[Spec] Empty, loading and error states" AGW-0, "[Admin ·
 * Mobile] Members · loading" BPI-0). Grey shapes where the real content goes; no
 * spinners on pages. Keep the page title and main button usable while data loads and
 * swap only the area that holds the data.
 *
 *   <Skeleton className="h-4 w-32" />          one shape; match the radius of what it stands in for
 *   <SkeletonList rows={5} />                   phone list rows (36px avatar, two lines); `trailing`
 *                                               adds a right-hand pill, `avatar={false}` drops it
 *   <SkeletonTable rows={6} />                  desktop table rows at table height (≈61px), with a header line
 *   <SkeletonStats count={4} />                 stat tiles at the real <Stat> size (2 by 2 on phones)
 *   <SkeletonCard lines={3} />                  a bordered card with a title line and text lines
 *
 * Each composite is announced once as "Loading…" (role="status"); the shapes are hidden
 * from screen readers.
 */

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-[10px] bg-fog", className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

/** Strong shape (names, avatars) and soft shape (second lines), as in Paper. */
const STRONG = "animate-pulse bg-[#ececE9]";
/** Shapes inside a fog stat tile (a shade darker so they show on fog). */
const ON_FOG = "animate-pulse bg-[#e4e4e0]";
const ON_FOG_SOFT = "animate-pulse bg-[#ebebe7]";
const SOFT = "animate-pulse bg-[#f2f2ef]";

/** Line widths per row so the rows don't look stamped (from BPI-0). */
const ROW_WIDTHS = [
  ["w-[150px]", "w-[110px]"],
  ["w-[120px]", "w-[140px]"],
  ["w-[170px]", "w-[90px]"],
  ["w-[140px]", "w-[120px]"],
  ["w-40", "w-[100px]"],
] as const;

function rowWidths(index: number) {
  return ROW_WIDTHS[index % ROW_WIDTHS.length] ?? ROW_WIDTHS[0];
}

function LoadingStatus({
  className,
  label = "Loading…",
  children,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div
      aria-busy="true"
      className={className}
      data-slot="skeleton-group"
      role="status"
      {...props}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

/** Placeholder list rows; the last one fades out. 4 to 6 rows reads best. */
function SkeletonList({
  rows = 5,
  avatar = true,
  trailing = false,
  label,
  className,
}: {
  rows?: number;
  avatar?: boolean;
  /** A pill on the right, where a badge or amount sits. */
  trailing?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <LoadingStatus className={cn("flex flex-col", className)} label={label}>
      {Array.from({ length: rows }, (_, index) => {
        const [first, second] = rowWidths(index);
        const last = index === rows - 1;
        return (
          <div
            className={cn(
              "flex items-center gap-3 py-3",
              last ? "opacity-50" : "border-line border-b"
            )}
            // Static placeholders: the index is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={index}
          >
            {avatar ? (
              <div className={cn("size-9 shrink-0 rounded-full", STRONG)} />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
              <div
                className={cn("h-3 max-w-full rounded-[6px]", first, STRONG)}
              />
              <div
                className={cn(
                  "h-[10px] max-w-full rounded-[5px]",
                  second,
                  SOFT
                )}
              />
            </div>
            {trailing ? (
              <div className={cn("h-5 w-14 shrink-0 rounded-full", SOFT)} />
            ) : null}
          </div>
        );
      })}
    </LoadingStatus>
  );
}

/** Desktop table rows: a header line, then rows at real table-row height. */
function SkeletonTable({
  rows = 6,
  label,
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <LoadingStatus className={cn("flex flex-col", className)} label={label}>
      <div className="flex items-center gap-6 border-line border-b py-3">
        <div className={cn("h-[10px] w-20 rounded-[5px]", SOFT)} />
        <div className={cn("ml-auto h-[10px] w-16 rounded-[5px]", SOFT)} />
        <div className={cn("h-[10px] w-16 rounded-[5px]", SOFT)} />
      </div>
      {Array.from({ length: rows }, (_, index) => {
        const [first, second] = rowWidths(index);
        const last = index === rows - 1;
        return (
          <div
            className={cn(
              "flex h-[61px] items-center gap-3",
              last ? "opacity-50" : "border-line border-b"
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={index}
          >
            <div className={cn("size-9 shrink-0 rounded-full", STRONG)} />
            <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
              <div className={cn("h-3 rounded-[6px]", first, STRONG)} />
              <div className={cn("h-[10px] rounded-[5px]", second, SOFT)} />
            </div>
            <div className={cn("h-5 w-14 shrink-0 rounded-full", SOFT)} />
            <div className={cn("h-3 w-20 shrink-0 rounded-[6px]", STRONG)} />
          </div>
        );
      })}
    </LoadingStatus>
  );
}

const STAT_WIDTHS = [
  ["w-[110px]", "w-[90px]", "w-[120px]"],
  ["w-[90px]", "w-[50px]", "w-[130px]"],
  ["w-[120px]", "w-[130px]", "w-[100px]"],
  ["w-[100px]", "w-[70px]", "w-[110px]"],
] as const;

/**
 * Stat tiles drawn at the real <Stat> size (22px padding, 18px label, 52px number,
 * 18px hint; phone 14px padding and a 40px number), so nothing jumps when numbers land.
 * Lays out like the dashboard: `count` across on desktop, 2 by 2 below lg.
 */
function SkeletonStats({
  count = 4,
  label,
  className,
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <LoadingStatus
      className={cn(
        "grid grid-cols-[repeat(var(--stat-cols),minmax(0,1fr))] gap-4 max-md:gap-[10px] max-lg:grid-cols-2",
        className
      )}
      label={label}
      style={{ "--stat-cols": count } as React.CSSProperties}
    >
      {Array.from({ length: count }, (_, index) => {
        const [labelWidth, valueWidth, hintWidth] =
          STAT_WIDTHS[index % STAT_WIDTHS.length] ?? STAT_WIDTHS[0];
        return (
          <div
            className="flex flex-col gap-[14px] rounded-[20px] bg-fog p-[22px] max-md:gap-2 max-md:rounded-[18px] max-md:p-[14px] lg:min-w-0"
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder tiles
            key={index}
          >
            <div className="flex h-[18px] items-center">
              <div
                className={cn(
                  "h-[11px] max-w-full rounded-[6px]",
                  ON_FOG,
                  labelWidth
                )}
              />
            </div>
            <div className="flex h-[52px] items-center max-md:h-10">
              <div
                className={cn(
                  "h-10 max-w-full rounded-sm max-md:h-8",
                  ON_FOG,
                  valueWidth
                )}
              />
            </div>
            <div className="flex h-[18px] items-center max-md:h-4">
              <div
                className={cn(
                  "h-[10px] max-w-full rounded-[5px]",
                  ON_FOG_SOFT,
                  hintWidth
                )}
              />
            </div>
          </div>
        );
      })}
    </LoadingStatus>
  );
}

/** A bordered card: one title line and `lines` text lines (the last one shorter). */
function SkeletonCard({
  lines = 2,
  label,
  className,
}: {
  lines?: number;
  label?: string;
  className?: string;
}) {
  return (
    <LoadingStatus
      className={cn(
        "flex flex-col gap-3 rounded-[20px] border border-line px-[18px] py-4",
        className
      )}
      label={label}
    >
      <div className={cn("h-3 w-40 rounded-[6px]", STRONG)} />
      {Array.from({ length: lines }, (_, index) => (
        <div
          className={cn(
            "h-[10px] rounded-[5px]",
            index === lines - 1 && lines > 1 ? "w-3/4" : "w-full",
            SOFT
          )}
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lines
          key={index}
        />
      ))}
    </LoadingStatus>
  );
}

export { Skeleton, SkeletonCard, SkeletonList, SkeletonStats, SkeletonTable };
