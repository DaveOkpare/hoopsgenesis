import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { CountryDot } from "@hoops-genesis/ui/components/chip";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import { QueryBoundary } from "@/components/error-state";
import { AcademyDetail } from "@/features/owner-academies/academy-detail";
import {
  type ConsoleSearch,
  knownCountry,
  placeLabel,
} from "@/features/owner-academies/console-search";
import {
  type AcademyAdminPerson,
  type PlatformAcademyDetail,
  type PlatformAcademyStatus,
  platformAcademyQueryOptions,
} from "@/features/owner-academies/queries";
import { userSessionsQueryOptions } from "@/features/owner-users/queries";
import { useViewAs } from "@/features/owner-users/view-as";
import type { AcademyRole, Id } from "@/features/types";
import {
  formatDayMonth,
  formatRelativeDay,
  formatShortMonthYear,
  formatTime,
  initials,
} from "@/lib/format";
import { appNow } from "@/lib/preview";

const QR_RECENT_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_IN_WEEK = 7;

const STATUS_BADGE: Record<
  PlatformAcademyStatus,
  { label: string; className: string } | null
> = {
  active: null,
  qr_replaced: {
    label: "QR replaced",
    className: "bg-orange-soft text-orange-deep",
  },
  admin_invited: { label: "Admin invited", className: "bg-fog text-ink" },
};

function BackIcon() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 14 14" width="18">
      <path
        d="M8.5 3L4.5 7l4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function Dot({ timeZone }: { timeZone: string }) {
  const country = knownCountry(timeZone);
  return country ? (
    <CountryDot className="size-2" country={country} />
  ) : (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full bg-stone"
    />
  );
}

/** "2 hours ago", "5 minutes ago", "yesterday 18:20". */
function lastIn(value: string, timeZone: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - Date.parse(value)) / MS_PER_MINUTE)
  );
  if (minutes < MINUTES_PER_HOUR) {
    return minutes <= 1 ? "just now" : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const day = formatRelativeDay(value, timeZone, now);
  return `${day === "Yesterday" ? "yesterday" : day} ${formatTime(value, timeZone)}`;
}

const ROLE_WORD: Record<AcademyRole, string> = {
  admin: "Admin",
  coach: "coach",
  student: "student",
};

function rolesText(roles: AcademyRole[]): string {
  const [first, ...rest] = roles.map((r) => ROLE_WORD[r]);
  return [first, ...rest].filter(Boolean).join(" and ");
}

function AdminRow({
  person,
  timeZone,
}: {
  person: AcademyAdminPerson;
  timeZone: string;
}) {
  // Only "last in": left out if it fails.
  const { data: sessions } = useQuery({
    ...userSessionsQueryOptions(person.userId),
    throwOnError: false,
  });
  const last = sessions?.[0]?.updatedAt;
  return (
    <Link
      className="flex items-center gap-3 border-line border-b pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ink"
      params={{ userId: person.userId }}
      to="/owner/users/$userId"
    >
      <Avatar className="font-semibold" size={36} tone="ink">
        <AvatarFallback>{initials(person.name)}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate font-semibold text-[15px] text-ink leading-5">
          {person.name}
        </span>
        <span className="truncate text-[13px] text-muted leading-4">
          {rolesText(person.roles)}
          {last ? ` · last in ${lastIn(last, timeZone, appNow())}` : ""}
        </span>
      </span>
      <svg aria-hidden="true" height="16" viewBox="0 0 14 14" width="16">
        <path
          d="M5.5 3l4 4-4 4"
          fill="none"
          stroke="#6B6B6B"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    </Link>
  );
}

