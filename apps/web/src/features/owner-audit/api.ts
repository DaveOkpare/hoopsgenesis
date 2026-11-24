/*
 * Platform audit log for the owner (PA-3): `GET /api/v1/admin/audit-log`, every
 * academy, newest first, cursor-paginated. Filters are the server's own:
 * `academyId` (also matches that academy's platform rows: create, delete, admin join
 * codes), `actorId`, one `entityType` or one `action`, and `from` (YYYY-MM-DD, UTC on
 * this route). The server does not count rows, so the screen shows no total.
 *
 * Rows carry `actor` and, when the change was made while the owner was viewing as
 * that person, `impersonatedBy`. The person a change was about is an id in the row's
 * before/after snapshot; names come from that academy's member list
 * (`GET /api/v1/admin/academies/:id/members`) and, for impersonation rows, from
 * Better Auth `admin.getUser`.
 */
import type { AuditLogItem } from "@/features/audit-log/queries";
import type { Id } from "@/features/types";
import {
  apiAll,
  apiPage,
  ownerAcademyPath,
  unwrapAuth,
} from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { formatDayMonth, formatMoney } from "@/lib/format";
import { appNow, isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** "Type" filter: each maps to exactly one server filter. */
export type OwnerAuditType =
  | "all"
  | "fee"
  | "attendance"
  | "record"
  | "roster"
  | "member"
  | "join_code"
  | "calendar"
  | "academy"
  | "qr"
  | "support";

export type OwnerAuditDate = "7d" | "30d" | "90d" | "all";

export interface OwnerAuditFilters {
  academyId: Id | null;
  actorId: Id | null;
  date: OwnerAuditDate;
  type: OwnerAuditType;
}

export interface OwnerAuditAcademy {
  id: Id;
  shortName: string;
  timezone: string;
}

/** An academy-log item plus the academy it happened in (null for platform rows). */
export interface OwnerAuditItem extends AuditLogItem {
  academy: OwnerAuditAcademy | null;
}

export interface OwnerAuditPage {
  items: OwnerAuditItem[];
  nextCursor: string | null;
}

const SERVER_FILTER: Record<
  OwnerAuditType,
  { entityType?: string; action?: string }
> = {
  all: {},
  fee: { entityType: "fee" },
  attendance: { entityType: "attendance" },
  record: { entityType: "student_record" },
  roster: { entityType: "team" },
  member: { entityType: "member" },
  join_code: { entityType: "invitation_code" },
  calendar: { entityType: "calendar_event" },
  academy: { entityType: "academy" },
  qr: { action: "academy_qr.regenerate" },
  support: { entityType: "user" },
};

const DAY_MS = 86_400_000;
const DAYS: Record<Exclude<OwnerAuditDate, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

interface ServerAuditRow {
  academyId: Id | null;
  action: string;
  actor: { id: Id; name: string } | null;
  actorId: Id | null;
  after: unknown;
  before: unknown;
  createdAt: string;
  entityId: Id;
  entityType: string;
  id: Id;
  impersonatedBy: { id: Id; name: string } | null;
  reason: string | null;
}

type Snapshot = Record<string, unknown>;

interface Directory {
  people: Map<Id, string>;
  teams: Map<Id, string>;
}

const CONTEXT_KEYS = new Set([
  "amount",
  "currency",
  "periodStart",
  "sessionDate",
  "status",
]);

const TEMPLATE_LABEL: Record<string, string> = {
  report_card: "report card",
  sprint_100m: "100 m sprint",
  fitness_test: "fitness test",
};

function asSnapshot(value: unknown): Snapshot | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Snapshot)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Before and after reduced to what changed (plus a little context). */
function compact(
  before: Snapshot | null,
  after: Snapshot | null
): { before: Snapshot | null; after: Snapshot | null } {
  if (!(before && after)) {
    return { before, after };
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const kept = keys.filter(
    (key) => CONTEXT_KEYS.has(key) || !same(before[key], after[key])
  );
  const pick = (source: Snapshot) =>
    Object.fromEntries(kept.map((key) => [key, source[key] ?? null]));
  return { before: pick(before), after: pick(after) };
}

function withNames(snapshot: Snapshot | null, people: Map<Id, string>) {
  if (!snapshot) {
    return snapshot;
  }
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, value]) => {
      const isPerson =
        key.endsWith("ById") ||
        key === "studentId" ||
        key === "userId" ||
        key === "impersonatedBy";
      const name =
        isPerson && typeof value === "string" ? people.get(value) : undefined;
      return [key, name ?? value];
    })
  );
}

function subjectIdOf(row: ServerAuditRow): Id | null {
  const before = asSnapshot(row.before);
  const after = asSnapshot(row.after);
  const member = asSnapshot(after?.member) ?? asSnapshot(before?.member);
  if (row.entityType === "user") {
    return row.entityId;
  }
  return (
    str(after?.studentId) ??
    str(before?.studentId) ??
    str(after?.userId) ??
    str(before?.userId) ??
    str(member?.userId)
  );
}

function summaryOf(
  row: ServerAuditRow,
  directory: Directory,
  timeZone: string | undefined
): string | null {
  const snapshot = asSnapshot(row.after) ?? asSnapshot(row.before);
  const [entity] = row.action.split(".");
  if (entity === "fee" && snapshot) {
    const amount = str(snapshot.amount) ?? String(snapshot.amount ?? "");
    const currency = str(snapshot.currency);
    return amount && currency
      ? formatMoney({ amount: Number(amount).toFixed(2), currency })
      : null;
  }
  if (entity === "attendance" && snapshot) {
    const date = str(snapshot.sessionDate);
    return date
      ? formatDayMonth(date.slice(0, "YYYY-MM-DD".length), timeZone)
      : null;
  }
  if (entity === "record") {
    const template = str(asSnapshot(snapshot?.data)?.template);
    return template ? (TEMPLATE_LABEL[template] ?? template) : null;
  }
  if (entity === "team") {
    return directory.teams.get(row.entityId) ?? null;
  }
  return null;
}

