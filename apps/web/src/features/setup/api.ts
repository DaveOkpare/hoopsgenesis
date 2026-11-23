/*
 * Setup checklist for a new academy (story AO-1).
 * Mock-data convention: see features/viewer/api.ts.
 *
 * Real: there is no single endpoint yet. Each step's "done" comes from data the app
 * already has: academy details confirmed (`organization.update` stamps metadata),
 * teams (`organization.listTeams`), coach and student invites or members
 * (`listInvitations`, `getFullOrganization`) and the QR code (`GET /academy-qr`,
 * printed when the PDF was downloaded). Skips are a per-academy preference.
 */
import { fixtureDelay, teams } from "@/features/fixtures";
import type { Id } from "@/features/types";

export type SetupStepId = "details" | "teams" | "coaches" | "students" | "qr";

export interface SetupStep {
  /** Short fact shown on the right once done ("4 teams"). */
  doneNote: string | null;
  id: SetupStepId;
  skipped: boolean;
  status: "done" | "todo";
}

export interface SetupChecklist {
  academyId: Id;
  /** True when every step is done; the home screen then shows the dashboard. */
  complete: boolean;
  steps: SetupStep[];
}

/**
 * Which moment to show. "current" is today's Kigali academy (fully set up, so /admin
 * shows the dashboard). "first-week" is the academy as drawn in the Setup artboard
 * (1FH-0): details and teams done, coaches next. Preview only; the real API has one state.
 */
export type SetupSnapshot = "current" | "first-week";

const DONE_STEPS: Record<SetupSnapshot, SetupStepId[]> = {
  current: ["details", "teams", "coaches", "students", "qr"],
  "first-week": ["details", "teams"],
};

const ORDER: SetupStepId[] = ["details", "teams", "coaches", "students", "qr"];

/** Skipped steps per academy and snapshot (in memory for the session). */
const skips = new Map<string, Set<SetupStepId>>();

function skipKey(academyId: Id, snapshot: SetupSnapshot): string {
  return `${academyId}:${snapshot}`;
}

function doneNote(id: SetupStepId, academyId: Id): string | null {
  if (id === "teams") {
    const count = teams.filter((t) => t.academyId === academyId).length;
    return count === 1 ? "1 team" : `${count} teams`;
  }
  return null;
}

export async function getSetupChecklist(
  academyId: Id,
  snapshot: SetupSnapshot = "current"
): Promise<SetupChecklist> {
  await fixtureDelay();
  const done = new Set(DONE_STEPS[snapshot]);
  const skipped = skips.get(skipKey(academyId, snapshot)) ?? new Set();
  const steps = ORDER.map(
    (id): SetupStep => ({
      id,
      status: done.has(id) ? "done" : "todo",
      skipped: !done.has(id) && skipped.has(id),
      doneNote: done.has(id) ? doneNote(id, academyId) : null,
    })
  );
  return {
    academyId,
    steps,
    complete: steps.every((step) => step.status === "done"),
  };
}

/** "Skip for now". Real: saved as an academy preference (e.g. organization metadata). */
export async function skipSetupStep(input: {
  academyId: Id;
  snapshot: SetupSnapshot;
  stepId: SetupStepId;
}): Promise<void> {
  await fixtureDelay();
  const key = skipKey(input.academyId, input.snapshot);
  const set = skips.get(key) ?? new Set<SetupStepId>();
  set.add(input.stepId);
  skips.set(key, set);
}
