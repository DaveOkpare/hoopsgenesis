/*
 * Academy settings (AO-1). Convention: see features/viewer/api.ts; the fixture twin is
 * ./api.mock.ts (dev preview only).
 *
 * Read: Better Auth `organization.list()` (the caller's academies with our additional
 * fields), picking this one. Write: `organization.update({ organizationId, data })`,
 * which an academy admin may call (organization:update). The hooks in
 * packages/auth/src/index.ts check latitude, longitude and attendanceRadiusM. Better
 * Auth does not write an audit row for this call, so it does not appear in the
 * activity log.
 *
 * What an admin may change here: name, time zone, venue address (`location`), pin
 * (latitude/longitude) and check-in radius. The server would also take
 * `defaultCurrency`, but fees already recorded keep theirs, so the screen leaves the
 * currency with the owner, as the design does.
 */
import type { Academy, Id } from "@/features/types";
import { unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export type AcademySettings = Pick<
  Academy,
  | "id"
  | "name"
  | "timezone"
  | "defaultCurrency"
  | "location"
  | "latitude"
  | "longitude"
  | "attendanceRadiusM"
>;

export type AcademySettingsInput = Pick<
  AcademySettings,
  | "name"
  | "timezone"
  | "location"
  | "latitude"
  | "longitude"
  | "attendanceRadiusM"
>;

function toSettings(org: Record<string, unknown>): AcademySettings {
  return {
    id: String(org.id),
    name: String(org.name ?? ""),
    timezone: String(org.timezone ?? "UTC"),
    defaultCurrency: String(org.defaultCurrency ?? ""),
    location: (org.location as string | null | undefined) ?? null,
    latitude: Number(org.latitude ?? 0),
    longitude: Number(org.longitude ?? 0),
    attendanceRadiusM: Number(org.attendanceRadiusM ?? 0),
  };
}

/** `organization.list()`, this academy. */
export async function getAcademySettings(
  academyId: Id
): Promise<AcademySettings> {
  if (mock) {
    return (await mock()).getAcademySettings(academyId);
  }
  const orgs = unwrapAuth(await authClient.organization.list()) ?? [];
  const org = orgs.find((row) => row.id === academyId);
  if (!org) {
    throw new Error("Academy not found");
  }
  return toSettings(org as unknown as Record<string, unknown>);
}

/** `organization.update({ organizationId, data })`. */
export async function updateAcademySettings(
  academyId: Id,
  input: AcademySettingsInput
): Promise<AcademySettings> {
  if (mock) {
    return (await mock()).updateAcademySettings(academyId, input);
  }
  const updated = unwrapAuth(
    await authClient.organization.update({
      organizationId: academyId,
      data: {
        name: input.name,
        timezone: input.timezone,
        location: input.location ?? "",
        latitude: input.latitude,
        longitude: input.longitude,
        attendanceRadiusM: input.attendanceRadiusM,
      },
    })
  );
  return toSettings(updated as unknown as Record<string, unknown>);
}
