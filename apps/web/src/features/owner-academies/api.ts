/*
 * Owner console: every academy on the platform (stories PA-1, PA-3).
 * Data-layer convention: see features/viewer/api.ts. The platform owner is never an
 * academy member, so everything here goes through the owner's own routes under
 * /api/v1/admin (src/server/api/v1/admin-academies.ts, admin-academy-views.ts).
 */
import type { Academy, AcademyRole, Id, Timestamp } from "@/features/types";
import { parseRoles, toAcademy } from "@/features/viewer/api";
import { apiAll, apiData, apiPage, ownerAcademyPath } from "@/lib/api-client";
import { appNow, isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** Console status pill: "Active", "QR replaced", "Admin invited". */
export type PlatformAcademyStatus = "active" | "qr_replaced" | "admin_invited";

/** An academy admin as the console names them. */
export interface AcademyAdmin {
  email: string;
  name: string;
  userId: Id;
}

export interface PlatformAcademy {
  academy: Academy;
  /** The academy admin named on the row, or null until an invite is accepted. */
  adminName: string | null;
  admins: AcademyAdmin[];
  memberCount: number;
  /** Email of the pending first-admin invite, if any. */
  pendingAdminEmail: string | null;
  qr: { regeneratedAt: Timestamp | null; regeneratedBy: string | null };
  status: PlatformAcademyStatus;
  teamCount: number;
}

export interface AcademyActivity {
  action: string;
  createdAt: Timestamp;
  id: Id;
  summary: string;
}

/** Members holding each role; a "coach,student" member counts in both. */
export interface AcademyRoleCounts {
  admins: number;
  coaches: number;
  students: number;
}

/** An academy admin with every role they hold there ("Admin and coach"). */
export interface AcademyAdminPerson {
  name: string;
  roles: AcademyRole[];
  userId: Id;
}

export interface PlatformAcademyDetail extends PlatformAcademy {
  adminPeople: AcademyAdminPerson[];
  counts: AcademyRoleCounts & { teams: number };
  recentActivity: AcademyActivity[];
}

/** An address the location picker can jump to. */
export interface Place {
  currency: string;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface CreateAcademyInput {
  address: string;
  adminEmail: string;
  attendanceRadiusM: number;
  defaultCurrency: string;
  latitude: number;
  longitude: number;
  name: string;
  slug: string;
  timezone: string;
}

/** One row of GET /api/v1/admin/academies. */
interface AcademyRowDto extends Record<string, unknown> {
  admins: { email: string; name: string; userId: Id }[];
  id: Id;
  memberCount: number;
  pendingAdminInvitations: { email: string; expiresAt: Timestamp; id: Id }[];
  teamCount: number;
}

interface AuditRowDto {
  academyId: Id | null;
  action: string;
  actor: { id: Id; name: string } | null;
  after: Record<string, unknown> | null;
  createdAt: Timestamp;
  entityId: string;
  entityType: string;
  id: Id;
}

interface MemberDto {
  name: string;
  roles: string[];
  userId: Id;
}

const QR_REGENERATE_ACTION = "academy_qr.regenerate";
const QR_RECENT_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const RECENT_ACTIVITY_LIMIT = 3;

type QrState = PlatformAcademy["qr"];
const NO_QR_CHANGE: QrState = { regeneratedAt: null, regeneratedBy: null };

function statusOf(
  row: Pick<PlatformAcademy, "adminName" | "pendingAdminEmail" | "qr">
): PlatformAcademyStatus {
  if (row.pendingAdminEmail && !row.adminName) {
    return "admin_invited";
  }
  const { regeneratedAt } = row.qr;
  if (
    regeneratedAt &&
    appNow().getTime() - Date.parse(regeneratedAt) < QR_RECENT_DAYS * MS_PER_DAY
  ) {
    return "qr_replaced";
  }
  return "active";
}

function toPlatformAcademy(dto: AcademyRowDto, qr: QrState): PlatformAcademy {
  const row = {
    academy: toAcademy(dto),
    adminName: dto.admins[0]?.name ?? null,
    admins: dto.admins,
    memberCount: dto.memberCount,
    teamCount: dto.teamCount,
    pendingAdminEmail: dto.pendingAdminInvitations[0]?.email ?? null,
    qr,
  };
  return { ...row, status: statusOf(row) };
}

function qrFrom(row: AuditRowDto | undefined): QrState {
  return row
    ? { regeneratedAt: row.createdAt, regeneratedBy: row.actor?.name ?? null }
    : NO_QR_CHANGE;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, "YYYY-MM-DD".length);
}

/** The latest QR replacement per academy over the last two weeks (one query). */
async function recentQrChanges(): Promise<Map<Id, AuditRowDto>> {
  const from = new Date(appNow().getTime() - QR_RECENT_DAYS * MS_PER_DAY);
  const rows = await apiAll<AuditRowDto>("/admin/audit-log", {
    query: { action: QR_REGENERATE_ACTION, from: isoDate(from) },
    maxItems: 1000,
  });
  const latest = new Map<Id, AuditRowDto>();
  for (const row of rows) {
    // Newest first, so the first row per academy is the latest.
    if (row.academyId && !latest.has(row.academyId)) {
      latest.set(row.academyId, row);
    }
  }
  return latest;
}

/**
 * Every academy on the platform, newest first:
 * `GET /api/v1/admin/academies` (admins, pending admin invitations, member and team
 * counts) + `GET /api/v1/admin/audit-log?action=academy_qr.regenerate&from=` for the
 * "QR replaced" pill.
 */
export async function listPlatformAcademies(): Promise<PlatformAcademy[]> {
  if (mock) {
    return (await mock()).listPlatformAcademies();
  }
  const [rows, qrChanges] = await Promise.all([
    apiAll<AcademyRowDto>("/admin/academies"),
    recentQrChanges(),
  ]);
  return rows.map((dto) =>
    toPlatformAcademy(dto, qrFrom(qrChanges.get(dto.id)))
  );
}

const ACTION_PHRASES: Record<string, string> = {
  "academy.create": "created the academy",
  "academy.delete": "deleted the academy",
  "academy.admin_appoint": "appointed an admin",
  "academy.admin_invite": "invited an admin",
  "academy.admin_invite_cancel": "cancelled an admin invitation",
  "academy.admin_remove": "removed an admin",
  "user.impersonate_start": "started viewing as someone",
  "user.impersonate_stop": "stopped viewing as someone",
  [QR_REGENERATE_ACTION]: "replaced the QR code",
  "attendance.check_out": "checked a student out",
  "attendance.verify": "ticked attendance",
  "attendance.unverify": "unticked attendance",
  "attendance.void": "voided attendance",
  "event.delete": "deleted an event",
  "event.session_cancel": "cancelled a session",
  "fee.create": "recorded a payment",
  "fee.void": "voided a payment",
  "invitation_code.create": "made a join code",
  "invitation_code.revoke": "revoked a join code",
  "member.join_by_code": "joined with a code",
  "record.create": "added a record",
  "record.verify": "verified a record",
  "record.reject": "rejected a record",
  "team.member_add": "added someone to a team",
  "team.member_remove": "removed someone from a team",
};

/** "Sharika D. voided a payment" from an audit row. */
function describeActivity(row: AuditRowDto): string {
  const who = row.actor?.name ?? "Someone";
  const phrase =
    ACTION_PHRASES[row.action] ?? row.action.replaceAll(/[._]/g, " ");
  return `${who} ${phrase}`;
}

function countRoles(members: MemberDto[]): AcademyRoleCounts {
  const counts: Partial<Record<string, number>> = {};
  for (const member of members) {
    for (const role of member.roles) {
      counts[role] = (counts[role] ?? 0) + 1;
    }
  }
  return {
    admins: counts.admin ?? 0,
    coaches: counts.coach ?? 0,
    students: counts.student ?? 0,
  };
}

/**
 * Admins, coaches and students of one academy, for a console row:
 * `GET /api/v1/admin/academies/:id/members` (every page), counted by role. The list
 * endpoint only has `memberCount`, so each visible row asks for its own counts.
 */
export async function getAcademyRoleCounts(
  academyId: Id
): Promise<AcademyRoleCounts> {
  if (mock) {
    return (await mock()).getAcademyRoleCounts(academyId);
  }
  return countRoles(
    await apiAll<MemberDto>(ownerAcademyPath(academyId, "/members"))
  );
}

/**
 * One academy with members by role, teams, QR status and its recent audit log:
 * the console row from `GET /api/v1/admin/academies`, plus
 * `GET /api/v1/admin/academies/:id/members` (counted by role) and
 * `GET /api/v1/admin/academies/:id/audit-log` (latest rows, and the latest QR
 * replacement). There is no single-academy GET, so the row comes from the list.
 */
export async function getPlatformAcademy(
  academyId: Id
): Promise<PlatformAcademyDetail | null> {
  if (mock) {
    return (await mock()).getPlatformAcademy(academyId);
  }
  const rows = await apiAll<AcademyRowDto>("/admin/academies");
  const dto = rows.find((row) => row.id === academyId);
  if (!dto) {
    return null;
  }
  const [members, recent, qrRows] = await Promise.all([
    apiAll<MemberDto>(ownerAcademyPath(academyId, "/members")),
    apiPage<AuditRowDto>(ownerAcademyPath(academyId, "/audit-log"), {
      query: { limit: RECENT_ACTIVITY_LIMIT },
    }),
    apiPage<AuditRowDto>(ownerAcademyPath(academyId, "/audit-log"), {
      query: { action: QR_REGENERATE_ACTION, limit: 1 },
    }),
  ]);
  return {
    ...toPlatformAcademy(dto, qrFrom(qrRows.data[0])),
    counts: { ...countRoles(members), teams: dto.teamCount },
    adminPeople: members
      .filter((member) => member.roles.includes("admin"))
      .map((member) => ({
        userId: member.userId,
        name: member.name,
        roles: parseRoles(member.roles.join(",")),
      })),
    recentActivity: recent.data.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt,
      summary: describeActivity(row),
    })),
  };
}

