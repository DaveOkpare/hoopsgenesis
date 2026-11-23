import { cn } from "@hoops-genesis/ui/lib/utils";

/** Below this, attendance shows in orange (55% on 4QT-0 / 4YX-0). */
export const LOW_ATTENDANCE = 60;

export function isLowAttendance(percent: number): boolean {
  return percent < LOW_ATTENDANCE;
}

/** "92%" with the 80px bar from "U14 this month". */
export function AttendanceBar({ percent }: { percent: number }) {
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
  percent: number;
  className?: string;
}) {
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