function QrCard({ detail }: { detail: PlatformAcademyDetail }) {
  const { regeneratedAt, regeneratedBy } = detail.qr;
  const tz = detail.academy.timezone;
  const now = appNow();
  const recent =
    regeneratedAt &&
    now.getTime() - Date.parse(regeneratedAt) < QR_RECENT_DAYS * MS_PER_DAY;
  let title = "QR code";
  let line = "Not replaced since setup";
  if (regeneratedAt) {
    const day = formatRelativeDay(regeneratedAt, tz, now);
    title = recent
      ? `QR code replaced ${day === "Today" || day === "Yesterday" ? day.toLowerCase() : `on ${day}`}`
      : "QR code";
    const by = regeneratedBy ? `By ${regeneratedBy} at ` : "At ";
    line = recent
      ? `${by}${formatTime(regeneratedAt, tz)} · old posters stopped working`
      : `Replaced ${formatDayMonth(regeneratedAt, tz)}`;
  }
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md p-[14px]",
        recent ? "border border-orange bg-orange-soft" : "bg-fog"
      )}
    >
      <svg aria-hidden="true" height="22" viewBox="0 0 18 18" width="22">
        <g
          fill="none"
          stroke={recent ? "#B8501A" : "#6B6B6B"}
          strokeWidth="1.6"
        >
          <rect height="5.5" rx="1" width="5.5" x="2" y="2" />
          <rect height="5.5" rx="1" width="5.5" x="10.5" y="2" />
          <rect height="5.5" rx="1" width="5.5" x="2" y="10.5" />
          <path d="M10.5 10.5h2v2M16 10.5v5.5h-5.5" />
        </g>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="font-semibold text-ink text-sm leading-[18px]">{title}</p>
        <p
          className={cn(
            "text-[13px] leading-4",
            recent ? "text-orange-deep" : "text-muted"
          )}
        >
          {line}
        </p>
      </div>
    </div>
  );
}

/** "16:04" today, "Sun" this week, "16 Nov" before. */
function activityWhen(value: string, timeZone: string, now: Date): string {
  const day = formatRelativeDay(value, timeZone, now);
  if (day === "Today") {
    return formatTime(value, timeZone);
  }
  const days = (now.getTime() - Date.parse(value)) / MS_PER_DAY;
  return days < DAYS_IN_WEEK
    ? new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(
        new Date(value)
      )
    : formatDayMonth(value, timeZone);
}

function PhoneStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[14px] bg-fog px-[10px] py-3">
      <p className="font-display text-[28px] text-ink leading-[28px]">
        {value}
      </p>
      <p className="text-[12px] text-muted leading-4">{label}</p>
    </div>
  );
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Phone academy page (E51-0). */
function PhoneDetail({
  detail,
  search,
}: {
  detail: PlatformAcademyDetail;
  search: ConsoleSearch;
}) {
  const { academy, counts, adminPeople, recentActivity } = detail;
  const tz = academy.timezone;
  const now = appNow();
  const { viewAs, isPending } = useViewAs();
  const [admin] = adminPeople;
  const viewAsAdmin = useCallback(() => {
    if (admin) {
      viewAs(admin.userId);
    }
  }, [admin, viewAs]);
  return (
    <div className="flex min-h-[calc(100svh-150px)] flex-col gap-5 md:hidden">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3">
        <Link
          className="flex items-center gap-[6px] font-semibold text-[15px] text-ink leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
          search={search}
          to="/owner"
        >
          <BackIcon />
          Academies
        </Link>
        <span className="flex min-w-0 items-center gap-[6px]">
          <Dot timeZone={tz} />
          <span className="truncate font-medium text-[13px] text-muted leading-4">
            {placeLabel(tz)} · {academy.defaultCurrency} · {tz}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-[2px]">
        <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label">
          Hoops Genesis · since {formatShortMonthYear(academy.createdAt, tz)}
        </p>
        <h1 className="font-display text-display-sm text-ink uppercase leading-[95%]">
          {academy.shortName}
        </h1>
      </div>
      <div className="flex gap-[6px]">
        <PhoneStat
          label={plural(counts.admins, "Admin", "Admins")}
          value={counts.admins}
        />
        <PhoneStat
          label={plural(counts.coaches, "Coach", "Coaches")}
          value={counts.coaches}
        />
        <PhoneStat
          label={plural(counts.students, "Student", "Students")}
          value={counts.students}
        />
        <PhoneStat
          label={plural(counts.teams, "Team", "Teams")}
          value={counts.teams}
        />
      </div>
      <QrCard detail={detail} />
      {admin ? (
        <AdminRow person={admin} timeZone={tz} />
      ) : (
        <div className="flex flex-col gap-[2px] border-line border-b pb-3">
          <p className="font-semibold text-[15px] text-ink leading-5">
            No admin yet
          </p>
          <p className="text-[13px] text-muted leading-4">
            {detail.pendingAdminEmail
              ? `${detail.pendingAdminEmail} hasn't accepted the invitation yet`
              : "Appoint one from their page under Users"}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-[9px]">
        <h2 className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
          Recent activity
        </h2>
        {recentActivity.length === 0 ? (
          <p className="text-muted text-sm leading-[18px]">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-[9px]">
            {recentActivity.map((entry) => (
              <li className="flex gap-[10px]" key={entry.id}>
                <span className="w-[42px] shrink-0 font-semibold text-[12px] text-muted leading-[18px]">
                  {activityWhen(entry.createdAt, tz, now)}
                </span>
                <span className="min-w-0 flex-1 text-ink text-sm leading-[18px]">
                  {entry.summary}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-auto flex gap-2">
        <Button
          className="h-auto flex-1 py-[14px] text-[15px] leading-5"
          disabled={!admin || isPending}
          onClick={viewAsAdmin}
        >
          <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
            <path
              d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle
              cx="8"
              cy="8"
              fill="none"
              r="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          View as admin
        </Button>
        <Link
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto px-[18px] py-[14px] text-[15px] leading-5"
          )}
          search={{ academy: academy.id }}
          to="/owner/audit"
        >
          Audit log
        </Link>
      </div>
    </div>
  );
}

/** Tablet academy page (CQ5-0): title row, then the console's panel. */
function TabletDetail({
  detail,
  search,
}: {
  detail: PlatformAcademyDetail;
  search: ConsoleSearch;
}) {
  const { academy } = detail;
  const badge = STATUS_BADGE[detail.status];
  return (
    <div className="flex flex-col gap-5 max-md:hidden">
      <Link
        className="flex h-11 w-fit items-center gap-[6px] font-semibold text-[15px] text-ink leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
        search={search}
        to="/owner"
      >
        <BackIcon />
        Academies
      </Link>
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-orange font-display text-[22px] text-ink leading-[26px]"
        >
          HG
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <h1 className="font-display text-2xl text-ink uppercase leading-[95%]">
            {academy.name}
          </h1>
          <p className="flex items-center gap-[6px] text-muted text-sm leading-[18px]">
            <Dot timeZone={academy.timezone} />
            {placeLabel(academy.timezone)} ·{" "}
            {detail.adminName ? `Admin ${detail.adminName}` : "No admin yet"}
          </p>
        </div>
        {badge ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 font-semibold text-[13px] leading-4",
              badge.className
            )}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
      <AcademyDetail academyId={academy.id} variant="page" />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5" role="status">
      <span className="sr-only">Loading academy</span>
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-14 w-2/3" />
      <Skeleton className="h-[70px]" />
      <Skeleton className="h-[66px]" />
      <Skeleton className="h-[150px]" />
    </div>
  );
}

function DetailBody({
  academyId,
  search,
}: {
  academyId: Id;
  search: ConsoleSearch;
}) {
  const { data: detail } = useQuery(platformAcademyQueryOptions(academyId));
  if (detail === undefined) {
    return <PageSkeleton />;
  }
  if (!detail) {
    return (
      <div className="flex flex-col gap-2">
        <Link
          className="font-semibold text-[15px] text-ink leading-5"
          search={search}
          to="/owner"
        >
          ← Academies
        </Link>
        <h1 className="font-semibold text-ink text-lg">Academy not found</h1>
        <p className="text-muted text-sm">
          It may have been removed. Pick an academy from the list.
        </p>
      </div>
    );
  }
  return (
    <>
      <TabletDetail detail={detail} search={search} />
      <PhoneDetail detail={detail} search={search} />
    </>
  );
}

/** One academy as its own page below lg (tablet CQ5-0, phone E51-0). */
export function AcademyDetailPage({
  academyId,
  search,
  className,
}: {
  academyId: Id;
  search: ConsoleSearch;
  className?: string;
}) {
  return (
    <div className={className}>
      <QueryBoundary resetKey={academyId} what="this academy">
        <DetailBody academyId={academyId} search={search} />
      </QueryBoundary>
    </div>
  );
}