/**
 * `POST /api/v1/admin/academies` with `firstAdmin: { email }`. Someone with an
 * account becomes the admin straight away; an email with no account gets a pending
 * admin invitation (the row then shows "Admin invited").
 */
export async function createAcademy(
  input: CreateAcademyInput
): Promise<PlatformAcademy> {
  if (mock) {
    return (await mock()).createAcademy(input);
  }
  const created = await apiData<
    Record<string, unknown> & {
      firstAdmin:
        | { status: "member"; member: { userId: Id } }
        | { status: "invited"; invitation: { email: string } };
      id: Id;
    }
  >("/admin/academies", {
    method: "POST",
    body: {
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
      defaultCurrency: input.defaultCurrency,
      latitude: input.latitude,
      longitude: input.longitude,
      attendanceRadiusM: input.attendanceRadiusM,
      location: input.address || undefined,
      firstAdmin: { email: input.adminEmail },
    },
  });
  const invited = created.firstAdmin.status === "invited";
  const row = {
    academy: toAcademy(created),
    // The admin's name isn't in the create response; the list refetch fills it in.
    adminName: null,
    admins: [],
    memberCount: invited ? 0 : 1,
    teamCount: 0,
    pendingAdminEmail: invited ? input.adminEmail : null,
    qr: NO_QR_CHANGE,
  };
  return { ...row, status: statusOf(row) };
}

