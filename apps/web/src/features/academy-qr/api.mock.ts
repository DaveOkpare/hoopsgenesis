/*
 * Preview-mode (fixture) implementation of features/academy-qr/api.ts. Dev only.
 * Academy QR code (AO-8). Mock implementations of `GET /academy-qr` and
 * `POST /academy-qr/regenerate` (see the convention notes in features/viewer/api.ts).
 * The printed code only proves "I'm at this academy"; it holds a signed token with the
 * academy id and its qrNonce, so replacing it makes every old print invalid.
 */
import type { AcademyQrDetails } from "@/features/academy-qr/api";
import { appendAuditEntry, mockNow } from "@/features/audit-log/api.mock";
import { academies, auditLog, fixtureDelay, users } from "@/features/fixtures";
import type { Id, Timestamp } from "@/features/types";

const CHECK_IN_WINDOW = { minutesBefore: 30, minutesAfter: 60 } as const;
const NONCE_LENGTH = 12;

function makeToken(academyId: Id, nonce: string): string {
  // Real tokens are signed by the server; this only needs to look and scan like one.
  return `hg1.${academyId}.${nonce}`;
}

function deepLinkFor(token: string): string {
  return `hoopsgenesis://c/${encodeURIComponent(token)}`;
}

const lastRegeneration = auditLog.find(
  (entry) => entry.action === "academy.qr_regenerate"
);

const state = new Map<
  Id,
  { nonce: string; at: Timestamp | null; byId: Id | null }
>([
  [
    "acad-kigali",
    {
      nonce: "k7Qm2xVb9Rta",
      at: lastRegeneration?.createdAt ?? null,
      byId: lastRegeneration?.actorId ?? null,
    },
  ],
]);

function stateFor(academyId: Id) {
  const existing = state.get(academyId);
  if (existing) {
    return existing;
  }
  const fresh = { nonce: "initialNonce", at: null, byId: null };
  state.set(academyId, fresh);
  return fresh;
}

function details(academyId: Id): AcademyQrDetails {
  const academy = academies.find((a) => a.id === academyId);
  const current = stateFor(academyId);
  const token = makeToken(academyId, current.nonce);
  const by = users.find((u) => u.id === current.byId);
  return {
    token,
    deepLink: deepLinkFor(token),
    academyName: academy?.name ?? "Academy",
    radiusM: academy?.attendanceRadiusM ?? 0,
    checkInWindow: { ...CHECK_IN_WINDOW },
    lastRegeneratedAt: current.at,
    lastRegeneratedBy: by ? { id: by.id, name: by.name } : null,
  };
}

/** Real: `GET /api/v1/academies/:academyId/academy-qr` → `{ token, deepLink }` (+ academy settings). */
export async function getAcademyQr(academyId: Id): Promise<AcademyQrDetails> {
  await fixtureDelay();
  return details(academyId);
}

/**
 * Real: `POST /api/v1/academies/:academyId/academy-qr/regenerate`. New qrNonce; every
 * old print stops working. Writes audit_log. The mock takes the actor explicitly.
 */
export async function regenerateAcademyQr(
  academyId: Id
): Promise<AcademyQrDetails> {
  await fixtureDelay();
  // Preview: Sharika, the admin in the designs.
  const actorId = "user-sharika";
  const current = stateFor(academyId);
  current.nonce = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, NONCE_LENGTH);
  current.at = mockNow().toISOString();
  current.byId = actorId;
  appendAuditEntry({
    academyId,
    actorId,
    action: "academy.qr_regenerate",
    entityType: "organization",
    entityId: academyId,
    before: null,
    after: null,
    reason: null,
    subject: null,
    summary: null,
  });
  return details(academyId);
}
