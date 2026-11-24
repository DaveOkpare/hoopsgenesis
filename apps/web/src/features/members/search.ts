/*
 * URL state for /admin/members, so every tab, filter, page and dialog can be linked to:
 *   ?tab=invites                     Invites tab
 *   ?q=aline&team=team-u14           search and team filter
 *   ?page=2&per=50                   desktop page 2 of 50 rows (tablet and phone: the
 *                                    first 2 × 50 rows, "Show 25 more")
 *   ?invite=1&role=coach             Invite people dialog, coach picked (Dashboard, Setup)
 *   ?invite=<invitationId>           one pending invite (GPF-0). Only academy admins
 *                                    open this page, and they already receive the ids.
 */
import type { InvitableRole } from "@/features/members/api";

export type MembersTab = "all" | "students" | "coaches" | "admins" | "invites";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface MembersSearch {
  /** `1` opens the Invite people dialog; any other value is an invitation id. */
  invite?: 1 | string;
  page?: number;
  per?: PageSize;
  q?: string;
  /** Role the invite form starts on (`?invite=1&role=coach` from the setup checklist). */
  role?: InvitableRole;
  tab?: MembersTab;
  team?: string;
}

const TABS: readonly MembersTab[] = [
  "all",
  "students",
  "coaches",
  "admins",
  "invites",
];

function text(value: unknown): string | undefined {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseInvite(value: unknown): 1 | string | undefined {
  if (value === 1 || value === "1" || value === true) {
    return 1;
  }
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseMembersSearch(
  raw: Record<string, unknown>
): MembersSearch {
  const out: MembersSearch = {};
  const invite = parseInvite(raw.invite);
  if (invite !== undefined) {
    out.invite = invite;
  }
  if (raw.role === "coach" || raw.role === "student") {
    out.role = raw.role;
  }
  if (TABS.includes(raw.tab as MembersTab) && raw.tab !== "all") {
    out.tab = raw.tab as MembersTab;
  }
  const q = text(raw.q);
  if (q) {
    out.q = q;
  }
  const team = text(raw.team);
  if (team) {
    out.team = team;
  }
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) {
    out.page = page;
  }
  const per = Number(raw.per);
  if (PAGE_SIZES.includes(per as PageSize) && per !== PAGE_SIZES[0]) {
    out.per = per as PageSize;
  }
  return out;
}
