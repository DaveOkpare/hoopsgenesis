/*
 * Navigation per role. One config drives the desktop sidebar AND the phone tab bar.
 * To add a screen to the nav: add its route file, then an entry here.
 * - `tab: true` puts it in the phone tab bar (order = array order, or `tabOrder`). Items without it
 *   are listed under "More" on phones when the role has `moreTab`.
 * - `tabLabel` overrides the label in the tab bar ("Home" -> "Today").
 * - `exact` for index routes; `alsoActiveOn` marks it active on other paths.
 * - `dividerBefore` draws the hairline in the sidebar (admin: before QR code).
 * - `countKey` shows a count from the shell's counts map (orange-deep on light sidebars).
 */
import type { LinkProps } from "@tanstack/react-router";

import type { NavIconName } from "@/components/app-shell/nav-icons";

const TRAILING_SLASH = /\/$/;

export type NavCountKey = "unpaidFees" | "pendingRecords" | "academies";

export interface NavItem {
  alsoActiveOn?: string[];
  countKey?: NavCountKey;
  dividerBefore?: boolean;
  exact?: boolean;
  icon: NavIconName;
  label: string;
  tab?: boolean;
  /** Tab bar position when it differs from the sidebar order (lower first). */
  /** Like `alsoActiveOn`, but only for the phone tab bar (the sidebar has its own entry). */
  tabAlsoActiveOn?: string[];
  tabIcon?: NavIconName;
  tabLabel?: string;
  tabOrder?: number;
  to: NonNullable<LinkProps["to"]>;
}

export interface ShellConfig {
  /** Phone: paths (and their children) drawn without the tab bar, as focused task screens. */
  hideTabBarOn?: string[];
  /** Phone: last tab opens a sheet with the remaining nav items. */
  moreTab?: boolean;
  nav: NavItem[];
  /** "Best on your phone" card above the user (coach web). */
  phoneNudge?: boolean;
  /** Coach and student web screens start 40px down; admin and owner 36px. */
  roomyTop?: boolean;
  /** Light fog sidebar with the academy switcher, or the dark owner sidebar. */
  tone: "light" | "dark";
}

export const adminShell: ShellConfig = {
  tone: "light",
  moreTab: true,
  nav: [
    {
      to: "/admin",
      label: "Dashboard",
      icon: "dashboard",
      exact: true,
      tab: true,
      tabOrder: 1,
      tabLabel: "Home",
      alsoActiveOn: ["/admin/setup"],
    },
    {
      to: "/admin/calendar",
      label: "Calendar",
      icon: "calendar",
      tab: true,
      tabOrder: 4,
    },
    { to: "/admin/teams", label: "Teams", icon: "teams" },
    {
      to: "/admin/members",
      label: "Members",
      icon: "members",
      tab: true,
      tabOrder: 3,
      alsoActiveOn: ["/admin/join-codes"],
    },
    { to: "/admin/attendance", label: "Attendance", icon: "attendance" },
    {
      to: "/admin/fees",
      label: "Fees",
      icon: "fees",
      tab: true,
      tabOrder: 2,
      countKey: "unpaidFees",
    },
    {
      to: "/admin/records",
      label: "Records",
      icon: "records",
      countKey: "pendingRecords",
    },
    { to: "/admin/qr", label: "QR code", icon: "qr", dividerBefore: true },
    { to: "/admin/activity", label: "Activity log", icon: "activity" },
    { to: "/admin/settings", label: "Academy settings", icon: "settings" },
  ],
};

export const ownerShell: ShellConfig = {
  tone: "dark",
  nav: [
    {
      to: "/owner",
      label: "Academies",
      icon: "academies",
      exact: true,
      tab: true,
      alsoActiveOn: ["/owner/academies"],
      countKey: "academies",
    },
    { to: "/owner/users", label: "Users", icon: "members", tab: true },
    { to: "/owner/audit", label: "Audit log", icon: "activity", tab: true },
  ],
};

export const coachShell: ShellConfig = {
  hideTabBarOn: [
    "/coach/sessions",
    "/coach/calendar/new",
    "/coach/results/new",
  ],
  tone: "light",
  phoneNudge: true,
  roomyTop: true,
  nav: [
    {
      to: "/coach",
      label: "Today",
      icon: "today",
      exact: true,
      tab: true,
      alsoActiveOn: ["/coach/sessions"],
    },
    { to: "/coach/calendar", label: "Calendar", icon: "calendar", tab: true },
    {
      to: "/coach/teams",
      label: "My teams",
      icon: "members",
      tab: true,
      tabLabel: "Teams",
    },
    { to: "/coach/attendance", label: "Attendance", icon: "attendance" },
    {
      to: "/coach/records",
      label: "Records",
      icon: "records",
      tab: true,
      countKey: "pendingRecords",
      alsoActiveOn: ["/coach/results"],
    },
  ],
};

export const studentShell: ShellConfig = {
  hideTabBarOn: ["/student/records"],
  tone: "light",
  roomyTop: true,
  nav: [
    {
      to: "/student",
      label: "Home",
      icon: "home",
      exact: true,
      tab: true,
      tabLabel: "Today",
      tabIcon: "today",
    },
    { to: "/student/calendar", label: "Calendar", icon: "calendar", tab: true },
    { to: "/student/attendance", label: "Attendance", icon: "attendance" },
    {
      to: "/student/progress",
      label: "Progress",
      icon: "progress",
      tab: true,
      alsoActiveOn: ["/student/records"],
      tabAlsoActiveOn: ["/student/attendance"],
    },
    {
      to: "/student/fees",
      label: "Fees",
      icon: "fees",
      tab: true,
      countKey: "unpaidFees",
    },
  ],
};

function normalizePath(pathname: string): string {
  return pathname.replace(TRAILING_SLASH, "") || "/";
}

function pathMatches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isNavItemActive(
  item: NavItem,
  pathname: string,
  surface: "sidebar" | "tab" = "sidebar"
): boolean {
  const to = String(item.to);
  const path = normalizePath(pathname);
  const extra =
    surface === "tab"
      ? [...(item.alsoActiveOn ?? []), ...(item.tabAlsoActiveOn ?? [])]
      : (item.alsoActiveOn ?? []);
  if (extra.some((prefix) => pathMatches(path, prefix))) {
    return true;
  }
  return item.exact ? path === to : pathMatches(path, to);
}

export function isTabBarHidden(config: ShellConfig, pathname: string): boolean {
  const path = normalizePath(pathname);
  return (config.hideTabBarOn ?? []).some((prefix) =>
    pathMatches(path, prefix)
  );
}
