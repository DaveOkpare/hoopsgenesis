/*
 * Activity log (AO-9). Mock implementation of `GET /audit-log` (see the convention notes
 * in features/viewer/api.ts). Other features in this app write to the same in-memory log
 * through `appendAuditEntry`, the way the real server writes `audit_log` rows inside the
 * void / verify / regenerate transactions.
 */
import {
  auditLog,
  FIXTURE_NOW,
  fixtureDelay,
  users,
} from "@/features/fixtures";
import type { AuditLogEntry, Id, Timestamp } from "@/features/types";

/**
 * One row as the screen needs it. The real endpoint returns `AuditLogEntry`; `actor`,
 * `subject` and `summary` are joins the server (or this file) adds so the log can say
 * "Voided a payment for Samuel Mugabo · RWF 30,000".
 */
export interface AuditLogItem extends AuditLogEntry {
  actor: { id: Id; name: string } | null;
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
const PAGE_LOADED_AT = Date.now();

/**
 * "Now" for mocks: the designs' moment (FIXTURE_NOW, Mon 23 Nov 10:02 Kigali) plus the time
 * since the page loaded, so new rows sort after the fixtures and read as "Today".
 * Real code uses `new Date()`.
 */
export function mockNow(): Date {
  return new Date(FIXTURE_NOW.getTime() + (Date.now() - PAGE_LOADED_AT));
}
const DAYS_BY_FILTER: Record<Exclude<AuditDateFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Who each fixture entry was about (the fixture rows only carry entity ids). */
const FIXTURE_CONTEXT: Record<
  string,
  { subjectId: Id | null; summary: string | null }
> = {
  "audit-1": { subjectId: "user-samuel-m", summary: "RWF 30,000" },
  "audit-2": { subjectId: "user-aline", summary: "U14 Training" },
  "audit-3": { subjectId: "user-jean", summary: "free throws · 8 of 10" },
  "audit-4": { subjectId: "user-kevin", summary: null },
  "audit-5": { subjectId: "user-divine-i", summary: "U12, 19 Nov" },
  "audit-6": { subjectId: null, summary: null },
};

function person(id: Id | null): { id: Id; name: string } | null {
  if (!id) {
    return null;
  }
  const found = users.find((u) => u.id === id);
  return found ? { id: found.id, name: found.name } : null;
}

let store: AuditLogItem[] = auditLog.map((entry) => {
  const context = FIXTURE_CONTEXT[entry.id];
  return {
    ...entry,
    actor: person(entry.actorId),
    subject: person(context?.subjectId ?? null),
    summary: context?.summary ?? null,
  };
});

function matchesType(action: string, type: AuditTypeFilter): boolean {
  switch (type) {
    case "all":
      return true;
    case "void":
      return action.endsWith(".void");
    case "check_out":
      return action === "attendance.check_out";
    case "review":
      return action === "record.verify" || action === "record.reject";
    case "roster":
      return action.startsWith("team.");
    case "qr":
      return action === "academy.qr_regenerate";
    default:
      return true;
  }
}

/** Real: `GET /api/v1/academies/:academyId/audit-log?actorId=&action=&from=`, newest first. */
export async function listAuditLog(
  academyId: Id,
  params: AuditLogParams
): Promise<AuditLogItem[]> {
  await fixtureDelay();
  const from =
    params.date === "all"
      ? null
      : FIXTURE_NOW.getTime() - DAYS_BY_FILTER[params.date] * DAY_MS;
  return [...store]
    .filter((entry) => entry.academyId === academyId)
    .filter((entry) => !params.actorId || entry.actorId === params.actorId)
    .filter((entry) => matchesType(entry.action, params.type))
    .filter((entry) => from === null || Date.parse(entry.createdAt) >= from)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Everyone who appears as an actor, for the "Person" filter. */
export async function listAuditActors(
  academyId: Id
): Promise<{ id: Id; name: string }[]> {
  await fixtureDelay();
  const seen = new Map<Id, string>();
  for (const entry of store) {
    if (entry.academyId === academyId && entry.actor) {
      seen.set(entry.actor.id, entry.actor.name);
    }
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

/**
 * Mock-only: what the server does inside a mutating endpoint. Real code never calls this
 * from the client; the row appears in `GET /audit-log` on the next fetch.
 */
export function appendAuditEntry(
  entry: Omit<AuditLogItem, "id" | "createdAt" | "actor"> & {
    createdAt?: Timestamp;
  }
): AuditLogItem {
  const item: AuditLogItem = {
    ...entry,
    id: `audit-${crypto.randomUUID()}`,
    createdAt: entry.createdAt ?? mockNow().toISOString(),
    actor: person(entry.actorId),
  };
  store = [item, ...store];
  return item;
}
