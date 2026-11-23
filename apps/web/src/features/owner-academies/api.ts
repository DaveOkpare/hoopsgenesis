/*
 * Owner console: every academy on the platform (stories PA-1, PA-3).
 * Follows the mock-data convention in features/viewer/api.ts. The store below starts
 * from fixtures and is changed by the mutations, so created academies and replaced QR
 * codes stay visible until the page reloads.
 */
import {
  academies as academyFixtures,
  FIXTURE_NOW,
  fixtureDelay,
  users,
} from "@/features/fixtures";
import {
  academyActivity,
  academyStats,
  type PlaceFixture,
  places,
} from "@/features/owner-academies/fixtures";
import type { Academy, Id, Timestamp } from "@/features/types";

/** Console status pill: "Active", "QR replaced", "Admin invited". */
export type PlatformAcademyStatus = "active" | "qr_replaced" | "admin_invited";

export interface PlatformAcademy {
  academy: Academy;
  /** The academy admin named on the row, or null until an invite is accepted. */
  adminName: string | null;
  counts: { admins: number; coaches: number; students: number; teams: number };
  memberCount: number;
  /** Email of the pending first-admin invite, if any. */
  pendingAdminEmail: string | null;
  qr: { regeneratedAt: Timestamp | null; regeneratedBy: string | null };
  status: PlatformAcademyStatus;
}

export interface AcademyActivity {
  action: string;
  createdAt: Timestamp;
  id: Id;
  summary: string;
}

export interface PlatformAcademyDetail extends PlatformAcademy {
  recentActivity: AcademyActivity[];
}

export type Place = PlaceFixture;

const QR_RECENT_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const RECENT_ACTIVITY_LIMIT = 3;

type StoredAcademy = Omit<PlatformAcademy, "status">;

function statusOf(row: StoredAcademy): PlatformAcademyStatus {
  if (row.pendingAdminEmail && !row.adminName) {
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

const store: StoredAcademy[] = academyFixtures.flatMap((academy) => {
  const stats = academyStats.find((s) => s.academyId === academy.id);
  if (!stats) {
    return [];
  }
  return [
    {
      academy,
      adminName: stats.adminName,
      memberCount: stats.members,
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
    },
  ];
});

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

function withStatus(row: StoredAcademy): PlatformAcademy {
  return { ...row, status: statusOf(row) };
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

/**
 * Every academy on the platform, newest last.
 * Real: platform-admin `organization.list` across all organizations, plus member,
 * team and QR counts per academy (an owner-only summary endpoint).
 */
export async function listPlatformAcademies(): Promise<PlatformAcademy[]> {
  await fixtureDelay();
  return store.map(withStatus);
}

/**
 * One academy with members by role, teams, QR status and its recent audit log.
 * Real: `organization.getFullOrganization({ organizationId })` +
 * `GET /api/v1/admin/audit-log?academyId=…` (newest first, first 3).
 */
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
  return { ...withStatus(row), recentActivity };
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

const SHORT_NAME_PREFIX = /^hoops genesis\s+/i;

/**
 * Real: `organization.create({ name, slug, metadata… timezone, defaultCurrency,
 * latitude, longitude, attendanceRadiusM, location })` then
 * `organization.inviteMember({ email, role: "admin", organizationId })`.
 */
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
    adminName: null,
    memberCount: 0,
    counts: { admins: 0, coaches: 0, students: 0, teams: 0 },
    pendingAdminEmail: input.adminEmail,
    qr: { regeneratedAt: null, regeneratedBy: null },
  };
  store.push(row);
  activityByAcademy.set(academy.id, [
    {
      id: `audit-${academy.id}-invite`,
      action: "member.invite",
      summary: `${ownerName().split(" ")[0]} invited ${input.adminEmail} as admin`,
      createdAt: now,
    },
  ]);
  return withStatus(row);
}

/** Real: `POST /academy-qr/regenerate` (as the owner, for this academy). */
export async function regenerateAcademyQr(input: {
  academyId: Id;
}): Promise<PlatformAcademy> {
  await fixtureDelay();
  const row = findRow(input.academyId);
  const now = FIXTURE_NOW.toISOString();
  const by = ownerName();
  row.qr = { regeneratedAt: now, regeneratedBy: by };
  const list = activityByAcademy.get(input.academyId) ?? [];
  list.push({
    id: `audit-${input.academyId}-qr-${list.length}`,
    action: "academy.qr_regenerate",
    summary: `${by.split(" ")[0]} replaced the QR code`,
    createdAt: now,
  });
  activityByAcademy.set(input.academyId, list);
  return withStatus(row);
}

/** Address search for the location picker. Real: a geocoding/places API. */
export async function searchPlaces(): Promise<Place[]> {
  await fixtureDelay();
  return places;
}

/** "Today" for relative dates. Real: `new Date()`. */
export function consoleNow(): Date {
  return FIXTURE_NOW;
}
