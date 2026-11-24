/*
 * Preview-mode (fixture) implementation of features/owner-audit/api.ts. Dev only.
 * Rows as "[Owner · Web] Audit log, all academies" (EWF-0) and the phone log (E84-0)
 * draw them, then older filler rows so paging has something to page through.
 * Cursors here are row offsets.
 */
import { fixtureDelay, users } from "@/features/fixtures";
import type {
  OwnerAuditAcademy,
  OwnerAuditFilters,
  OwnerAuditItem,
  OwnerAuditPage,
  OwnerAuditType,
} from "@/features/owner-audit/api";
import { fromDate } from "@/features/owner-audit/api";
import type { Id } from "@/features/types";

const KIGALI: OwnerAuditAcademy = {
  id: "acad-kigali",
  shortName: "Kigali",
  timezone: "Africa/Kigali",
};
const BENGALURU: OwnerAuditAcademy = {
  id: "acad-bengaluru",
  shortName: "Bengaluru",
  timezone: "Asia/Kolkata",
};

function who(id: Id): { id: Id; name: string } {
  return { id, name: users.find((u) => u.id === id)?.name ?? id };
}

function row(
  partial: Partial<OwnerAuditItem> &
    Pick<OwnerAuditItem, "id" | "action" | "entityType" | "createdAt">
): OwnerAuditItem {
  return {
    academyId: partial.academy?.id ?? null,
    academy: null,
    actorId: partial.actor?.id ?? null,
    actor: null,
    impersonatedBy: null,
    entityId: partial.id,
    before: null,
    after: null,
    reason: null,
    subject: null,
    summary: null,
    ...partial,
  };
}

const drawn: OwnerAuditItem[] = [
  row({
    id: "oa-1",
    action: "fee.void",
    entityType: "fee",
    createdAt: "2026-11-23T07:14:00Z",
    academy: KIGALI,
    actor: who("user-sharika"),
    subject: who("user-samuel-m"),
    summary: "RWF 30,000",
    before: { amount: "30000.00 RWF", paid_at: "2026-11-20", voided_at: null },
    after: {
      amount: "30000.00 RWF",
      paid_at: "2026-11-20",
      voided_at: "2026-11-23 09:14",
    },
    reason: "Duplicate entry. The cash payment on 21 Nov is the real one.",
  }),
  row({
    id: "oa-imp",
    action: "user.impersonate_start",
    entityType: "user",
    entityId: "user-sharika",
    createdAt: "2026-11-23T06:40:00Z",
    actor: who("user-innocent"),
    subject: who("user-sharika"),
    after: { userId: "Sharika D.", impersonatedBy: "Innocent M." },
  }),
  row({
    id: "oa-2",
    action: "attendance.check_out",
    entityType: "attendance",
    createdAt: "2026-11-22T16:42:00Z",
    academy: KIGALI,
    actor: who("user-patrick"),
    subject: who("user-aline"),
    summary: "U14 Training",
    before: { checkedOutAt: null },
    after: { checkedOutAt: "2026-11-22 18:42" },
  }),
  row({
    id: "oa-3",
    action: "record.verify",
    entityType: "student_record",
    createdAt: "2026-11-22T15:05:00Z",
    academy: KIGALI,
    actor: who("user-patrick"),
    subject: who("user-jean"),
    summary: "free throws · 8 of 10",
    before: { status: "pending" },
    after: { status: "verified" },
  }),
  row({
    id: "oa-4",
    action: "team.member_move",
    entityType: "team",
    createdAt: "2026-11-20T12:20:00Z",
    academy: KIGALI,
    actor: who("user-sharika"),
    subject: who("user-kevin"),
    before: { team: "U12" },
    after: { team: "U14" },
  }),
  row({
    id: "oa-5",
    action: "attendance.void",
    entityType: "attendance",
    createdAt: "2026-11-19T17:02:00Z",
    academy: KIGALI,
    actor: who("user-sharika"),
    subject: who("user-divine-i"),
    summary: "U12, 19 Nov",
    before: { voidedAt: null },
    after: { voidedAt: "2026-11-19 19:02" },
    reason: "Marked by mistake",
  }),
  row({
    id: "oa-6",
    action: "academy_qr.regenerate",
    entityType: "academy",
    createdAt: "2026-11-16T02:41:00Z",
    academy: BENGALURU,
    actor: who("user-innocent"),
  }),
];

