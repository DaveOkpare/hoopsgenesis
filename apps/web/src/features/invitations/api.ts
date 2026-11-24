/*
 * Invitations seen by the person invited (ST-1), through Better Auth's organization
 * plugin. The fixture version is ./api.mock.ts (dev preview only). Data-layer
 * convention: features/viewer/api.ts.
 *
 * What the server allows: an invitation id can be read only by a signed-in user whose
 * email is the invitation's (`organization.getInvitation`), and only while it is pending
 * and unexpired. A signed-out visitor therefore learns nothing from the link; the page
 * asks them to make an account (or sign in) first and then accepts the invite.
 */
import type {
  AcademyRole,
  DateOnly,
  Id,
  InvitationStatus,
  TimeOfDay,
  Timestamp,
} from "@/features/types";
import { parseRoles } from "@/features/viewer/api";
import { ApiError, academyPath, apiAll, unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/**
 * What the invite page needs: `organization.getInvitation` (the invitation row plus
 * `organizationName` and `inviterEmail`). `status` is "expired" once `expiresAt` has
 * passed, even if the row still says pending.
 */
export interface InvitationDetails {
  academyName: string;
  academyTimezone: string;
  createdAt: Timestamp;
  email: string;
  expiresAt: Timestamp;
  id: Id;
  /** The inviter's name in preview; their email in real mode (all Better Auth returns). */
  inviterName: string;
  role: AcademyRole;
  status: InvitationStatus;
  /** Null in real mode: someone not yet in the academy may not read its teams. */
  teamName: string | null;
}

/** What the invite link tells this visitor. */
export type InvitationLookup =
  | {
      kind: "found";
      invitation: InvitationDetails;
      /** True when read with a session (real mode); the preview fixtures are "signed out". */
      signedIn: boolean;
    }
  /** Unknown id, or no longer pending (accepted, cancelled, expired): Better Auth doesn't say which. */
  | {
      kind: "not-found";
      /** Real mode only reads invitations signed in; the preview fixtures are "signed out". */
      signedIn: boolean;
    }
  /** Nobody signed in: the invitation can't be read yet. */
  | { kind: "signed-out" }
  /** Signed in with a different email than the one invited. */
  | { kind: "wrong-account"; signedInAs: string };

/** Shown after joining (59H-0). */
export interface JoinSummary {
  academyName: string;
  academyTimezone: string;
  /** Short names, e.g. "Patrick H." */
  coachNames: string[];
  /** The person who joined (the session user's name). */
  memberName: string;
  nextSession: {
    location: string | null;
    startDate: DateOnly;
    startTime: TimeOfDay | null;
  } | null;
  teamName: string | null;
}

const FORBIDDEN = 403;
const WHITESPACE = /\s+/;
const DAY_MS = 86_400_000;
/** How far ahead "Next session" looks (the events list allows 92 days). */
const NEXT_SESSION_DAYS = 30;

/** "Patrick Habimana" -> "Patrick H."; "Sharika D." stays as it is. */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(WHITESPACE);
  const last = rest.at(-1);
  if (!last || last.endsWith(".")) {
    return name;
  }
  return `${first} ${last.charAt(0)}.`;
}

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? "");

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function toStatus(status: string, expiresAt: string): InvitationStatus {
  if (status === "pending" && Date.parse(expiresAt) <= Date.now()) {
    return "expired";
  }
  return status as InvitationStatus;
}

/**
 * Look up an invitation by id: `authClient.organization.getInvitation({ query: { id } })`
 * once signed in (see the note at the top for what a signed-out visitor gets).
 */
export async function getInvitation(input: {
  invitationId: Id;
}): Promise<InvitationLookup> {
  if (mock) {
    return (await mock()).getInvitation(input);
  }
  const { data: session } = await authClient.getSession();
  if (!session) {
    return { kind: "signed-out" };
  }
  const result = await authClient.organization.getInvitation({
    query: { id: input.invitationId },
  });
  if (result.error) {
    return result.error.status === FORBIDDEN
      ? { kind: "wrong-account", signedInAs: session.user.email }
      : { kind: "not-found", signedIn: true };
  }
  const row = result.data as unknown as Record<string, unknown>;
  const expiresAt = toIso(row.expiresAt);
  return {
    kind: "found",
    signedIn: true,
    invitation: {
      id: String(row.id),
      email: String(row.email),
      role: parseRoles(String(row.role ?? ""))[0] ?? "student",
      status: toStatus(String(row.status), expiresAt),
      createdAt: toIso(row.createdAt),
      expiresAt,
      academyName: String(row.organizationName ?? "your academy"),
      academyTimezone: browserTimeZone(),
      inviterName: String(row.inviterEmail ?? "Your academy"),
      teamName: null,
    },
  };
}

