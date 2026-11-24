/*
 * Setup checklist for a new academy (story AO-1). There is no checklist endpoint; each
 * step's "done" comes from data the server already has. Preview mode delegates to
 * ./api.mock.ts.
 *
 * - details:  the academy has a location (the owner enters the address, coordinates,
 *             time zone and currency when creating it; "confirmed" isn't stored).
 * - teams:    GET /teams has at least one team.
 * - coaches / students: a member with that role, or an open invitation for it
 *             (Better Auth members + listInvitations).
 * - qr:       the server doesn't record printing the poster, so the step counts as done
 *             once any attendance has been recorded (GET /attendance?limit=1).
 * Skips ("Skip for now") have no endpoint either: they are kept in this browser's
 * localStorage, per academy.
 */
import {
  fetchOpenInvitations,
  fetchOrgMembers,
  fetchTeams,
} from "@/features/members/directory";
import type { Id } from "@/features/types";
import { academyPath, apiPage, unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

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
 * Which moment to show. "current" is the academy as it is. "first-week" is the academy
 * as drawn in the Setup artboard (1FH-0); preview only, real mode always shows "current".
 */
export type SetupSnapshot = "current" | "first-week";

const ORDER: SetupStepId[] = ["details", "teams", "coaches", "students", "qr"];

const skipStorageKey = (academyId: Id): string =>
  `hoops.setup-skips.${academyId}`;

function readSkips(academyId: Id): Set<SetupStepId> {
  try {
    const raw = localStorage.getItem(skipStorageKey(academyId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is SetupStepId => ORDER.includes(id))
        : []
    );
  } catch {
    return new Set();
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

async function hasAnyAttendance(academyId: Id): Promise<boolean> {
  const page = await apiPage(academyPath(academyId, "/attendance"), {
    query: { limit: 1 },
  });
  return page.data.length > 0;
}

export async function getSetupChecklist(
  academyId: Id,
  snapshot: SetupSnapshot = "current"
): Promise<SetupChecklist> {
  if (mock) {
    return (await mock()).getSetupChecklist(academyId, snapshot);
  }
  const [org, teams, members, invites, attendance] = await Promise.all([
    authClient.organization
      .getFullOrganization({
        query: { organizationId: academyId, membersLimit: 1 },
      })
      .then(unwrapAuth),
    fetchTeams(academyId),
    fetchOrgMembers(academyId),
    fetchOpenInvitations(academyId),
    hasAnyAttendance(academyId),
  ]);
  const pendingInvites = invites.filter((i) => i.status === "pending");
  const count = (role: "coach" | "student") =>
    members.filter((m) => m.roles.includes(role)).length;
  const invited = (role: "coach" | "student") =>
    pendingInvites.filter((i) => i.role === role).length;
  const peopleNote = (role: "coach" | "student"): string => {
    const joined = count(role);
    return joined > 0
      ? plural(joined, role).replace("coachs", "coaches")
      : `${plural(invited(role), "invite")} created`;
  };
  const facts: Record<SetupStepId, { done: boolean; note: string | null }> = {
    details: { done: Boolean(org?.location), note: null },
    teams: { done: teams.length > 0, note: plural(teams.length, "team") },
    coaches: {
      done: count("coach") + invited("coach") > 0,
      note: peopleNote("coach"),
    },
    students: {
      done: count("student") + invited("student") > 0,
      note: peopleNote("student"),
    },
    qr: { done: attendance, note: null },
  };
  const skipped = readSkips(academyId);
  const steps = ORDER.map((id): SetupStep => {
    const { done, note } = facts[id];
    return {
      id,
      status: done ? "done" : "todo",
      skipped: !done && skipped.has(id),
      doneNote: done ? note : null,
    };
  });
  return {
    academyId,
    steps,
    complete: steps.every((step) => step.status === "done"),
  };
}

/** "Skip for now": remembered in this browser only (no endpoint stores it). */
export async function skipSetupStep(input: {
  academyId: Id;
  snapshot: SetupSnapshot;
  stepId: SetupStepId;
}): Promise<void> {
  if (mock) {
    return (await mock()).skipSetupStep(input);
  }
  const skips = readSkips(input.academyId);
  skips.add(input.stepId);
  try {
    localStorage.setItem(
      skipStorageKey(input.academyId),
      JSON.stringify([...skips])
    );
  } catch {
    // Storage unavailable (private mode): the skip isn't kept.
  }
  return await Promise.resolve();
}
