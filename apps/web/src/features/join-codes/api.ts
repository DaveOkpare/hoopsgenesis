/*
 * Join codes, called "invitation codes" on the server (AO-2 create/list/revoke, ST-1 join).
 * Real calls to apps/web/src/server/api/v1/invitation-codes.ts; the fixture version is
 * ./api.mock.ts (dev preview only). Data-layer convention: features/viewer/api.ts.
 *
 * Two things the designs show have NO endpoint: extending a code's expiry ("Extend" in
 * 6G1-0) and the confirm screen's place and coaches (6WR-0). See their functions.
 */
import type { Country, Id, Paginated, Timestamp } from "@/features/types";
import {
  ApiError,
  academyPath,
  apiAll,
  apiData,
  unwrapAuth,
} from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview, PREVIEW_NOW } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

// ---------------------------------------------------------------- types (server shapes)

export type InvitationCodeStatus = "active" | "expired" | "used_up" | "revoked";

/** Academy admins create coach and student codes; only the owner creates admin codes. */
export type InvitationCodeRole = "coach" | "student";

/** `{ id, name }` next to every `...ById` (server `personRef`). */
export interface PersonRef {
  id: Id;
  name: string;
}

export interface InvitationCodeTeam {
  ageGroup: string | null;
  id: Id;
  name: string;
}

export interface InvitationCodeRedemption {
  redeemedAt: Timestamp;
  user: PersonRef | null;
  userId: Id;
}

/** `serializeCode` on the server. */
export interface InvitationCode {
  /** "K7PM-4QXR-9TWC" */
  code: string;
  createdAt: Timestamp;
  createdBy: PersonRef | null;
  createdById: Id;
  /** "hoops-genesis://join?code=K7PM-4QXR-9TWC" */
  deepLink: string;
  /** Every code the server creates expires; older rows may have none. */
  expiresAt: Timestamp | null;
  id: Id;
  /** "<BETTER_AUTH_URL>/join/K7PM-4QXR-9TWC" */
  link: string;
  /** null = no limit. */
  maxUses: number | null;
  /** Oldest first. */
  redemptions: InvitationCodeRedemption[];
  revokedAt: Timestamp | null;
  revokedBy: PersonRef | null;
  revokedById: Id | null;
  revokeReason: string | null;
  role: InvitationCodeRole;
  status: InvitationCodeStatus;
  team: InvitationCodeTeam | null;
  useCount: number;
}

/** POST /invitation-codes/preview `data`: nothing about the code's settings. */
export interface InvitationCodePreview {
  academy: { id: Id; name: string; slug: string };
  alreadyMember: boolean;
  expiresAt: Timestamp | null;
  role: InvitationCodeRole;
  team: InvitationCodeTeam | null;
}

/** POST /invitation-codes/redeem `data` (201). */
export interface InvitationCodeRedeemResult {
  academy: { id: Id; name: string; slug: string };
  member: { id: Id; roles: string[]; userId: Id };
  team: InvitationCodeTeam | null;
}

/** Error codes the screens branch on (`{ error: { code, message } }`). */
export type InvitationCodeErrorCode =
  | "invalid_code"
  | "code_revoked"
  | "code_used_up"
  | "code_expired"
  | "already_member"
  | "already_redeemed"
  | "one_team_per_student"
  | "platform_admin_cannot_be_member"
  | "already_revoked"
  | "invitation_code_not_found"
  | "expires_at_in_past"
  | "lifetime_too_long"
  /** 429 from the host's rate limit on the code routes (API endpoints.md, "still open"). */
  | "rate_limited";

/** An ApiError with one of the codes above (the preview mock throws these too). */
export class InvitationCodeApiError extends ApiError {
  constructor(status: number, code: InvitationCodeErrorCode, message: string) {
    super({ status, code, message });
    this.name = "InvitationCodeApiError";
  }
}

const KNOWN_ERROR_CODES = new Set<string>([
  "invalid_code",
  "code_revoked",
  "code_used_up",
  "code_expired",
  "already_member",
  "already_redeemed",
  "one_team_per_student",
  "platform_admin_cannot_be_member",
  "already_revoked",
  "invitation_code_not_found",
  "expires_at_in_past",
  "lifetime_too_long",
  "rate_limited",
]);

