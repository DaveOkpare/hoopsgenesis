/*
 * Activity log (AO-9): `GET /api/v1/academies/:academyId/audit-log`, newest first.
 * The server writes every row inside the action that made the change (void, verify,
 * check-out, roster change, QR regenerate…); this screen only reads them.
 * Preview mode uses ./api.mock.ts (see lib/preview.ts).
 *
 * Rows name their actor (`actor: { id, name }`). The person a change was about is in
 * the row's before/after snapshot as an id (`studentId`, `userId`), so the name comes
 * from the academy's member list (features/fees/student-directory.ts).
 */
import { periodKeyOf, periodMonthName } from "@/features/fees/periods";
import {
  loadAcademy,
  loadStudentDirectory,
  personName,
  type StudentDirectory,
} from "@/features/fees/student-directory";
import type { AuditLogEntry, Id } from "@/features/types";
import { academyPath, apiPage, MAX_PAGE_SIZE } from "@/lib/api-client";
import { formatDayMonth, formatMoney } from "@/lib/format";
import { appNow, isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/**
 * One row as the screen needs it: the server's row plus `subject` (who the change was
 * about) and `summary` (a short detail such as "RWF 30,000"), so the log can say
 * "Voided a payment for Samuel Mugabo · RWF 30,000".
 */
export interface AuditLogItem extends AuditLogEntry {
  actor: { id: Id; name: string } | null;
  /** The platform owner, when the change was made while impersonating the actor. */
  impersonatedBy?: { id: Id; name: string } | null;
  /** The person the change was about, when there is one. */
  subject: { id: Id; name: string } | null;
  /** Short trailing detail, e.g. "RWF 30,000" or "U14 Training". */
  summary: string | null;
}

/** Filter groups shown in the "Type" menu; each maps to one or more `action` values. */
export type AuditTypeFilter =
  | "all"
  | "void"
  | "check_out"
  | "review"
  | "roster"
  | "qr";

export type AuditDateFilter = "7d" | "30d" | "90d" | "all";

export interface AuditLogParams {
  actorId: Id | null;
  date: AuditDateFilter;
  type: AuditTypeFilter;
}

const DAY_MS = 86_400_000;
const DAYS_BY_FILTER: Record<Exclude<AuditDateFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** The server filters on one exact `action`; a group is one request per action. */
const ACTIONS_BY_TYPE: Record<AuditTypeFilter, readonly (string | null)[]> = {
  all: [null],
  void: ["fee.void", "attendance.void"],
  check_out: ["attendance.check_out"],
  review: ["record.verify", "record.reject"],
  roster: ["team.member_add", "team.member_remove", "member.join_by_code"],
  qr: ["academy_qr.regenerate"],
};

/** Shown next to the changed fields so a diff still says what it was about. */
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

/** People ids in a snapshot (`voidedById`, `studentId`, …) shown as names when known. */
function withNames(
  snapshot: Snapshot | null,
  directory: StudentDirectory
): Snapshot | null {
  if (!snapshot) {
    return snapshot;
  }
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, value]) => {
      const isPersonKey =
        key.endsWith("ById") || key === "studentId" || key === "userId";
      const name =
        isPersonKey && typeof value === "string"
          ? personName(directory, value)
          : null;
      return [key, name ?? value];
    })
  );
}

function subjectIdOf(
  before: Snapshot | null,
  after: Snapshot | null
): Id | null {
  const member = asSnapshot(after?.member);
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
  snapshot: Snapshot | null,
  directory: StudentDirectory,
  timeZone: string
): string | null {
  const [entity] = row.action.split(".");
  if (entity === "fee" && snapshot) {
    const amount = str(snapshot.amount) ?? String(snapshot.amount ?? "");
    const currency = str(snapshot.currency);
    const money =
      amount && currency
        ? formatMoney({ amount: Number(amount).toFixed(2), currency })
        : null;
    const period = str(snapshot.periodStart);
    return [money, period ? periodMonthName(periodKeyOf(period)) : null]
      .filter(Boolean)
      .join(" · ");
  }
  if (entity === "attendance" && snapshot) {
    const date = str(snapshot.sessionDate);
    return date
      ? formatDayMonth(date.slice(0, "YYYY-MM-DD".length), timeZone)
      : null;
  }
  if (entity === "record") {
    const data = asSnapshot(snapshot?.data);
    const template = str(data?.template);
    return template ? (TEMPLATE_LABEL[template] ?? template) : null;
  }
  if (entity === "team") {
    return (
      directory.teams.find((team) => team.id === row.entityId)?.name ?? null
    );
  }
  return null;
}

function toItem(
  row: ServerAuditRow,
  directory: StudentDirectory,
  timeZone: string
): AuditLogItem {
  const before = asSnapshot(row.before);
  const after = asSnapshot(row.after);
  const subjectId = subjectIdOf(before, after);
  const subjectName = personName(directory, subjectId);
  const shown = compact(
    withNames(before, directory),
    withNames(after, directory)
  );
  return {
    id: row.id,
    academyId: row.academyId,
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
    summary: summaryOf(row, after ?? before, directory, timeZone),
  };
}

function fromDate(date: AuditDateFilter, timeZone: string): string | undefined {
  if (date === "all") {
    return;
  }
  const start = new Date(appNow().getTime() - DAYS_BY_FILTER[date] * DAY_MS);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
}

async function fetchRows(
  academyId: Id,
  query: Record<string, string | undefined>
): Promise<ServerAuditRow[]> {
  const page = await apiPage<ServerAuditRow>(
    academyPath(academyId, "/audit-log"),
    { query: { limit: MAX_PAGE_SIZE, ...query } }
  );
  return page.data;
}

/**
 * `GET /audit-log?actorId=&action=&from=` (one request per action in the type group),
 * newest first. Shows the newest 200 rows that match; narrow the filters for older ones.
 */
export async function listAuditLog(
  academyId: Id,
  params: AuditLogParams
): Promise<AuditLogItem[]> {
  if (mock) {
    return (await mock()).listAuditLog(academyId, params);
  }
  const academy = await loadAcademy(academyId);
  const timeZone = academy?.timezone ?? "UTC";
  const from = fromDate(params.date, timeZone);
  const [directory, ...pages] = await Promise.all([
    loadStudentDirectory(academyId),
    ...ACTIONS_BY_TYPE[params.type].map((action) =>
      fetchRows(academyId, {
        from,
        action: action ?? undefined,
        actorId: params.actorId ?? undefined,
      })
    ),
  ]);
  return pages
    .flat()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_PAGE_SIZE)
    .map((row) => toItem(row, directory, timeZone));
}

/** Everyone who appears as an actor in the last 90 days, for the "Person" filter. */
export async function listAuditActors(
  academyId: Id
): Promise<{ id: Id; name: string }[]> {
  if (mock) {
    return (await mock()).listAuditActors(academyId);
  }
  const academy = await loadAcademy(academyId);
  const rows = await fetchRows(academyId, {
    from: fromDate("90d", academy?.timezone ?? "UTC"),
  });
  const seen = new Map<Id, string>();
  for (const row of rows) {
    if (row.actor) {
      seen.set(row.actor.id, row.actor.name);
    }
  }
  return [...seen]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