function toItem(
  row: ServerAuditRow,
  academy: OwnerAuditAcademy | null,
  directory: Directory
): OwnerAuditItem {
  const subjectId = subjectIdOf(row);
  const subjectName = subjectId ? directory.people.get(subjectId) : undefined;
  const shown = compact(
    withNames(asSnapshot(row.before), directory.people),
    withNames(asSnapshot(row.after), directory.people)
  );
  return {
    id: row.id,
    academyId: row.academyId,
    academy,
    action: row.action,
    actorId: row.actorId,
    actor: row.actor,
    impersonatedBy: row.impersonatedBy,
    entityType: row.entityType,
    entityId: row.entityId,
    before: shown.before,
    after: shown.after,
    reason: row.reason,
    createdAt: row.createdAt,
    subject:
      subjectId && subjectName ? { id: subjectId, name: subjectName } : null,
    summary: summaryOf(row, directory, academy?.timezone),
  };
}

/** The academy a platform row (academy_id null) is about, if any. */
function academyIdOf(row: ServerAuditRow): Id | null {
  if (row.academyId) {
    return row.academyId;
  }
  if (row.entityType === "academy") {
    return row.entityId;
  }
  return str(asSnapshot(row.after)?.academyId);
}

async function loadDirectory(
  academyIds: Id[],
  userIds: Id[]
): Promise<Directory> {
  const people = new Map<Id, string>();
  const teams = new Map<Id, string>();
  const [memberLists, teamLists, users] = await Promise.all([
    Promise.all(
      academyIds.map((id) =>
        apiAll<{ userId: Id; name: string }>(ownerAcademyPath(id, "/members"))
      )
    ),
    Promise.all(
      academyIds.map((id) =>
        apiAll<{ id: Id; name: string }>(ownerAcademyPath(id, "/teams"))
      )
    ),
    Promise.all(
      userIds.map(async (id) => {
        const result = await authClient.admin.getUser({ query: { id } });
        return result.data
          ? { id, name: String((result.data as { name?: string }).name ?? "") }
          : null;
      })
    ),
  ]);
  for (const member of memberLists.flat()) {
    people.set(member.userId, member.name);
  }
  for (const team of teamLists.flat()) {
    teams.set(team.id, team.name);
  }
  for (const user of users) {
    if (user) {
      people.set(user.id, user.name);
    }
  }
  return { people, teams };
}

export function fromDate(date: OwnerAuditDate): string | undefined {
  if (date === "all") {
    return;
  }
  return new Date(appNow().getTime() - DAYS[date] * DAY_MS)
    .toISOString()
    .slice(0, "YYYY-MM-DD".length);
}

/**
 * One page of the platform log. `academies` names each row's academy (the console
 * list, already cached by the caller).
 */
export async function listOwnerAuditPage(input: {
  filters: OwnerAuditFilters;
  limit: number;
  cursor: string | null;
  academies: Map<Id, OwnerAuditAcademy>;
}): Promise<OwnerAuditPage> {
  if (mock) {
    return (await mock()).listOwnerAuditPage(input);
  }
  const { filters } = input;
  const page = await apiPage<ServerAuditRow>("/admin/audit-log", {
    query: {
      limit: input.limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(filters.academyId ? { academyId: filters.academyId } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...SERVER_FILTER[filters.type],
      ...(fromDate(filters.date) ? { from: fromDate(filters.date) } : {}),
    },
  });
  const academyIds = [
    ...new Set(
      page.data.flatMap((row) => {
        const id = academyIdOf(row);
        return id && input.academies.has(id) ? [id] : [];
      })
    ),
  ];
  const userIds = [
    ...new Set(
      page.data.flatMap((row) =>
        row.entityType === "user" ? [row.entityId] : []
      )
    ),
  ];
  const directory = await loadDirectory(academyIds, userIds);
  return {
    items: page.data.map((row) => {
      const id = academyIdOf(row);
      return toItem(row, (id && input.academies.get(id)) || null, directory);
    }),
    nextCursor: page.nextCursor,
  };
}

/** A person's name for the "Person" filter label (Better Auth `admin.getUser`). */
export async function getPersonName(userId: Id): Promise<string | null> {
  if (mock) {
    return (await mock()).getPersonName(userId);
  }
  const result = await authClient.admin.getUser({ query: { id: userId } });
  if (result.error?.status === 404) {
    return null;
  }
  const user = unwrapAuth(result) as { name?: string };
  return user.name ?? null;
}

/**
 * Everyone who acted in the last 90 days (newest 200 rows), for the "Person" filter.
 * The server has no "distinct actors" endpoint.
 */
export async function listRecentActors(): Promise<{ id: Id; name: string }[]> {
  if (mock) {
    return (await mock()).listRecentActors();
  }
  const page = await apiPage<ServerAuditRow>("/admin/audit-log", {
    query: { limit: 200, from: fromDate("90d") },
  });
  const seen = new Map<Id, string>();
  for (const row of page.data) {
    if (row.actor) {
      seen.set(row.actor.id, row.actor.name);
    }
  }
  return [...seen]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
