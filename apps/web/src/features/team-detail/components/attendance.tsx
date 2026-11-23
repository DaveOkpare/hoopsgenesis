import { cn } from "@hoops-genesis/ui/lib/utils";

/** Below this, attendance shows in orange (55% on 4QT-0 / 4YX-0). */
export const LOW_ATTENDANCE = 60;

/** null = no sessions counted yet (never low). */
export function isLowAttendance(percent: number | null): boolean {
  return percent !== null && percent < LOW_ATTENDANCE;
}

/** "92%" with the 80px bar from "U14 this month". */
export function AttendanceBar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-muted text-sm leading-[18px]">—</span>;
  }
  const low = isLowAttendance(percent);
  return (
    <span className="flex items-center gap-[10px]">
      <span
        aria-hidden="true"
        className="flex h-[6px] w-20 shrink-0 overflow-hidden rounded-full bg-line"
      >
        <span
          className={cn("h-[6px] rounded-full", low ? "bg-orange" : "bg-ink")}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span
        className={cn(
          "font-semibold text-sm leading-[18px]",
          low ? "text-orange-deep" : "text-ink"
        )}
      >
        {percent}%
      </span>
    </span>
  );
}

export function AttendancePercent({
  percent,
  className,
}: {
  percent: number | null;
  className?: string;
}) {
  if (percent === null) {
    return (
      <span className={cn("text-muted text-sm leading-[18px]", className)}>
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-semibold text-sm leading-[18px]",
        isLowAttendance(percent) ? "text-orange-deep" : "text-ink",
        className
      )}
    >
      {percent}%
    </span>
  );
}
