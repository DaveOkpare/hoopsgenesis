/*
 * Members and the invitations an admin sends (stories AO-2, AO-3).
 * Mock-data convention: see features/viewer/api.ts. Each function names the Better Auth
 * call it stands in for; swapping in the real API only changes this file.
 */
import {
  FIXTURE_NOW,
  fixtureDelay,
  invitations as invitationFixtures,
  members as memberFixtures,
  users,
} from "@/features/fixtures";
import { memberTotals } from "@/features/members/fixtures";
import type {
  AcademyRole,
  Id,
  Invitation,
  Member,
  UserSummary,
} from "@/features/types";

/** Invite links work for 48 hours (Better Auth `invitationExpiresIn`). */
const INVITE_LIFETIME_MS = 48 * 60 * 60 * 1000;

/** Roles an academy admin may invite. Only the owner appoints admins. */
export type InvitableRole = Exclude<AcademyRole, "admin">;

/** "Now" for relative dates. Fixtures are drawn at FIXTURE_NOW; real: `new Date()`. */
export function referenceNow(): Date {
  return FIXTURE_NOW;
}

const memberEmails = new Set(memberFixtures.map((m) => m.user.email));

/** In-memory invitations so invite / resend / cancel survive refetches. */
let invitationStore: Invitation[] = invitationFixtures.filter(
  // An invite to someone who is already a member was accepted; it is not listed.
  (invite) => !memberEmails.has(invite.email)
);
const initialOpenInvites = invitationStore.length;

function withExpiry(invite: Invitation): Invitation {
  const expired =
    invite.status === "pending" &&
    Date.parse(invite.expiresAt) <= referenceNow().getTime();
  return expired ? { ...invite, status: "expired" } : invite;
}

function openInvites(academyId: Id): Invitation[] {
  return invitationStore
    .filter((invite) => invite.academyId === academyId)
    .map(withExpiry)
    .filter(
      (invite) => invite.status === "pending" || invite.status === "expired"
    );
}

/**
 * Members of an academy with their roles and teams.
 * Real: `authClient.organization.getFullOrganization({ query: { organizationId } })`
 * (members + teams) or `organization.listMembers`.
 */
export async function listMembers(academyId: Id): Promise<Member[]> {
  await fixtureDelay();
  return memberFixtures.filter((m) => m.academyId === academyId);
}

/** Pending and expired invitations. Real: `authClient.organization.listInvitations`. */
export async function listInvitations(academyId: Id): Promise<Invitation[]> {
  await fixtureDelay();
  return openInvites(academyId);
}

export interface MemberCounts {
  admins: number;
  coaches: number;
  invites: number;
  people: number;
  students: number;
}

/**
 * Head counts for the tabs and eyebrow. Real: the `members` part of `GET /dashboard`
 * (or `listMembers` totals per role).
 */
export async function getMemberCounts(academyId: Id): Promise<MemberCounts> {
  await fixtureDelay();
  const inviteDelta = openInvites(academyId).length - initialOpenInvites;
  return {
    ...memberTotals,
    invites: Math.max(0, memberTotals.invites + inviteDelta),
  };
}

/** The platform owner, named in the invite form ("New admins are appointed by …"). */
export async function getPlatformOwner(): Promise<UserSummary | null> {
  await fixtureDelay();
  const owner = users.find((u) => u.platformRole === "admin");
  return owner
    ? { id: owner.id, name: owner.name, email: owner.email, image: owner.image }
    : null;
}

export interface InviteMembersInput {
  academyId: Id;
  emails: string[];
  inviterId: Id;
  role: InvitableRole;
  teamId: Id | null;
}

/**
 * One invitation per email.
 * Real: `authClient.organization.inviteMember({ email, role, teamId, organizationId })`
 * once per email (Promise.all), each sending its own link.
 */
export async function inviteMembers(
  input: InviteMembersInput
): Promise<Invitation[]> {
  await fixtureDelay();
  const createdAt = new Date(referenceNow().getTime());
  const created = input.emails.map(
    (email): Invitation => ({
      id: `invite-${crypto.randomUUID()}`,
      academyId: input.academyId,
      email: email.trim().toLowerCase(),
      role: input.role,
      teamId: input.teamId,
      status: "pending",
      inviterId: input.inviterId,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + INVITE_LIFETIME_MS
      ).toISOString(),
    })
  );
  invitationStore = [...created, ...invitationStore];
  return created;
}

/**
 * Sends a fresh link and restarts the 48 hours.
 * Real: `authClient.organization.inviteMember({ email, role, teamId, resend: true })`.
 */
export async function resendInvitation(input: {
  invitationId: Id;
  inviterId: Id;
}): Promise<Invitation> {
  await fixtureDelay();
  const existing = invitationStore.find((i) => i.id === input.invitationId);
  if (!existing) {
    throw new Error("This invite no longer exists.");
  }
  const sentAt = referenceNow().getTime();
  const resent: Invitation = {
    ...existing,
    status: "pending",
    inviterId: input.inviterId,
    createdAt: new Date(sentAt).toISOString(),
    expiresAt: new Date(sentAt + INVITE_LIFETIME_MS).toISOString(),
  };
  invitationStore = invitationStore.map((i) =>
    i.id === resent.id ? resent : i
  );
  return resent;
}

/** Real: `authClient.organization.cancelInvitation({ invitationId })`. */
export async function cancelInvitation(input: {
  invitationId: Id;
}): Promise<Invitation> {
  await fixtureDelay();
  const existing = invitationStore.find((i) => i.id === input.invitationId);
  if (!existing) {
    throw new Error("This invite no longer exists.");
  }
  const canceled: Invitation = { ...existing, status: "canceled" };
  invitationStore = invitationStore.map((i) =>
    i.id === canceled.id ? canceled : i
  );
  return canceled;
}
