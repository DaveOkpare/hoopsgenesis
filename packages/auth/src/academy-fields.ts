/**
 * Rules for an academy's own fields, shared by the Better Auth hooks in
 * ./index.ts and the platform owner's `/api/v1/admin/academies` route, so an
 * academy is valid however it was created. Server-only (node:crypto).
 */
import { randomBytes } from "node:crypto";

/** 32 random bytes, base64url: 43 characters. */
const QR_NONCE_BYTES = 32;
export const DEFAULT_ATTENDANCE_RADIUS_M = 150;
export const MAX_LATITUDE = 90;
export const MAX_LONGITUDE = 180;

/** The random value baked into the academy's printed QR code. */
export const createQrNonce = (): string =>
  randomBytes(QR_NONCE_BYTES).toString("base64url");

const isNumberInRange = (value: unknown, limit: number): boolean =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= limit;

/**
 * Checks the location fields present in `fields` and returns what is wrong,
 * or null. Absent fields are not checked (an update may leave them out).
 */
export const findAcademyLocationProblem = (
  fields: Record<string, unknown>
): string | null => {
  if ("latitude" in fields && !isNumberInRange(fields.latitude, MAX_LATITUDE)) {
    return "latitude must be between -90 and 90";
  }
  if (
    "longitude" in fields &&
    !isNumberInRange(fields.longitude, MAX_LONGITUDE)
  ) {
    return "longitude must be between -180 and 180";
  }
  // null is rejected too: the column is nullable only because Better Auth's
  // generator makes it so (see auth.prisma).
  const radius = fields.attendanceRadiusM;
  const radiusIsValid =
    radius === undefined ||
    (typeof radius === "number" && Number.isInteger(radius) && radius > 0);
  return radiusIsValid
    ? null
    : "attendanceRadiusM must be a whole number above 0";
};
