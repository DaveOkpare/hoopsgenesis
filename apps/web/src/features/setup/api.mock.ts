/* Preview-mode (fixture) implementation of features/setup/api.ts. Dev only. */
import { fixtureDelay, teams } from "@/features/fixtures";
import type {
  SetupChecklist,
  SetupSnapshot,
  SetupStep,
  SetupStepId,
} from "@/features/setup/api";
import type { Id } from "@/features/types";

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