const RATE_LIMITED_STATUS = 429;
const MS_PER_SECOND = 1000;

/**
 * When code entry opens again after a 429, if the answer said so in
 * `details.retryAfterSeconds`. The server leaves rate limiting to the host, whose 429
 * carries no such detail today, so in real mode this is null and the screen names no
 * time (it never guesses one).
 */
export function rateLimitRetryAt(error: unknown, now: Date): Date | null {
  if (!(error instanceof ApiError) || error.status !== RATE_LIMITED_STATUS) {
    return null;
  }
  const details = error.details as { retryAfterSeconds?: unknown } | null;
  const seconds = details?.retryAfterSeconds;
  return typeof seconds === "number" && seconds > 0
    ? new Date(now.getTime() + seconds * MS_PER_SECOND)
    : null;
}

/** The code of a failed code call, or null for anything else (network, 500...). */
export function invitationCodeErrorCode(
  error: unknown
): InvitationCodeErrorCode | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.status === RATE_LIMITED_STATUS) {
    return "rate_limited";
  }
  return KNOWN_ERROR_CODES.has(error.code)
    ? (error.code as InvitationCodeErrorCode)
    : null;
}

// ---------------------------------------------------------------- limits and clock

const DAY_MS = 86_400_000;
/** Server limits (invitation-codes.ts). */
export const MAX_CODE_LIFETIME_MS = 90 * DAY_MS;
export const MAX_CODE_USES = 1000;
export const DEFAULT_CODE_LIFETIME_MS = 7 * DAY_MS;

/** "Now" for statuses and "Ends in 4 days": the designs' moment in preview. */
export function referenceNow(): Date {
  if (import.meta.env.DEV && isUiPreview) {
    return PREVIEW_NOW;
  }
  return new Date();
}

// ---------------------------------------------------------------- managing (academy admin)

/** GET /api/v1/academies/:academyId/invitation-codes (every page), newest first. */
export async function listInvitationCodes(
  academyId: Id
): Promise<Paginated<InvitationCode>> {
  if (mock) {
    return (await mock()).listInvitationCodes(academyId);
  }
  const data = await apiAll<InvitationCode>(
    academyPath(academyId, "/invitation-codes")
  );
  return { data, nextCursor: null };
}

/** GET /api/v1/academies/:academyId/invitation-codes/:id */
export async function getInvitationCode(input: {
  academyId: Id;
  id: Id;
}): Promise<InvitationCode> {
  if (mock) {
    return (await mock()).getInvitationCode(input);
  }
  return apiData<InvitationCode>(
    academyPath(
      input.academyId,
      `/invitation-codes/${encodeURIComponent(input.id)}`
    )
  );
}

/**
 * POST /api/v1/academies/:academyId/invitation-codes
 * Body `{ role, teamId?, maxUses?, expiresAt? }`. maxUses omitted = single use, null =
 * unlimited; expiresAt omitted = 7 days; at most 90 days away. 201 `{ data: code }`.
 * The creator comes from the session.
 */
export async function createInvitationCode(input: {
  academyId: Id;
  expiresAt?: Timestamp;
  maxUses?: number | null;
  role: InvitationCodeRole;
  teamId?: Id;
}): Promise<InvitationCode> {
  if (mock) {
    return (await mock()).createInvitationCode(input);
  }
  const { academyId, ...body } = input;
  return apiData<InvitationCode>(academyPath(academyId, "/invitation-codes"), {
    method: "POST",
    body,
  });
}

/**
 * POST /api/v1/academies/:academyId/invitation-codes/:id/revoke
 * Body `{ reason? }`. Final; a second revoke is 409 `already_revoked`.
 */
export async function revokeInvitationCode(input: {
  academyId: Id;
  id: Id;
  reason?: string;
}): Promise<InvitationCode> {
  if (mock) {
    return (await mock()).revokeInvitationCode(input);
  }
  const reason = input.reason?.trim();
  return apiData<InvitationCode>(
    academyPath(
      input.academyId,
      `/invitation-codes/${encodeURIComponent(input.id)}/revoke`
    ),
    { method: "POST", body: reason ? { reason } : {} }
  );
}

