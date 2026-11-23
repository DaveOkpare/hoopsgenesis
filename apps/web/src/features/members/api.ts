/*
 * Members and the invitations an admin sends (stories AO-2, AO-3).
 * Real implementation over Better Auth's organization plugin and GET /teams rosters
 * (see ./directory.ts). Preview mode delegates to ./api.mock.ts.
 *
 * Invitations go through Better Auth (`inviteMember`), which only academy admins may
 * call for coaches and students; the platform owner appoints admins. No email is sent
 * (no email provider yet): the person needs the invite link, or a join code.
 */
import {
  fetchMembersWithTeams,
  fetchOpenInvitations,
} from "@/features/members/directory";
import type {
  AcademyRole,
  Id,
  Invitation,
  Member,
  UserSummary,
} from "@/features/types";
import { unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** Roles an academy admin may invite. Only the owner appoints admins. */
export type InvitableRole = Exclude<AcademyRole, "admin">;

/**
 * Members of an academy with their roles and teams.
 * `organization.getFullOrganization` (members) + `GET /teams` and
 * `GET /teams/:teamId/members` (who is on which team).
 */
export async function listMembers(academyId: Id): Promise<Member[]> {
  if (mock) {
    return (await mock()).listMembers(academyId);
  }
  return (await fetchMembersWithTeams(academyId)).members;
}

/** Pending and expired invitations. `organization.listInvitations` (admins only). */
export async function listInvitations(academyId: Id): Promise<Invitation[]> {
  if (mock) {
    return (await mock()).listInvitations(academyId);
  }
  return await fetchOpenInvitations(academyId);
}

export interface MemberCounts {
  admins: number;
  coaches: number;
  invites: number;
  people: number;
  students: number;
}

/**
 * Head counts for the tabs and eyebrow, counted from the member list and open invites
 * (a "coach,student" member counts under both roles, as on GET /dashboard).
 */
export async function getMemberCounts(academyId: Id): Promise<MemberCounts> {
  if (mock) {
    return (await mock()).getMemberCounts(academyId);
  }
  const [members, invites] = await Promise.all([
    listMembers(academyId),
    listInvitations(academyId),
  ]);
  const withRole = (role: AcademyRole) =>
    members.filter((member) => member.roles.includes(role)).length;
  return {
    people: members.length,
    students: withRole("student"),
    coaches: withRole("coach"),
    admins: withRole("admin"),
    invites: invites.length,
  };
}

/**
 * The platform owner, named in the invite form ("New admins are appointed by …").
 * No endpoint lets an academy admin look up the platform owner, so real mode returns
 * null and the form leaves the sentence out.
 */
export async function getPlatformOwner(): Promise<UserSummary | null> {
  if (mock) {
    return (await mock()).getPlatformOwner();
  }
  return await Promise.resolve(null);
}

export interface InviteMembersInput {
  academyId: Id;
  emails: string[];
  role: InvitableRole;
  teamId: Id | null;
}

/**
 * One invitation per email: `organization.inviteMember({ email, role, teamId,
 * organizationId })`. The inviter is the signed-in admin (from the session).
 */
export async function inviteMembers(
  input: InviteMembersInput
): Promise<Invitation[]> {
  if (mock) {
    return (await mock()).inviteMembers(input);
  }
  await Promise.all(
    input.emails.map(async (email) =>
      unwrapAuth(
        await authClient.organization.inviteMember({
          email: email.trim().toLowerCase(),
          role: input.role,
          organizationId: input.academyId,
          ...(input.teamId ? { teamId: input.teamId } : {}),
        })
      )
    )
  );
  const wanted = new Set(
    input.emails.map((email) => email.trim().toLowerCase())
  );
  const open = await fetchOpenInvitations(input.academyId);
  return open.filter((invite) => wanted.has(invite.email));
}

async function findOpenInvitation(
  academyId: Id,
  invitationId: Id
): Promise<Invitation> {
  const open = await fetchOpenInvitations(academyId);
  const existing = open.find((invite) => invite.id === invitationId);
  if (!existing) {
    throw new Error("This invite no longer exists.");
  }
  return existing;
}

/**
 * Restarts the 48 hours: `organization.inviteMember({ email, role, teamId,
 * resend: true })`. An expired invite is no longer "pending" for Better Auth, so a
 * fresh one is made instead (the old row stays expired).
 */
export async function resendInvitation(input: {
  academyId: Id;
  invitationId: Id;
}): Promise<Invitation> {
  if (mock) {
    return (await mock()).resendInvitation(input);
  }
  const existing = await findOpenInvitation(
    input.academyId,
    input.invitationId
  );
  if (existing.status === "expired") {
    // Better Auth no longer counts it as pending: retire it so the list shows one row.
    unwrapAuth(
      await authClient.organization.cancelInvitation({
        invitationId: existing.id,
      })
    );
  }
  unwrapAuth(
    await authClient.organization.inviteMember({
      email: existing.email,
      role: existing.role,
      organizationId: input.academyId,
      resend: existing.status === "pending",
      ...(existing.teamId ? { teamId: existing.teamId } : {}),
    })
  );
  const open = await fetchOpenInvitations(input.academyId);
  return (
    open.find(
      (invite) => invite.email === existing.email && invite.status === "pending"
    ) ?? existing
  );
}

/** `organization.cancelInvitation({ invitationId })`. */
export async function cancelInvitation(input: {
  academyId: Id;
  invitationId: Id;
}): Promise<Invitation> {
  if (mock) {
    return (await mock()).cancelInvitation(input);
  }
  const existing = await findOpenInvitation(
    input.academyId,
    input.invitationId
  );
  unwrapAuth(
    await authClient.organization.cancelInvitation({
      invitationId: input.invitationId,
    })
  );
  return { ...existing, status: "canceled" };
}
