/*
 * Preview-mode (fixture) implementation of features/members/api.ts. Dev only.
 * Members and the invitations an admin sends (stories AO-2, AO-3).
 */
import {
  FIXTURE_NOW,
  fixtureDelay,
  invitations as invitationFixtures,
  members as memberFixtures,
  users,
} from "@/features/fixtures";
import type { InviteMembersInput, MemberCounts } from "@/features/members/api";
import { memberTotals } from "@/features/members/fixtures";
import type { Id, Invitation, Member, UserSummary } from "@/features/types";

/** The fixture admin who sends invites in preview (the server uses the session). */
const PREVIEW_INVITER_ID = "user-sharika";

/** Invite links work for 48 hours (Better Auth `invitationExpiresIn`). */
const INVITE_LIFETIME_MS = 48 * 60 * 60 * 1000;

/** "Now" for relative dates. Fixtures are drawn at FIXTURE_NOW; real: `new Date()`. */
export function referenceNow(): Date {
  return FIXTURE_NOW;
}

const memberEmails = new Set(memberFixtures.map((m) => m.user.email));

/*
 * The Members design (1I2-0, G8Q-0) lists 71 people; the shared fixtures hold the ones
 * other screens name. The rest are filler students and coaches made up here so paging
 * ("Showing 1 to 25 of 71", "Show 25 more") reads as drawn.
 */
const FILLER_STUDENT_NAMES = [
  "Claire Ingabire",
  "Yves Mugenzi",
  "Alice Mukamana",
  "Bosco Habineza",
  "Chantal Uwera",
  "David Nkurunziza",
  "Esther Umutoni",
  "Fabrice Ndayisaba",
  "Gloria Mutesi",
  "Herve Bizimana",
  "Irene Uwamahoro",
  "Joel Tuyisenge",
  "Kelia Ishimwe",
  "Lionel Manzi",
  "Moise Hakizimana",
  "Nadine Umuhoza",
  "Obed Niyonkuru",
  "Pacifique Iradukunda",
  "Queen Uwase",
  "Remy Twagirayezu",
  "Sandrine Mukeshimana",
  "Thierry Gasana",
  "Ursule Nyiransabimana",
  "Valens Habimana",
  "Wivine Uwimana",
  "Xavier Rukundo",
  "Yvette Mukandayisenga",
  "Zacharie Nshimiyimana",
  "Ange Uwineza",
  "Benjamin Kwizera",
  "Clarisse Ingabire",
  "Didier Mugisha",
  "Eliane Umurerwa",
  "Fiston Ndikumana",
  "Grace Mukamazimpaka",
  "Hubert Niyibizi",
  "Inès Uwamariya",
  "Jules Rwigema",
  "Kevine Umwali",
  "Lambert Habiyaremye",
  "Marina Uwizeye",
  "Noel Nsengimana",
  "Odette Mukarugwiza",
  "Patrice Tuyishime",
  "Rachel Ishimwe",
  "Samuel Byiringiro",
  "Teta Umutesi",
  "Ulrich Mugabo",
  "Vanessa Ingabire",
  "Wilson Habumugisha",
  "Hope Mukamurenzi",
];
const FILLER_TEAMS = ["team-u12", "team-u14", "team-u16", "team-girls-u16"];
const FILLER_JOINED = "2026-08-01T08:00:00Z";

function fillerMember(
  name: string,
  index: number,
  roles: Member["roles"],
  teamIds: Id[],
  createdAt = FILLER_JOINED
): Member {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z ]/g, "")
    .replace(/ /g, ".");
  const userId = `user-filler-${index}`;
  return {
    id: `member-acad-kigali-${userId}`,
    academyId: "acad-kigali",
    userId,
    roles,
    teamIds,
    createdAt,
    user: { id: userId, name, email: `${slug}@example.com`, image: null },
  };
}

const fillers: Member[] = [
  ...FILLER_STUDENT_NAMES.map((name, index) =>
    fillerMember(
      name,
      index,
      ["student"],
      [index === 0 ? "team-u14" : (FILLER_TEAMS[index % 4] ?? "team-u12")],
      // "Claire Ingabire · Student · U14 · joined today" on the phone list (G8Q-0).
      index === 0 ? "2026-11-23T07:30:00Z" : FILLER_JOINED
    )
  ),
];

/** In-memory members so role changes, moves and removals survive refetches. */
let memberStore: Member[] = [...memberFixtures, ...fillers];

/** Members of an academy (preview store), shared with the member detail mock. */
export function storedMembers(academyId: Id): Member[] {
  return memberStore.filter((m) => m.academyId === academyId);
}

/** Replace one stored member (role change, team move); `null` removes it. */
export function updateStoredMember(
  memberId: Id,
  update: (member: Member) => Member | null
): void {
  memberStore = memberStore.flatMap((m) => {
    if (m.id !== memberId) {
      return [m];
    }
    const next = update(m);
    return next ? [next] : [];
  });
}

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
  return storedMembers(academyId);
}

/** Pending and expired invitations. Real: `authClient.organization.listInvitations`. */
export async function listInvitations(academyId: Id): Promise<Invitation[]> {
  await fixtureDelay();
  return openInvites(academyId);
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
      inviterId: PREVIEW_INVITER_ID,
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
  academyId: Id;
  invitationId: Id;
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
    inviterId: PREVIEW_INVITER_ID,
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
  academyId: Id;
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