/** False in real mode: the server cannot change a code's expiry (see below). */
export const canExtendInvitationCodes = mock !== null;

/**
 * NO ENDPOINT. "Extend" in the design (6G1-0) and the spec ("Extend or revoke"). The
 * server has no way to change a code's expiry (would be e.g. PATCH
 * /invitation-codes/:id `{ expiresAt }`), so the control is hidden outside preview
 * (`canExtendInvitationCodes`) and this refuses.
 */
export async function extendInvitationCode(input: {
  academyId: Id;
  expiresAt: Timestamp;
  id: Id;
}): Promise<InvitationCode> {
  if (mock) {
    return (await mock()).extendInvitationCode(input);
  }
  throw new ApiError({
    status: 0,
    code: "not_supported",
    message: "Codes can't be extended yet. Make a new code instead.",
  });
}

// ---------------------------------------------------------------- joining (anyone signed in)

export interface JoinSession {
  email: string;
  id: Id;
  name: string;
}

/** Preview mode only: who /join shows as signed in (`?as=`). */
export type JoinPreviewAs = "student" | "signed-out";

/**
 * Who is signed in on /join, or null: Better Auth `getSession()`. In UI preview mode:
 * Claire (new), Aline (`?as=student`, already a member) or nobody (`?as=signed-out`).
 */
export async function getJoinSession(input: {
  previewAs?: JoinPreviewAs;
}): Promise<JoinSession | null> {
  if (mock) {
    return (await mock()).getJoinSession(input);
  }
  const { data } = await authClient.getSession();
  return data
    ? { id: data.user.id, name: data.user.name, email: data.user.email }
    : null;
}

/**
 * False in real mode: the preview route needs a session (server rule: "signed-in calls
 * only"), so someone who opens a join link signed out can't be told the academy, role or
 * team yet (9G0-0 / 9IM-0 show them). The preview fixtures can, so the design shows.
 */
export const canPreviewCodesSignedOut = mock !== null;

/**
 * POST /api/v1/invitation-codes/preview  `{ code }` (any case, dashes optional).
 * 404 `invalid_code`; 410 `code_revoked` | `code_used_up` | `code_expired`.
 */
export async function previewInvitationCode(input: {
  code: string;
}): Promise<InvitationCodePreview> {
  if (mock) {
    return (await mock()).previewInvitationCode(input);
  }
  return apiData<InvitationCodePreview>("/invitation-codes/preview", {
    method: "POST",
    body: { code: input.code },
  });
}

/**
 * POST /api/v1/invitation-codes/redeem  `{ code }` -> 201, then makes the academy just
 * joined the active one (`organization.setActive`) so /app opens it.
 * Errors as preview, plus 409 `already_member` | `already_redeemed`,
 * 422 `one_team_per_student`, 403 `platform_admin_cannot_be_member`.
 */
export async function redeemInvitationCode(input: {
  code: string;
}): Promise<InvitationCodeRedeemResult> {
  if (mock) {
    return (await mock()).redeemInvitationCode(input);
  }
  const result = await apiData<InvitationCodeRedeemResult>(
    "/invitation-codes/redeem",
    { method: "POST", body: { code: input.code } }
  );
  unwrapAuth(
    await authClient.organization.setActive({
      organizationId: result.academy.id,
    })
  );
  return result;
}

/**
 * NO ENDPOINT. The confirm screen (6WR-0 / 6WT-0) shows the academy's place ("Kigali,
 * Rwanda") and the team's coaches ("Patrick H., Sharika D."); the preview response has
 * neither, and someone who is not yet a member may read nothing else about the
 * academy. Real mode returns null and the screen hides these rows.
 */
export async function getJoinPreviewExtras(input: {
  academyId: Id;
  teamId: Id | null;
}): Promise<{ city: string; coachNames: string[]; country: Country } | null> {
  if (mock) {
    return (await mock()).getJoinPreviewExtras(input);
  }
  return null;
}
