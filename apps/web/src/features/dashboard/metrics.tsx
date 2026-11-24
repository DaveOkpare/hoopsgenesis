import { SkeletonStats } from "@hoops-genesis/ui/components/skeleton";
import {
  Stat,
  StatHint,
  StatLabel,
  StatValue,
} from "@hoops-genesis/ui/components/stat";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { monthName } from "@/features/dashboard/format";
import type {
  DashboardSummary,
  TodaySession,
} from "@/features/dashboard/queries";
import { formatAmount } from "@/lib/format";

const BAR_MAX_HEIGHT = 40;
const tileLink =
  "rounded-[20px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 max-md:rounded-[18px] [&>[data-slot=stat]]:h-full hover:[&>[data-slot=stat]]:bg-[#efefec]";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Five weekly bars; the last (this week) is ink. Heights scale to the best week. */
function WeeklyBars({
  weeks,
}: {
  weeks: { weekStart: string; percent: number }[];
}) {
  const max = Math.max(...weeks.map((week) => week.percent), 1);
  const thisWeek = weeks.at(-1)?.weekStart;
  return (
    <div aria-hidden="true" className="flex h-10 items-end gap-1">
      {weeks.map((week) => (
        <div
          className={cn(
            "w-2 shrink-0 rounded-[3px]",
            week.weekStart === thisWeek ? "bg-ink" : "bg-stone"
          )}
          key={week.weekStart}
          style={{ height: Math.round((week.percent / max) * BAR_MAX_HEIGHT) }}
        />
      ))}
    </div>
  );
}

function Trend({ points }: { points: number }) {
  const up = points >= 0;
  return (
    <span
      className={cn("font-semibold", up ? "text-success" : "text-orange-deep")}
    >
      {up ? "▲" : "▼"} {Math.abs(points)} pts
    </span>
  );
}

function sessionsHint(sessions: TodaySession[], now: string): string {
  const live = sessions.filter((s) => s.live).length;
  const parts = [`${live} live now`];
  for (const session of sessions) {
    if (!session.live && session.startTime && session.startTime > now) {
      parts.push(`next at ${session.startTime}`);
      break;
    }
  }
  return parts.join(" · ");
}

function TileLink({
  to,
  children,
  label,
}: {
  to: LinkProps["to"];
  children: ReactNode;
  label: string;
}) {
  return (
    <Link aria-label={label} className={tileLink} to={to}>
      {children}
    </Link>
  );
}

/** Four metric tiles (desktop YA-0). Each opens the full list (AO-7). */
export function DesktopMetrics({
  summary,
  sessions,
  nowTime,
  oldestDays,
}: {
  summary: DashboardSummary;
  sessions: TodaySession[];
  nowTime: string;
  oldestDays: number | null;
}) {
  const { attendance, outstanding, records } = summary;
  return (
    <div className="grid grid-cols-4 gap-4 max-md:hidden max-xl:grid-cols-2">
      <TileLink
        label={`Attendance this week ${attendance.thisWeekPercent}%`}
        to="/admin/attendance"
      >
        <Stat>
          <StatLabel arrow>Attendance this week</StatLabel>
          <div className="flex items-end justify-between">
            <StatValue>{attendance.thisWeekPercent}%</StatValue>
            <WeeklyBars weeks={attendance.weekly} />
          </div>
          <StatHint>
            <Trend points={attendance.changePts} /> vs last week
          </StatHint>
        </Stat>
      </TileLink>
      <TileLink
        label={`Sessions today ${sessions.length}`}
        to="/admin/calendar"
      >
        <Stat>
          <StatLabel arrow>Sessions today</StatLabel>
          <StatValue>{sessions.length}</StatValue>
          <StatHint>{sessionsHint(sessions, nowTime)}</StatHint>
        </Stat>
      </TileLink>
      <TileLink
        label={`Outstanding fees ${outstanding.total.currency} ${formatAmount(outstanding.total.amount)}`}
        to="/admin/fees"
      >
        <Stat>
          <StatLabel arrow>Outstanding fees</StatLabel>
          <StatValue unit={outstanding.total.currency}>
            {formatAmount(outstanding.total.amount)}
          </StatValue>
          <StatHint>
            <strong className="font-semibold text-orange-deep">
              {plural(outstanding.studentCount, "student")}
            </strong>{" "}
            for {monthName(outstanding.periodStart)}
          </StatHint>
        </Stat>
      </TileLink>
      <TileLink
        label={`Records waiting for a coach ${records.pendingCount}`}
        to="/admin/records"
      >
        <Stat>
          <StatLabel arrow>Records waiting</StatLabel>
          <StatValue>{records.pendingCount}</StatValue>
          <StatHint>
            {oldestDays === null
              ? "Nothing waiting"
              : `Coaches review them · oldest ${plural(oldestDays, "day")}`}
          </StatHint>
        </Stat>
      </TileLink>
    </div>
  );
}

function PhoneTile({
  to,
  label,
  value,
  hint,
  tone = "fog",
}: {
  to: LinkProps["to"];
  label: string;
  value: ReactNode;
  hint: ReactNode;
  tone?: "fog" | "soft";
}) {
  return (
    <Link
      className={cn(
        "flex flex-col gap-[6px] rounded-[18px] p-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        tone === "fog" ? "bg-fog" : "bg-orange-soft"
      )}
      to={to}
    >
      <span
        className={cn(
          "text-[13px] leading-4",
          tone === "fog" ? "text-muted" : "text-orange-deep"
        )}
      >
        {label}
      </span>
      <span className="font-display text-[36px] text-ink leading-[38px]">
        {value}
      </span>
      <span
        className={cn(
          "text-[12px] leading-4",
          tone === "fog" ? "text-muted" : "text-ink-soft"
        )}
      >
        {hint}
      </span>
    </Link>
  );
}

/** 2×2 tiles on the phone Home (5TY-0). */
export function PhoneMetrics({
  summary,
  sessions,
  oldestDays,
}: {
  summary: DashboardSummary;
  sessions: TodaySession[];
  oldestDays: number | null;
}) {
  const { attendance, outstanding, records } = summary;
  const up = attendance.changePts >= 0;
  const live = sessions.filter((s) => s.live).length;
  return (
    <div className="grid grid-cols-2 gap-[10px] md:hidden">
      <PhoneTile
        hint={
          <span
            className={cn(
              "font-semibold",
              up ? "text-success" : "text-orange-deep"
            )}
          >
            {up ? "▲" : "▼"} {Math.abs(attendance.changePts)} pts
          </span>
        }
        label="Attendance this week"
        to="/admin/attendance"
        value={`${attendance.thisWeekPercent}%`}
      />
      <PhoneTile
        hint={`${live} live now`}
        label="Sessions today"
        to="/admin/calendar"
        value={sessions.length}
      />
      <PhoneTile
        hint={`${outstanding.total.currency} ${formatAmount(outstanding.total.amount)}`}
        label={`Unpaid · ${monthName(outstanding.periodStart)}`}
        to="/admin/fees"
        tone="soft"
        value={outstanding.studentCount}
      />
      <PhoneTile
        hint={
          oldestDays === null
            ? "Nothing waiting"
            : `Oldest ${plural(oldestDays, "day")}`
        }
        label="Records waiting"
        to="/admin/records"
        value={records.pendingCount}
      />
    </div>
  );
}

export function MetricsSkeleton() {
  return (
    <SkeletonStats
      className="max-xl:grid-cols-2"
      count={4}
      label="Loading the numbers"
    />
  );
}
