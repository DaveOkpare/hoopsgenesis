import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type ReactNode, useCallback } from "react";

/*
 * Owner console paging (Paper ET2-0, 36U-0, EWF-0 "Pagination Footer"; phone and
 * tablet "Show 25 more"). `total` is optional: cursor-paginated lists (the audit
 * log) do not know how many rows there are, so they show no "of N" and only the
 * page numbers reached so far.
 */

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];
export const DEFAULT_PER_PAGE: PerPage = 25;

export function parsePerPage(value: unknown): PerPage | undefined {
  const n = Number(value);
  return PER_PAGE_OPTIONS.find((option) => option === n);
}

export function parsePage(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 ? n : undefined;
}

const PAGE_WINDOW = 3;

function Arrow({
  direction,
  muted,
}: {
  direction: "left" | "right";
  muted: boolean;
}) {
  return (
    <svg aria-hidden="true" height="12" viewBox="0 0 14 14" width="12">
      <path
        d={direction === "left" ? "M8.5 3L4.5 7l4 4" : "M5.5 3l4 4-4 4"}
        fill="none"
        stroke={muted ? "#B5B5B5" : "#111111"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** Page numbers around the current one: [1, 2, 3], [4, 5, 6] … */
function pageNumbers(page: number, lastKnown: number): number[] {
  const start = Math.max(1, Math.min(page - 1, lastKnown - PAGE_WINDOW + 1));
  const end = Math.min(lastKnown, start + PAGE_WINDOW - 1);
  const numbers: number[] = [];
  for (let n = start; n <= end; n += 1) {
    numbers.push(n);
  }
  return numbers;
}

function PageButton({
  number,
  current,
  onPage,
}: {
  number: number;
  current: boolean;
  onPage: (page: number) => void;
}) {
  const handleClick = useCallback(() => onPage(number), [number, onPage]);
  return (
    <button
      aria-current={current ? "page" : undefined}
      aria-label={`Page ${number}`}
      className={cn(
        "flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        current
          ? "bg-ink font-semibold text-white"
          : "font-medium text-ink hover:bg-fog"
      )}
      onClick={handleClick}
      type="button"
    >
      {number}
    </button>
  );
}

export function Pager({
  page,
  perPage,
  shown,
  total,
  hasNext,
  suffix,
  onPage,
  onPerPage,
  className,
}: {
  page: number;
  perPage: PerPage;
  /** Rows on this page. */
  shown: number;
  /** Every matching row, when the server says (or the whole list is loaded). */
  total?: number;
  hasNext: boolean;
  /** After the count: ` for “uwase”`. */
  suffix?: ReactNode;
  onPage: (page: number) => void;
  onPerPage: (perPage: PerPage) => void;
  className?: string;
}) {
  const from = shown === 0 ? 0 : (page - 1) * perPage + 1;
  const to = (page - 1) * perPage + shown;
  const lastKnown =
    total === undefined
      ? page + (hasNext ? 1 : 0)
      : Math.max(1, Math.ceil(total / perPage));
  const previous = useCallback(() => onPage(page - 1), [onPage, page]);
  const next = useCallback(() => onPage(page + 1), [onPage, page]);
  const handlePerPage = useCallback(
    (value: unknown) => {
      const parsed = parsePerPage(value);
      if (parsed) {
        onPerPage(parsed);
      }
    },
    [onPerPage]
  );
  const options = PER_PAGE_OPTIONS.map((n) => ({
    value: String(n),
    label: `${n} per page`,
  }));
  const linkClass =
    "flex cursor-pointer items-center gap-[6px] rounded-full px-3 py-2 text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-default";
  return (
    <nav
      aria-label="Pages"
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-3 pt-5",
        className
      )}
    >
      <p className="text-muted text-sm leading-[18px]">
        Showing{" "}
        <span className="font-semibold text-ink">
          {from} to {to}
        </span>
        {total === undefined ? null : ` of ${total.toLocaleString("en-US")}`}
        {suffix}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <button
            className={cn(
              linkClass,
              "font-medium",
              page > 1 ? "text-ink hover:bg-fog" : "text-[#B5B5B5]"
            )}
            disabled={page <= 1}
            onClick={previous}
            type="button"
          >
            <Arrow direction="left" muted={page <= 1} />
            Previous
          </button>
          {pageNumbers(page, lastKnown).map((n) => (
            <PageButton
              current={n === page}
              key={n}
              number={n}
              onPage={onPage}
            />
          ))}
          <button
            className={cn(
              linkClass,
              hasNext
                ? "font-semibold text-ink hover:bg-fog"
                : "font-medium text-[#B5B5B5]"
            )}
            disabled={!hasNext}
            onClick={next}
            type="button"
          >
            Next
            <Arrow direction="right" muted={!hasNext} />
          </button>
        </div>
        <Select
          items={options}
          onValueChange={handlePerPage}
          value={String(perPage)}
        >
          <SelectTrigger
            aria-label="Rows per page"
            className="px-3 py-2 font-medium text-[13px] leading-4"
            variant="pill"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  );
}

/** Phone and tablet: "Showing 25 of 52" and "Show 25 more". */
export function ShowMore({
  shown,
  total,
  step,
  hasMore,
  pending = false,
  onMore,
  className,
}: {
  shown: number;
  total?: number;
  step: number;
  hasMore: boolean;
  pending?: boolean;
  onMore: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[10px] pt-[14px]", className)}>
      <p className="text-center text-[13px] text-muted leading-4">
        Showing {shown.toLocaleString("en-US")}
        {total === undefined ? "" : ` of ${total.toLocaleString("en-US")}`}
      </p>
      {hasMore ? (
        <button
          className="flex cursor-pointer justify-center rounded-full border border-ink p-3 font-semibold text-[15px] text-ink leading-5 outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60"
          disabled={pending}
          onClick={onMore}
          type="button"
        >
          {pending ? "Loading…" : `Show ${step} more`}
        </button>
      ) : null}
    </div>
  );
}
