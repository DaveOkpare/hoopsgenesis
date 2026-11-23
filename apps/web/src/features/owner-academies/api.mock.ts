/*
 * Preview-mode (fixture) implementation of features/owner-academies/api.ts. Dev only.
 * The store below starts from fixtures and is changed by the mutations, so created
 * academies, replaced QR codes and admin changes stay visible until the page reloads.
 */
import {
  academies as academyFixtures,
  FIXTURE_NOW,
  fixtureDelay,
  members,
  users,
} from "@/features/fixtures";
import type {
  AcademyActivity,
  AcademyAdmin,
  AcademyAdminPerson,
  AcademyRoleCounts,
  AdminAppointment,
  CreateAcademyInput,
  Place,
  PlatformAcademy,
  PlatformAcademyDetail,
  PlatformAcademyStatus,
} from "@/features/owner-academies/api";
import {
  type AcademyStatsFixture,
  academyActivity,
  academyStats,
  extraAcademies,
  fillerAcademies,
  places,
} from "@/features/owner-academies/fixtures";
import type { Academy, AcademyRole, Id } from "@/features/types";

const QR_RECENT_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const RECENT_ACTIVITY_LIMIT = 3;

interface StoredAcademy {
  academy: Academy;
  adminPeople: AcademyAdminPerson[];
  counts: PlatformAcademyDetail["counts"];
  pendingAdminEmail: string | null;
  qr: PlatformAcademy["qr"];
}

function statusOf(row: StoredAcademy): PlatformAcademyStatus {
  if (row.pendingAdminEmail && row.adminPeople.length === 0) {
    return "admin_invited";
  }
  const { regeneratedAt } = row.qr;
  if (
    regeneratedAt &&
    FIXTURE_NOW.getTime() - Date.parse(regeneratedAt) <
      QR_RECENT_DAYS * MS_PER_DAY
  ) {
    return "qr_replaced";
  }
  return "active";
}

/** Roles the drawn admins also hold (Sharika coaches in Kigali). */
function adminRoles(academyId: Id, userId: Id): AcademyRole[] {
  return (
    members.find((m) => m.academyId === academyId && m.userId === userId)
      ?.roles ?? ["admin"]
  );
}

function toStored(academy: Academy, stats: AcademyStatsFixture): StoredAcademy {
  return {
    academy,
    adminPeople: stats.admin
      ? [
          {
            userId: stats.admin.userId,
            name: stats.admin.name,
            roles: adminRoles(academy.id, stats.admin.userId),
          },
        ]
      : [],
    counts: {
      admins: stats.admins,
      coaches: stats.coaches,
      students: stats.students,
      teams: stats.teams,
    },
    pendingAdminEmail: null,
    qr: {
      regeneratedAt: stats.qrRegeneratedAt,
      regeneratedBy: stats.qrRegeneratedBy,
    },
  };
}

const allAcademies = [...academyFixtures, ...extraAcademies];

/** The drawn academies first, in the order ET2-0 shows them, then the filler. */
const store: StoredAcademy[] = [
  ...academyStats.flatMap((stats) => {
    const academy = allAcademies.find((a) => a.id === stats.academyId);
    return academy ? [toStored(academy, stats)] : [];
  }),
  ...fillerAcademies.map(({ academy, stats }) => toStored(academy, stats)),
];

/** Emails of the drawn admins, by user id. */
const adminEmails = new Map<Id, string>(
  [...academyStats, ...fillerAcademies.map((f) => f.stats)].flatMap((s) =>
    s.admin ? [[s.admin.userId, s.admin.email] as const] : []
  )
);

const activityByAcademy = new Map<Id, AcademyActivity[]>();
for (const entry of academyActivity) {
  const list = activityByAcademy.get(entry.academyId) ?? [];
  list.push({
    id: entry.id,
    action: entry.action,
    summary: entry.summary,
    createdAt: entry.createdAt,
  });
  activityByAcademy.set(entry.academyId, list);
}

function adminsOf(row: StoredAcademy): AcademyAdmin[] {
  return row.adminPeople.map((person) => ({
    userId: person.userId,
    name: person.name,
    email:
      adminEmails.get(person.userId) ??
      users.find((u) => u.id === person.userId)?.email ??
      "",
  }));
}

function toPlatformAcademy(row: StoredAcademy): PlatformAcademy {
  return {
    academy: row.academy,
    adminName: row.adminPeople[0]?.name ?? null,
    admins: adminsOf(row),
    memberCount: row.counts.admins + row.counts.coaches + row.counts.students,
    teamCount: row.counts.teams,
    pendingAdminEmail: row.pendingAdminEmail,
    qr: row.qr,
    status: statusOf(row),
  };
}

function findRow(academyId: Id): StoredAcademy {
  const row = store.find((r) => r.academy.id === academyId);
  if (!row) {
    throw new Error(`Academy ${academyId} was not found`);
  }
  return row;
}

function ownerName(): string {
  return users.find((u) => u.platformRole === "admin")?.name ?? "Owner";
}