/**
 * Replacing the QR code is `POST /academies/:id/academy-qr/regenerate`, which only an
 * academy admin may call; there is no owner route (the owner's academy views are
 * read-only). Preview only: the console hides the button in real mode
 * (`OWNER_CAN_REPLACE_QR`). To replace it, the owner impersonates the academy admin.
 */
export async function regenerateAcademyQr(input: {
  academyId: Id;
}): Promise<PlatformAcademy> {
  if (mock) {
    return (await mock()).regenerateAcademyQr(input);
  }
  throw new Error(
    "Only the academy's admin can replace its QR code. Use “View as” on the admin."
  );
}

/** True where the owner can replace an academy's QR code (preview only, see above). */
export const OWNER_CAN_REPLACE_QR = Boolean(mock);

/**
 * Address search for the location picker. There is no geocoding service yet, so in
 * real mode this returns nothing: the owner types the address and drops the pin.
 */
export async function searchPlaces(): Promise<Place[]> {
  if (mock) {
    return (await mock()).searchPlaces();
  }
  return [];
}

export type AdminAppointment =
  | { status: "member" }
  | { status: "invited"; email: string };

/**
 * `POST /api/v1/admin/academies/:academyId/admins` with `{ userId }`: someone already
 * in the academy gains `admin`; anyone else joins as its admin. 409 `already_admin`,
 * 422 `platform_admin_cannot_be_member`. Written to the audit log by the server.
 */
export async function appointAcademyAdmin(input: {
  academyId: Id;
  userId: Id;
}): Promise<AdminAppointment> {
  if (mock) {
    return (await mock()).appointAcademyAdmin(input);
  }
  const result = await apiData<
    { status: "member" } | { status: "invited"; invitation: { email: string } }
  >(ownerAcademyPath(input.academyId, "/admins"), {
    method: "POST",
    body: { userId: input.userId },
  });
  return result.status === "invited"
    ? { status: "invited", email: result.invitation.email }
    : { status: "member" };
}

/**
 * `DELETE /api/v1/admin/academies/:academyId/admins/:userId`: takes away the admin
 * role; someone who held no other role there leaves the academy (and its teams).
 */
export async function removeAcademyAdmin(input: {
  academyId: Id;
  userId: Id;
}): Promise<void> {
  if (mock) {
    return (await mock()).removeAcademyAdmin(input);
  }
  await apiData<unknown>(
    ownerAcademyPath(
      input.academyId,
      `/admins/${encodeURIComponent(input.userId)}`
    ),
    { method: "DELETE" }
  );
}
