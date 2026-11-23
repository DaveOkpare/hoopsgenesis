/*
 * Invitations seen by the person invited (ST-1). Follows the mock-data convention in
 * features/viewer/api.ts: fixtures today, Better Auth organization calls later.
 */
import {
  academies,
  events,
  FIXTURE_NOW,
  fixtureDelay,
  members,
  teams,
  users,
} from "@/features/fixtures";
import {
  inviteFixtures,
  JOINED_NEXT_EVENT_ID,
} from "@/features/invitations/fixtures";
import type {
  AcademyRole,
  DateOnly,
  Id,
  Invitation,
  InvitationStatus,
  TimeOfDay,
  Timestamp,
} from "@/features/types";

/**
 * What the invite page needs. Mirrors `organization.getInvitation` (the invitation row
 * plus `organizationName`), with the inviter's name and team name resolved.
 * `status` is "expired" once `expiresAt` has passed, even if the row still says pending.
 */
export interface InvitationDetails {
  academyName: string;
  academyTimezone: string;
  createdAt: Timestamp;
  email: string;
  expiresAt: Timestamp;
  id: Id;
  inviterName: string;
  role: AcademyRole;
  status: InvitationStatus;
  teamName: string | null;
}

/** Shown after joining (59H-0). */
export interface JoinSummary {
  academyName: string;
  academyTimezone: string;
  /** Short names, e.g. "Patrick H." */
  coachNames: string[];
  /** The person who joined (real: the session user's name). */
  memberName: string;
  nextSession: {
    location: string | null;
    startDate: DateOnly;
    startTime: TimeOfDay | null;
  } | null;
  teamName: string | null;
}

const WHITESPACE = /\s+/;

/** "Patrick Habimana" -> "Patrick H."; "Sharika D." stays as it is. */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(WHITESPACE);
  const last = rest.at(-1);
  if (!last || last.endsWith(".")) {
    return name;
  }
  return `${first} ${last.charAt(0)}.`;
}

function effectiveStatus(invitation: Invitation, now: Date): InvitationStatus {
  const isPastExpiry = Date.parse(invitation.expiresAt) <= now.getTime();
  if (invitation.status === "pending" && isPastExpiry) {
    return "expired";
  }
  return invitation.status;
}

function toDetails(invitation: Invitation): InvitationDetails {
  const academy = academies.find((a) => a.id === invitation.academyId);
  const inviter = users.find((u) => u.id === invitation.inviterId);
  const team = teams.find((t) => t.id === invitation.teamId);
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: effectiveStatus(invitation, FIXTURE_NOW),
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    academyName: academy?.name ?? "your academy",
    academyTimezone: academy?.timezone ?? "UTC",
    inviterName: inviter ? shortName(inviter.name) : "Your academy",
    teamName: team?.name ?? null,
  };
}

/**
 * Look up an invitation by id; null when the link is not valid.
 * Real: `authClient.organization.getInvitation({ query: { id } })`. Note that Better Auth
 * requires a session for that call, so the signed-out invite page needs a small public
 * endpoint (e.g. GET /api/v1/invitations/:id returning these fields) before going live.
 */
export async function getInvitation(input: {
  invitationId: Id;
}): Promise<InvitationDetails | null> {
  await fixtureDelay();
  const invitation = inviteFixtures.find((i) => i.id === input.invitationId);
  return invitation ? toDetails(invitation) : null;
}

/**
 * Accept the invitation as the signed-in user (call after sign-up or sign-in).
 * Real: `authClient.organization.acceptInvitation({ invitationId })`.
 */
export async function acceptInvitation(input: {
  invitationId: Id;
}): Promise<{ invitation: InvitationDetails }> {
  await fixtureDelay();
  const invitation = inviteFixtures.find((i) => i.id === input.invitationId);
  if (!invitation) {
    throw new Error("This invite link is not valid.");
  }
  const details = toDetails(invitation);
  if (details.status === "expired") {
    throw new Error("This invite has expired. Ask your academy for a new one.");
  }
  return { invitation: { ...details, status: "accepted" } };
}

/**
 * Academy, team, coaches and next session for the "You're in" screen.
 * Real: `organization.getFullOrganization` + `organization.listTeamMembers` and the
 * calendar endpoint, once the new member's session is active.
 */
export async function getJoinSummary(input: {
  invitationId: Id;
}): Promise<JoinSummary> {
  await fixtureDelay();
  const invitation = inviteFixtures.find((i) => i.id === input.invitationId);
  const details = invitation ? toDetails(invitation) : null;
  const teamId = invitation?.teamId ?? null;
  const coachNames = members
    .filter(
      (m) =>
        m.academyId === invitation?.academyId &&
        m.roles.includes("coach") &&
        teamId !== null &&
        m.teamIds.includes(teamId)
    )
    .flatMap((m) => {
      const person = users.find((u) => u.id === m.userId);
      return person ? [shortName(person.name)] : [];
    })
    .sort((a, b) => a.localeCompare(b));
  const next = events.find((e) => e.id === JOINED_NEXT_EVENT_ID);
  return {
    academyName: details?.academyName ?? "your academy",
    academyTimezone: details?.academyTimezone ?? "UTC",
    teamName: details?.teamName ?? null,
    memberName:
      users.find((u) => u.email === invitation?.email)?.name ?? "there",
    coachNames,
    nextSession: next
      ? {
          startDate: next.startDate,
          startTime: next.startTime,
          location: next.location,
        }
      : null,
  };
}