function log(academyId: Id, action: string, summary: string): void {
  const list = activityByAcademy.get(academyId) ?? [];
  list.push({
    id: `audit-${academyId}-${list.length}-${action}`,
    action,
    summary,
    createdAt: FIXTURE_NOW.toISOString(),
  });
  activityByAcademy.set(academyId, list);
}

/** Every academy on the platform (Real: GET /api/v1/admin/academies, every page). */
export async function listPlatformAcademies(): Promise<PlatformAcademy[]> {
  await fixtureDelay();
  return store.map(toPlatformAcademy);
}

/** Real: GET /api/v1/admin/academies/:id/members, counted by role. */
export async function getAcademyRoleCounts(
  academyId: Id
): Promise<AcademyRoleCounts> {
  await fixtureDelay();
  const { admins, coaches, students } = findRow(academyId).counts;
  return { admins, coaches, students };
}

/** One academy with members by role, teams, QR status and its recent audit log. */
export async function getPlatformAcademy(
  academyId: Id
): Promise<PlatformAcademyDetail | null> {
  await fixtureDelay();
  const row = store.find((r) => r.academy.id === academyId);
  if (!row) {
    return null;
  }
  const recentActivity = (activityByAcademy.get(academyId) ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_ACTIVITY_LIMIT);
  return {
    ...toPlatformAcademy(row),
    counts: row.counts,
    adminPeople: row.adminPeople,
    recentActivity,
  };
}

const SHORT_NAME_PREFIX = /^hoops genesis\s+/i;

/** Real: POST /api/v1/admin/academies with `firstAdmin: { email }`. */
export async function createAcademy(
  input: CreateAcademyInput
): Promise<PlatformAcademy> {
  await fixtureDelay();
  if (store.some((r) => r.academy.slug === input.slug)) {
    throw new Error("That web address is already taken");
  }
  const now = FIXTURE_NOW.toISOString();
  const academy: Academy = {
    id: `acad-${input.slug}`,
    name: input.name,
    shortName: input.name.replace(SHORT_NAME_PREFIX, "") || input.name,
    slug: input.slug,
    logo: null,
    location: input.address,
    timezone: input.timezone,
    defaultCurrency: input.defaultCurrency,
    latitude: input.latitude,
    longitude: input.longitude,
    attendanceRadiusM: input.attendanceRadiusM,
    createdAt: now,
  };
  const row: StoredAcademy = {
    academy,
    adminPeople: [],
    counts: { admins: 0, coaches: 0, students: 0, teams: 0 },
    pendingAdminEmail: input.adminEmail,
    qr: { regeneratedAt: null, regeneratedBy: null },
  };
  store.unshift(row);
  log(academy.id, "academy.create", `${ownerName()} created the academy`);
  return toPlatformAcademy(row);
}

/** Preview only: no owner route replaces the QR code (see api.ts). */
export async function regenerateAcademyQr(input: {
  academyId: Id;
}): Promise<PlatformAcademy> {
  await fixtureDelay();
  const row = findRow(input.academyId);
  const by = ownerName();
  row.qr = { regeneratedAt: FIXTURE_NOW.toISOString(), regeneratedBy: by };
  log(input.academyId, "academy_qr.regenerate", `${by} replaced the QR code`);
  return toPlatformAcademy(row);
}

/** Address search for the location picker. Real: none yet (no geocoder). */
export async function searchPlaces(): Promise<Place[]> {
  await fixtureDelay();
  return places;
}

/** Real: POST /api/v1/admin/academies/:academyId/admins `{ userId }`. */
export async function appointAcademyAdmin(input: {
  academyId: Id;
  userId: Id;
}): Promise<AdminAppointment> {
  await fixtureDelay();
  const row = findRow(input.academyId);
  if (row.adminPeople.some((p) => p.userId === input.userId)) {
    throw new Error("Already an admin of this academy");
  }
  const person = users.find((u) => u.id === input.userId);
  const roles = members.find(
    (m) => m.academyId === input.academyId && m.userId === input.userId
  )?.roles;
  row.adminPeople.push({
    userId: input.userId,
    name: person?.name ?? "New admin",
    roles: ["admin", ...(roles ?? []).filter((r) => r !== "admin")],
  });
  row.counts.admins += 1;
  log(
    input.academyId,
    "academy.admin_appoint",
    `${ownerName()} appointed an admin`
  );
  return { status: "member" };
}

/** Real: DELETE /api/v1/admin/academies/:academyId/admins/:userId. */
export async function removeAcademyAdmin(input: {
  academyId: Id;
  userId: Id;
}): Promise<void> {
  await fixtureDelay();
  const row = findRow(input.academyId);
  const before = row.adminPeople.length;
  row.adminPeople = row.adminPeople.filter((p) => p.userId !== input.userId);
  if (row.adminPeople.length === before) {
    throw new Error("Not an admin of this academy");
  }
  row.counts.admins = Math.max(0, row.counts.admins - 1);
  log(
    input.academyId,
    "academy.admin_remove",
    `${ownerName()} removed an admin`
  );
}
