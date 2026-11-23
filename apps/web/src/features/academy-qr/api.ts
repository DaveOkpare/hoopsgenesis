/*
 * Academy QR code (AO-8): `GET /academy-qr` and `POST /academy-qr/regenerate`.
 * Preview mode uses ./api.mock.ts (see lib/preview.ts).
 * The printed code only proves "I'm at this academy"; it holds a signed token with the
 * academy id and its qrNonce, so replacing it makes every old print invalid.
 */
import { loadAcademy } from "@/features/fees/student-directory";
import type { Id, Timestamp } from "@/features/types";
import { academyPath, apiPage, apiRaw } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** GET /academy-qr: what to render and print. */
export interface AcademyQr {
  deepLink: string;
  token: string;
}

/**
 * The QR page's extra facts. `lastRegenerated*` come from the newest
 * `academy_qr.regenerate` row of the audit log; the radius is `attendanceRadiusM` on
 * the academy; the check-in window is the server rule for sessions.
 */
export interface AcademyQrDetails extends AcademyQr {
  academyName: string;
  checkInWindow: { minutesAfter: number; minutesBefore: number };
  lastRegeneratedAt: Timestamp | null;
  lastRegeneratedBy: { id: Id; name: string } | null;
  radiusM: number;
}

/** The server's session window (server/api/time.ts SESSION_WINDOW); not configurable. */
const CHECK_IN_WINDOW = { minutesBefore: 30, minutesAfter: 60 } as const;

interface AuditRow {
  actor: { id: Id; name: string } | null;
  createdAt: Timestamp;
}

async function details(
  academyId: Id,
  qr: AcademyQr
): Promise<AcademyQrDetails> {
  const [academy, regenerations] = await Promise.all([
    loadAcademy(academyId),
    apiPage<AuditRow>(academyPath(academyId, "/audit-log"), {
      query: { action: "academy_qr.regenerate", limit: 1 },
    }),
  ]);
  const last = regenerations.data[0] ?? null;
  return {
    token: qr.token,
    deepLink: qr.deepLink,
    academyName: academy?.name ?? "Academy",
    radiusM: academy?.attendanceRadiusM ?? 0,
    checkInWindow: { ...CHECK_IN_WINDOW },
    lastRegeneratedAt: last?.createdAt ?? null,
    lastRegeneratedBy: last?.actor ?? null,
  };
}

/** Some responses wrap the code in `data`; GET answers at the top level. */
function unwrapQr(body: AcademyQr | { data: AcademyQr }): AcademyQr {
  return "data" in body ? body.data : body;
}

/** `GET /academy-qr` → `{ token, deepLink }` (top level), plus the academy settings. */
export async function getAcademyQr(academyId: Id): Promise<AcademyQrDetails> {
  if (mock) {
    return (await mock()).getAcademyQr(academyId);
  }
  const body = await apiRaw<AcademyQr | { data: AcademyQr }>(
    academyPath(academyId, "/academy-qr")
  );
  return await details(academyId, unwrapQr(body));
}

/**
 * `POST /academy-qr/regenerate`: new qrNonce; every old print stops working. The server
 * writes the audit row.
 */
export async function regenerateAcademyQr(
  academyId: Id
): Promise<AcademyQrDetails> {
  if (mock) {
    return (await mock()).regenerateAcademyQr(academyId);
  }
  const body = await apiRaw<AcademyQr | { data: AcademyQr }>(
    academyPath(academyId, "/academy-qr/regenerate"),
    { method: "POST" }
  );
  return await details(academyId, unwrapQr(body));
}
