import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { CountryDot } from "@hoops-genesis/ui/components/chip";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useCallback } from "react";
import { toast } from "sonner";

import { useIsOffline } from "@/components/offline";
import {
  type PlatformUser,
  type PlatformUserMembership,
  type UserSession,
  useRevokeUserSessions,
} from "@/features/owner-users/queries";
import type { AcademyRole, Country } from "@/features/types";
import { roleLabel } from "@/features/viewer/selectors";
import { errorMessage } from "@/lib/api-client";
import {
  firstName,
  formatRelativeDay,
  formatTime,
  initials,
} from "@/lib/format";
import { appNow } from "@/lib/preview";

/* Pieces shared by the Users screen, its side panel and the person page. */

const COUNTRY_BY_TIMEZONE: Record<string, Country> = {
  "Asia/Kolkata": "india",
  "Africa/Kigali": "rwanda",
  "Africa/Kampala": "uganda",
};
export const FALLBACK_TIMEZONE = "Africa/Kigali";

export function countryOfZone(timeZone: string): Country | null {
  return COUNTRY_BY_TIMEZONE[timeZone] ?? null;
}

export function ZoneDot({
  timeZone,
  className,
}: {
  timeZone: string;
  className?: string;
}) {
  const country = countryOfZone(timeZone);
  return country ? (
    <CountryDot className={className} country={country} />
  ) : (
    <span
      aria-hidden="true"
      className={cn("size-[7px] shrink-0 rounded-full bg-stone", className)}
    />
  );
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

export function membershipLabel(m: PlatformUserMembership): string {
  const roles = m.roles.map(roleLabel).join(", ");
  const team =
    m.roles.includes("student") && m.teamNames[0] ? ` · ${m.teamNames[0]}` : "";
  return `${m.academyShortName} · ${roles}${team}`;
}

export function roleSummary(user: PlatformUser): string {
  const roles = [...new Set(user.memberships.flatMap((m) => m.roles))];
  if (roles.length === 0) {
    return "No academy yet";
  }
  const [only] = user.memberships;
  const team =
    user.memberships.length === 1 &&
    only?.roles.includes("student") &&
    only.teamNames[0]
      ? ` · ${only.teamNames[0]}`
      : "";
  return `${roles.map((r: AcademyRole) => roleLabel(r)).join(" · ")}${team}`;
}

/** "4 Sep" (en-GB would print "4 Sept"). */
export function formatJoined(value: string, timeZone: string): string {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone,
  }).format(date);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone,
  }).format(date);
  return `${day} ${month}`;
}

/** "3 Mar 2026". */
export function formatFullDate(value: string, timeZone: string): string {
  return `${formatJoined(value, timeZone)} ${new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone,
  }).format(new Date(value))}`;
}

export function MembershipChips({ user }: { user: PlatformUser }) {
  if (user.memberships.length === 0) {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-[6px]">
      {user.memberships.map((m) => (
        <span
          className="inline-flex items-center gap-[6px] rounded-full bg-fog px-[10px] py-1 text-[13px] text-ink leading-4"
          key={m.academyId}
        >
          <ZoneDot timeZone={m.timezone} />
          {membershipLabel(m)}
        </span>
      ))}
    </span>
  );
}

export function UserAvatar({
  user,
  size,
  tone,
}: {
  user: Pick<PlatformUser, "name">;
  size: 44 | 52 | 36;
  tone: "fog" | "white" | "ink";
}) {
  return (
    <Avatar
      className={cn("font-semibold", size === 44 && "text-sm")}
      size={size}
      tone={tone}
    >
      <AvatarFallback>{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}

export function lastSeenText(
  updatedAt: string | undefined,
  timeZone: string
): string | null {
  if (!updatedAt) {
    return null;
  }
  const day = formatRelativeDay(updatedAt, timeZone, appNow());
  const lowered =
    day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return `last seen ${lowered} ${formatTime(updatedAt, timeZone)}`;
}

const PHONE_AGENT = /iphone|ios|android|mobile/i;

/** "Today 07:55, phone": the newest sign-in among the open sessions. */
export function lastSignInText(
  sessions: UserSession[] | undefined,
  timeZone: string
): string {
  if (sessions === undefined) {
    return "…";
  }
  const latest = sessions.reduce<UserSession | null>(
    (best, s) => (!best || s.createdAt > best.createdAt ? s : best),
    null
  );
  if (!latest) {
    return "No open sessions";
  }
  const day = formatRelativeDay(latest.createdAt, timeZone, appNow());
  const device = PHONE_AGENT.test(latest.userAgent) ? "phone" : "web";
  return `${day} ${formatTime(latest.createdAt, timeZone)}, ${device}`;
}

export function devicesText(count: number | undefined): string {
  if (count === undefined) {
    return "…";
  }
  return count === 0 ? "No devices" : plural(count, "device", "devices");
}

export function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "alert";
}) {
  return (
    <div className="flex justify-between gap-4 border-line border-b py-[11px] last:border-b-0">
      <dt className="text-muted text-sm leading-[18px]">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium text-ink text-sm leading-[18px]",
          tone === "alert" && "font-semibold text-orange-deep"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width="16"
    >
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

/** "Sign out everywhere" with its toast. Better Auth revokes every session. */
export function useSignOutEverywhere(user: PlatformUser) {
  const revoke = useRevokeUserSessions();
  const offline = useIsOffline();
  const first = firstName(user.name);
  const signOut = useCallback(() => {
    revoke.mutate(
      { userId: user.id },
      {
        onSuccess: ({ revoked }) =>
          toast.success(
            `${first} is signed out on ${plural(revoked, "device", "devices")}`
          ),
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn't sign them out. Try again.")
          ),
      }
    );
  }, [revoke, user.id, first]);
  return { signOut, isPending: revoke.isPending || offline };
}

/**
 * The honest footer for account actions: impersonation is audited, bans and
 * sign-outs are not (Better Auth writes no audit row for them).
 */
export const ACCOUNT_ACTIONS_NOTE =
  "View as lasts one hour and shows a banner the whole time. Viewing as someone is written to the platform audit log with your name; bans and sign-outs are not.";
