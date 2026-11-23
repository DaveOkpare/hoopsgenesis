/* Pure helpers over a Viewer. Safe to use anywhere (no data fetching). */

import type { Academy, AcademyRole, Country } from "@/features/types";
import type { Membership, Viewer } from "@/features/viewer/api";

const ROLE_PRIORITY: AcademyRole[] = ["admin", "coach", "student"];

const ROLE_LABEL: Record<AcademyRole, string> = {
  admin: "Admin",
  coach: "Coach",
  student: "Student",
};

export function getActiveMembership(viewer: Viewer): Membership | null {
  return (
    viewer.memberships.find((m) => m.academy.id === viewer.activeAcademyId) ??
    viewer.memberships[0] ??
    null
  );
}

/** The role that decides which shell this membership uses (admin > coach > student). */
export function primaryRole(membership: Membership): AcademyRole {
  return (
    ROLE_PRIORITY.find((role) => membership.roles.includes(role)) ?? "student"
  );
}

export function roleLabel(role: AcademyRole): string {
  return ROLE_LABEL[role];
}

/** True when the active academy membership includes this role (route guards use it). */
export function hasActiveRole(viewer: Viewer, role: AcademyRole): boolean {
  return getActiveMembership(viewer)?.roles.includes(role) ?? false;
}

export function isOwner(viewer: Viewer): boolean {
  return viewer.user.platformRole === "admin";
}

const COUNTRY_BY_TIMEZONE: Record<string, Country> = {
  "Asia/Kolkata": "india",
  "Africa/Kigali": "rwanda",
  "Africa/Kampala": "uganda",
};

const COUNTRY_NAME: Record<Country, string> = {
  india: "India",
  rwanda: "Rwanda",
  uganda: "Uganda",
};

/** Country is not stored; it follows from the academy's time zone. */
export function academyCountry(academy: Academy): Country {
  return COUNTRY_BY_TIMEZONE[academy.timezone] ?? "rwanda";
}

export function countryName(country: Country): string {
  return COUNTRY_NAME[country];
}

/** Line under the name in the sidebar: "Admin", "Coach · U12, U14, U16", "Student · U14". */
export function viewerSubtitle(viewer: Viewer): string {
  if (isOwner(viewer)) {
    return "Owner · all academies";
  }
  const membership = getActiveMembership(viewer);
  if (!membership) {
    return "";
  }
  const role = primaryRole(membership);
  const teamNames = membership.teams.map((t) => t.name).join(", ");
  if (role === "admin" || !teamNames) {
    return roleLabel(role);
  }
  return `${roleLabel(role)} · ${teamNames}`;
}

/** Phone academy chip: "Kigali · Admin" (admin), "Kigali" (coach), "Kigali · U14" (student). */
export function academyChipLabel(membership: Membership): string {
  const role = primaryRole(membership);
  const { shortName } = membership.academy;
  if (role === "admin") {
    return `${shortName} · Admin`;
  }
  if (role === "student" && membership.teams[0]) {
    return `${shortName} · ${membership.teams[0].name}`;
  }
  return shortName;
}

export type AppHome = "/owner" | "/admin" | "/coach" | "/student" | "/join";

/** Where to land after sign-in. Someone in no academy yet goes to /join for a code. */
export function homePathFor(viewer: Viewer): AppHome {
  if (isOwner(viewer)) {
    return "/owner";
  }
  const membership = getActiveMembership(viewer);
  if (!membership) {
    return "/join";
  }
  return `/${primaryRole(membership)}`;
}
