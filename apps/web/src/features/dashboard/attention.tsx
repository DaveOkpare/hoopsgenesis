import { Badge } from "@hoops-genesis/ui/components/badge";
import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { Card, CardHeader, CardTitle } from "@hoops-genesis/ui/components/card";
import {
  List,
  ListLabel,
  ListRow,
  ListRowChevron,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, type LinkOptions, linkOptions } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { monthName, shortWeekdayDayMonth } from "@/features/dashboard/format";
import type { DashboardSummary } from "@/features/dashboard/queries";
import { formatMoney } from "@/lib/format";

type AttentionKind = "fees" | "records" | "session" | "invites";

interface AttentionItem {
  action: string;
  description: string;
  kind: AttentionKind;
  link: LinkOptions;
  /** Shown on the phone Home too (fees and records already have tiles there). */
  onPhone: boolean;
  phoneTitle: string;
  primary: boolean;
  title: string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function inviteBreakdown(coaches: number, students: number): string {
  const parts: string[] = [];
  if (coaches > 0) {
    parts.push(plural(coaches, "coach").replace("coachs", "coaches"));
  }
  if (students > 0) {
    parts.push(plural(students, "student"));
  }
  return parts.join(", ");
}

/** Builds the "Needs your attention" items from GET /dashboard. Empty ones drop out. */
export function attentionItems(
  summary: DashboardSummary,
  _oldestDays: number | null,
  timeZone?: string
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { outstanding, unclosedSession, expiredInvites } = summary;
  if (outstanding.studentCount > 0) {
    const month = monthName(outstanding.periodStart, timeZone);
    const top = outstanding.topTeam
      ? ` · ${outstanding.topTeam.name} has the most (${outstanding.topTeam.count})`
      : "";
    items.push({
      kind: "fees",
      title: `${plural(outstanding.studentCount, "student")} haven’t paid for ${month}`,
      phoneTitle: `${plural(outstanding.studentCount, "student")} haven’t paid`,
      description: `${formatMoney(outstanding.total)} outstanding${top}`,
      action: "See who",
      primary: true,
      link: linkOptions({ to: "/admin/fees", search: { tab: "unpaid" } }),
      onPhone: false,
    });
  }
  // Records are read only for academy admins (coaches review them, IGD-0), so they no
  // longer ask for the admin's attention here (YA-0, 5TY-0).
  if (unclosedSession) {
    const day = shortWeekdayDayMonth(unclosedSession.sessionDate, timeZone);
    const team = unclosedSession.teamName ?? "Academy";
    items.push({
      kind: "session",
      title: `${team} ${unclosedSession.title.toLowerCase()} on ${day} isn’t closed`,
      phoneTitle: `${team} ${day} isn’t closed`,
      description: `${plural(unclosedSession.missingCheckIns, "student")} never checked in`,
      action: "Close out",
      primary: false,
      link: linkOptions({ to: "/admin/attendance" }),
      onPhone: true,
    });
  }
  const expired = expiredInvites.coaches + expiredInvites.students;
  if (expired > 0) {
    items.push({
      kind: "invites",
      title: `${plural(expired, "invite")} ${expired === 1 ? "has" : "have"} expired`,
      phoneTitle: `${plural(expired, "invite")} ${expired === 1 ? "has" : "have"} expired`,
      description: inviteBreakdown(
        expiredInvites.coaches,
        expiredInvites.students
      ),
      action: "Resend",
      primary: false,
      link: linkOptions({ to: "/admin/members", search: { tab: "invites" } }),
      onPhone: true,
    });
  }
  return items;
}

const ICONS: Record<AttentionKind, ReactNode> = {
  fees: (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      <rect
        fill="none"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
        width="15"
        x="1.5"
        y="4"
      />
      <circle
        cx="9"
        cy="9"
        fill="none"
        r="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  ),
  records: (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      <path
        d="M4 1.8h6.5L14 5.3v10.9H4z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M7 9h4M7 12h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  ),
  session: (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      <rect
        fill="none"
        height="14"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
        width="14"
        x="2"
        y="2"
      />
      <path
        d="M5.5 9.2l2.3 2.3 4.7-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  ),
  invites: (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      <rect
        fill="none"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
        width="14"
        x="2"
        y="3.5"
      />
      <path
        d="M2.5 4.5L9 9.5l6.5-5"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  ),
};

/** "Needs your attention" card (desktop YA-0). */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="min-w-0 flex-[1.25_1_0%]">
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
        <Badge variant="brand">{items.length}</Badge>
      </CardHeader>
      {items.length === 0 ? (
        <p className="border-line border-t pt-[14px] text-muted text-sm leading-[18px]">
          Nothing needs you right now.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li
              className="flex items-center gap-[14px] border-line border-t py-[14px] last:pb-0"
              key={item.kind}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
                  item.kind === "fees"
                    ? "bg-orange-soft text-orange-deep"
                    : "bg-fog text-ink"
                )}
              >
                {ICONS[item.kind]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="font-semibold text-[15px] text-ink leading-[18px]">
                  {item.title}
                </span>
                {item.description ? (
                  <span className="text-muted text-sm leading-[18px]">
                    {item.description}
                  </span>
                ) : null}
              </span>
              <span className="flex w-[112px] shrink-0 justify-end">
                <Link
                  className={buttonVariants({
                    size: "sm",
                    variant: item.primary ? "default" : "outline",
                  })}
                  {...item.link}
                >
                  {item.action}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Phone Home list (5TY-0): only items without a tile of their own. */
export function PhoneAttentionList({ items }: { items: AttentionItem[] }) {
  const phoneItems = items.filter((item) => item.onPhone);
  if (phoneItems.length === 0) {
    return null;
  }
  return (
    <List className="md:hidden">
      <ListLabel className="pb-[6px]">Needs your attention</ListLabel>
      {phoneItems.map((item) => (
        <ListRow key={item.kind} render={<Link {...item.link} />}>
          <ListRowContent>
            <ListRowTitle className="whitespace-normal">
              {item.phoneTitle}
            </ListRowTitle>
            <ListRowDescription>{item.description}</ListRowDescription>
          </ListRowContent>
          <ListRowChevron />
        </ListRow>
      ))}
    </List>
  );
}
