/* Pieces shared by the admin and coach attendance screens. */
import { buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useCallback, useMemo } from "react";

import { PAGE_SIZES, type PageSize } from "@/features/attendance/search";
import { pointsBetween } from "@/features/attendance/stats";
import { ChevronIcon } from "@/features/calendar/controls";

/** "▲ 7 pts" / "▼ 3 pts" against the previous period; nothing without data. */
export function Delta({
  rate,
  previous,
  suffix = "",
  className,
  upClassName = "text-[#5FD08F]",
}: {
  rate: number | null;
  previous: number | null;
  suffix?: string;
  className?: string;
  upClassName?: string;
}) {
  const points = pointsBetween(rate, previous);
  if (points === null) {
    return null;
  }
  const up = points >= 0;
  return (
    <span
      className={cn(
        "font-semibold text-sm leading-[18px]",
        up ? upClassName : "text-orange",
        className
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(points)}{" "}
      {Math.abs(points) === 1 ? "pt" : "pts"}
      {suffix}
    </span>
  );
}

function pageList(page: number, pages: number): number[] {
  const WINDOW = 3;
  const start = Math.max(1, Math.min(page - 1, pages - WINDOW + 1));
  return Array.from(
    { length: Math.min(WINDOW, pages) },
    (_, index) => start + index
  );
}

function PageButton({
  value,
  current,
  onPage,
}: {
  value: number;
  current: boolean;
  onPage: (page: number) => void;
}) {
  const handleClick = useCallback(() => onPage(value), [onPage, value]);
  return (
    <button
      aria-current={current ? "page" : undefined}
      aria-label={`Page ${value}`}
      className={cn(
        "flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink max-md:size-11",
        current
          ? "bg-ink font-semibold text-white"
          : "font-medium text-ink hover:bg-fog"
      )}
      onClick={handleClick}
      type="button"
    >
      {value}
    </button>
  );
}

/** "Showing 1 to 25 of 64" · Previous 1 2 3 Next · "25 per page". */
export function Pager({
  page,
  size,
  total,
  onPage,
  onSize,
  className,
}: {
  page: number;
  size: PageSize;
  total: number;
  onPage: (page: number) => void;
  onSize: (size: PageSize) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const first = total === 0 ? 0 : (current - 1) * size + 1;
  const last = Math.min(total, current * size);
  const handlePrev = useCallback(() => onPage(current - 1), [current, onPage]);
  const handleNext = useCallback(() => onPage(current + 1), [current, onPage]);
  const sizes = useMemo(
    () =>
      PAGE_SIZES.map((value) => ({
        value: String(value),
        label: `${value} per page`,
      })),
    []
  );
  const handleSize = useCallback(
    (next: unknown) => {
      const value = PAGE_SIZES.find((option) => String(option) === next);
      if (value) {
        onSize(value);
      }
    },
    [onSize]
  );
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-3 pt-5",
        className
      )}
    >
      <p className="text-muted text-sm leading-[18px]">
        Showing{" "}
        <span className="font-semibold text-ink">
          {first} to {last}
        </span>{" "}
        of {total}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <nav aria-label="Pages" className="flex items-center gap-1">
          <button
            className="flex cursor-pointer items-center gap-[6px] rounded-full px-3 py-2 font-medium text-ink text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-default disabled:text-[#B5B5B5] max-md:min-h-11"
            disabled={current <= 1}
            onClick={handlePrev}
            type="button"
          >
            <ChevronIcon direction="left" size={12} />
            Previous
          </button>
          {pageList(current, pages).map((value) => (
            <PageButton
              current={value === current}
              key={value}
              onPage={onPage}
              value={value}
            />
          ))}
          <button
            className="flex cursor-pointer items-center gap-[6px] rounded-full px-3 py-2 font-semibold text-ink text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-default disabled:font-medium disabled:text-[#B5B5B5] max-md:min-h-11"
            disabled={current >= pages}
            onClick={handleNext}
            type="button"
          >
            Next
            <ChevronIcon size={12} />
          </button>
        </nav>
        <Select items={sizes} onValueChange={handleSize} value={String(size)}>
          <SelectTrigger
            aria-label="Rows per page"
            className="px-3 py-2 text-[13px] leading-4"
            variant="pill"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {sizes.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const NEEDS_QUOTES = /[",\n]/;

function csvCell(value: string | number): string {
  const text = String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Downloads rows as a CSV file (client-side; nothing is sent anywhere). */
export function downloadCsv(
  filename: string,
  rows: (string | number)[][]
): void {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(
    new Blob([body], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const exportButtonClass = cn(
  buttonVariants({ variant: "outline" }),
  "h-auto px-[20px] py-3 text-[15px]"
);

export function Initials({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0] ?? "")
    .filter((_, index, all) => index === 0 || index === all.length - 1)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-fog font-semibold text-[12px] text-ink leading-4",
        className
      )}
    >
      {letters}
    </span>
  );
}