const FILLER_ACTIONS: [string, string, string | null][] = [
  ["fee.create", "fee", "RWF 30,000"],
  ["attendance.verify", "attendance", "U14 Training"],
  ["record.verify", "student_record", "report card"],
  ["team.member_add", "team", "U12"],
];
const FILLER_SUBJECTS = [
  "user-aline",
  "user-jean",
  "user-olivia",
  "user-mercy",
];
const FILLER_ACTORS = ["user-sharika", "user-patrick", "user-marie"];
const FILLER_ROWS = 60;
const HOUR_MS = 3_600_000;
const FILLER_START = Date.parse("2026-11-15T18:00:00Z");
const FILLER_STEP_HOURS = 7;

const filler: OwnerAuditItem[] = Array.from(
  { length: FILLER_ROWS },
  (_, index) => {
    const [action, entityType, summary] = FILLER_ACTIONS[
      index % FILLER_ACTIONS.length
    ] ?? ["fee.create", "fee", null];
    return row({
      id: `oa-f${index}`,
      action,
      entityType,
      createdAt: new Date(
        FILLER_START - index * FILLER_STEP_HOURS * HOUR_MS
      ).toISOString(),
      academy: KIGALI,
      actor: who(FILLER_ACTORS[index % FILLER_ACTORS.length] ?? "user-sharika"),
      subject: who(
        FILLER_SUBJECTS[index % FILLER_SUBJECTS.length] ?? "user-aline"
      ),
      summary,
    });
  }
);

const store: OwnerAuditItem[] = [...drawn, ...filler];

const TYPE_MATCH: Record<OwnerAuditType, (item: OwnerAuditItem) => boolean> = {
  all: () => true,
  fee: (i) => i.entityType === "fee",
  attendance: (i) => i.entityType === "attendance",
  record: (i) => i.entityType === "student_record",
  roster: (i) => i.entityType === "team",
  member: (i) => i.entityType === "member",
  join_code: (i) => i.entityType === "invitation_code",
  calendar: (i) => i.entityType === "calendar_event",
  academy: (i) => i.entityType === "academy",
  qr: (i) => i.action === "academy_qr.regenerate",
  support: (i) => i.entityType === "user",
};

function matches(item: OwnerAuditItem, filters: OwnerAuditFilters): boolean {
  const from = fromDate(filters.date);
  return (
    (!filters.academyId || item.academy?.id === filters.academyId) &&
    (!filters.actorId || item.actor?.id === filters.actorId) &&
    TYPE_MATCH[filters.type](item) &&
    (!from || item.createdAt.slice(0, from.length) >= from)
  );
}

export async function listOwnerAuditPage(input: {
  filters: OwnerAuditFilters;
  limit: number;
  cursor: string | null;
}): Promise<OwnerAuditPage> {
  await fixtureDelay();
  const all = store.filter((item) => matches(item, input.filters));
  const start = Number(input.cursor ?? 0);
  const end = start + input.limit;
  return {
    items: all.slice(start, end),
    nextCursor: end < all.length ? String(end) : null,
  };
}

export async function getPersonName(userId: Id): Promise<string | null> {
  await fixtureDelay();
  return users.find((u) => u.id === userId)?.name ?? null;
}

export async function listRecentActors(): Promise<{ id: Id; name: string }[]> {
  await fixtureDelay();
  const seen = new Map<Id, string>();
  for (const item of store) {
    if (item.actor) {
      seen.set(item.actor.id, item.actor.name);
    }
  }
  return [...seen]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
