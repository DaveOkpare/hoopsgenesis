/* Preview-mode (fixture) implementation of features/viewer/api.ts. Dev only. */
import {
  academies,
  fixtureDelay,
  members,
  teams,
  users,
} from "@/features/fixtures";
import type { Id, User } from "@/features/types";
import type {
  Impersonation,
  Membership,
  Viewer,
  ViewerPersona,
} from "@/features/viewer/api";

function findUser(id: string): User {
  const found = users.find((u) => u.id === id);
  if (!found) {
    throw new Error(`Fixture user ${id} is missing`);
  }
  return found;
}

function membershipsFor(userId: string): Membership[] {
  return members
    .filter((m) => m.userId === userId)
    .flatMap((m) => {
      const academy = academies.find((a) => a.id === m.academyId);
      if (!academy) {
        return [];
      }
      const memberTeams = teams
        .filter((t) => m.teamIds.includes(t.id))
        .map(({ id, name }) => ({ id, name }));
      return [{ academy, roles: m.roles, teams: memberTeams }];
    });
}

/** Owner "view as" in preview mode (`?impersonating=1`); null otherwise. */
function previewImpersonation(options: {
  impersonating?: boolean;
}): Impersonation | null {
  if (!options.impersonating) {
    return null;
  }
  const innocent = findUser("user-innocent");
  return {
    by: {
      id: innocent.id,
      name: innocent.name,
      email: innocent.email,
      image: null,
    },
    startedAt: "2026-11-23T08:02:00Z",
  };
}

/** Fixture viewer for each persona; mirrors the people in the designs. */
export function fixtureViewer(
  persona: ViewerPersona,
  options: { impersonating?: boolean } = {}
): Viewer {
  switch (persona) {
    case "owner":
      return {
        user: findUser("user-innocent"),
        memberships: [],
        activeAcademyId: null,
        impersonation: null,
      };
    case "coach":
      return {
        user: findUser("user-sharika"),
        memberships: membershipsFor("user-sharika")
          .filter((m) => m.academy.id === "acad-kigali")
          .map((m) => ({ ...m, roles: ["coach"] })),
        activeAcademyId: "acad-kigali",
        impersonation: previewImpersonation(options),
      };
    case "student":
      return {
        user: findUser("user-aline"),
        memberships: membershipsFor("user-aline"),
        activeAcademyId: "acad-kigali",
        impersonation: previewImpersonation(options),
      };
    default: {
      const innocent = findUser("user-innocent");
      return {
        user: findUser("user-sharika"),
        memberships: membershipsFor("user-sharika"),
        activeAcademyId: "acad-kigali",
        impersonation: options.impersonating
          ? {
              by: {
                id: innocent.id,
                name: innocent.name,
                email: innocent.email,
                image: null,
              },
              startedAt: "2026-11-23T08:02:00Z",
            }
          : null,
      };
    }
  }
}

/**
 * The signed-in person, their academies and the active academy.
 * Real: `authClient.getSession()` (user, session.activeOrganizationId, impersonatedBy)
 * + `authClient.organization.list()` + `organization.getActiveMember()` per academy.
 */
export async function fetchViewer(): Promise<Viewer> {
  await fixtureDelay();
  return fixtureViewer("admin");
}

/** Real: `authClient.organization.setActive({ organizationId })`. */
export async function setActiveAcademy(input: {
  academyId: Id;
}): Promise<{ activeAcademyId: Id }> {
  await fixtureDelay();
  return { activeAcademyId: input.academyId };
}

/** Real: `authClient.admin.stopImpersonating()`. */
export async function stopImpersonating(): Promise<void> {
  await fixtureDelay();
}