/**
 * Accept the invitation as the signed-in user (after sign-up or sign-in):
 * `authClient.organization.acceptInvitation({ invitationId })`. Better Auth adds the
 * member (and team), and makes the academy the active one.
 */
export async function acceptInvitation(input: {
  invitationId: Id;
}): Promise<{ invitationId: Id }> {
  if (mock) {
    const { invitation } = await (await mock()).acceptInvitation(input);
    return { invitationId: invitation.id };
  }
  unwrapAuth(
    await authClient.organization.acceptInvitation({
      invitationId: input.invitationId,
    })
  );
  return { invitationId: input.invitationId };
}

interface RosterMember {
  name: string;
  roles: string[];
  userId: Id;
}

interface SessionRow {
  cancelled: boolean;
  location: string | null;
  sessionDate: DateOnly;
  startsAt: Timestamp | null;
  startTime: TimeOfDay | null;
}

function plainDate(date: Date, timeZone: string): DateOnly {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function teamExtras(
  academyId: Id,
  teamId: Id,
  timeZone: string,
  selfId: Id
): Promise<Pick<JoinSummary, "coachNames" | "nextSession">> {
  const now = new Date();
  const [roster, sessions] = await Promise.all([
    apiAll<RosterMember>(academyPath(academyId, `/teams/${teamId}/members`)),
    apiAll<SessionRow>(academyPath(academyId, "/events"), {
      query: {
        teamId,
        from: plainDate(now, timeZone),
        to: plainDate(
          new Date(now.getTime() + NEXT_SESSION_DAYS * DAY_MS),
          timeZone
        ),
      },
      maxItems: 50,
    }),
  ]);
  const next = sessions.find(
    (row) =>
      !row.cancelled &&
      (row.startsAt === null || Date.parse(row.startsAt) > now.getTime())
  );
  return {
    coachNames: roster
      .filter(
        (person) => person.roles.includes("coach") && person.userId !== selfId
      )
      .map((person) => shortName(person.name))
      .sort((a, b) => a.localeCompare(b)),
    nextSession: next
      ? {
          startDate: next.sessionDate,
          startTime: next.startTime,
          location: next.location,
        }
      : null,
  };
}

/**
 * Academy, team, coaches and next session for the "You're in" screen, read as the new
 * member once the invite is accepted (accepting makes that academy active):
 * `getSession` (active academy), `organization.getFullOrganization`,
 * `organization.listUserTeams`, then GET /teams/:teamId/members and GET /events.
 */
export async function getJoinSummary(input: {
  invitationId: Id;
}): Promise<JoinSummary> {
  if (mock) {
    return (await mock()).getJoinSummary(input);
  }
  const session = unwrapAuth(await authClient.getSession());
  const academyId = session?.session.activeOrganizationId;
  if (!(session && academyId)) {
    throw new ApiError({
      status: 0,
      code: "no_active_academy",
      message: "Sign in to see your academy.",
    });
  }
  const [academy, userTeams] = await Promise.all([
    authClient.organization
      .getFullOrganization({ query: { organizationId: academyId } })
      .then(unwrapAuth),
    authClient.organization
      .listUserTeams({ query: { organizationId: academyId } })
      .then(unwrapAuth),
  ]);
  const timeZone =
    (academy as unknown as { timezone?: string } | null)?.timezone ??
    browserTimeZone();
  const team = userTeams?.[0] ?? null;
  const extras = team
    ? await teamExtras(academyId, team.id, timeZone, session.user.id)
    : { coachNames: [], nextSession: null };
  return {
    academyName: academy?.name ?? "your academy",
    academyTimezone: timeZone,
    memberName: session.user.name,
    teamName: team?.name ?? null,
    ...extras,
  };
}
