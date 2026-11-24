/* Fixture twin of ./api.ts for dev preview (see lib/preview.ts). */
import type {
  AcademySettings,
  AcademySettingsInput,
} from "@/features/academy-settings/api";
import { academies, fixtureDelay } from "@/features/fixtures";
import type { Id } from "@/features/types";

/** In-memory edits for this page load. The design's venue is Kimironko court. */
const store = new Map<Id, AcademySettings>(
  academies.map((academy) => [
    academy.id,
    {
      id: academy.id,
      name: academy.name,
      timezone: academy.timezone,
      defaultCurrency: academy.defaultCurrency,
      location:
        academy.id === "acad-kigali"
          ? "Kimironko court, KG 11 Ave"
          : academy.location,
      latitude: academy.latitude,
      longitude: academy.longitude,
      attendanceRadiusM: academy.attendanceRadiusM,
    },
  ])
);

export async function getAcademySettings(
  academyId: Id
): Promise<AcademySettings> {
  await fixtureDelay();
  const found = store.get(academyId);
  if (!found) {
    throw new Error("Academy not found");
  }
  return found;
}

export async function updateAcademySettings(
  academyId: Id,
  input: AcademySettingsInput
): Promise<AcademySettings> {
  await fixtureDelay();
  const current = await getAcademySettings(academyId);
  const next = { ...current, ...input };
  store.set(academyId, next);
  return next;
}
