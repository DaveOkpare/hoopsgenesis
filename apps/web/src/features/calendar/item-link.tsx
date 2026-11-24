/*
 * Where a calendar item opens: a day that takes attendance opens its session
 * (/<role>/sessions/$eventId?date=), anything else its event (/<role>/events/$eventId).
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { CalendarItem } from "@/features/calendar/api";
import type { CalendarRole } from "@/features/calendar/model";

export function opensSession(
  item: Pick<CalendarItem, "collectAttendance" | "teamId">
): boolean {
  return item.collectAttendance && item.teamId !== null;
}

export function ItemLink({
  audience,
  item,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  audience: CalendarRole;
  item: Pick<
    CalendarItem,
    "eventId" | "sessionDate" | "collectAttendance" | "teamId"
  >;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const params = { eventId: item.eventId };
  const search = { date: item.sessionDate };
  const session = opensSession(item);
  if (audience === "coach") {
    return session ? (
      <Link
        aria-label={ariaLabel}
        className={className}
        params={params}
        search={search}
        to="/coach/sessions/$eventId"
      >
        {children}
      </Link>
    ) : (
      <Link
        aria-label={ariaLabel}
        className={className}
        params={params}
        to="/coach/events/$eventId"
      >
        {children}
      </Link>
    );
  }
  return session ? (
    <Link
      aria-label={ariaLabel}
      className={className}
      params={params}
      search={search}
      to="/admin/sessions/$eventId"
    >
      {children}
    </Link>
  ) : (
    <Link
      aria-label={ariaLabel}
      className={className}
      params={params}
      to="/admin/events/$eventId"
    >
      {children}
    </Link>
  );
}
