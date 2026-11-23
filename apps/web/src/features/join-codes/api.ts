/*
 * Join codes, called "invitation codes" on the server (AO-2 create/list/revoke, ST-1 join).
 * Mock-data convention: see features/viewer/api.ts. Every function names the real endpoint
 * it stands in for (apps/web/src/server/api/v1/invitation-codes.ts on main); names, inputs,
 * return types and error codes mirror it, so plugging in is a body swap:
 *   const res = await fetch(path, { method, body: JSON.stringify(input) });
 *   if (!res.ok) throw InvitationCodeApiError.fromBody(res.status, await res.json());
 *   return (await res.json()).data;
 *
 * Two functions have NO endpoint yet (the designs show them, the server doesn't):
 * `extendInvitationCode` ("Extend" in 6G1-0) and `getJoinPreviewExtras` (place and coaches
 * on the confirm screen, 6WR-0). See their comments.
 */
import {
  academies,
  FIXTURE_NOW,
  fixtureDelay,
  members,
  teams,
  users,
} from "@/features/fixtures";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatCode,
  isCompleteCode,
  normalizeCode,
} from "@/features/join-codes/code-format";
import {
  type CodeSeed,
  codeSeeds,
  designedNewCode,
  joinerFixtures,
  WRONG_GUESS_LIMIT,
} from "@/features/join-codes/fixtures";
import type { Country, Id, Paginated, Timestamp } from "@/features/types";
import { academyCountry } from "@/features/viewer/selectors";
import { getUser } from "@/functions/get-user";

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
  /** "https://app.hoopsgenesis.com/join/K7PM-4QXR-9TWC" */
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

export class InvitationCodeApiError extends Error {
  readonly code: InvitationCodeErrorCode;
  readonly status: number;

  constructor(status: number, code: InvitationCodeErrorCode, message: string) {
    super(message);
    this.name = "InvitationCodeApiError";
    this.status = status;
    this.code = code;
  }

  static fromBody(
    status: number,
    body: { error?: { code?: string; message?: string } }
  ): InvitationCodeApiError {
    return new InvitationCodeApiError(
      status,
      (body.error?.code ?? "invalid_code") as InvitationCodeErrorCode,
      body.error?.message ?? "Request failed"
    );
  }
}

export function isInvitationCodeError(
  error: unknown
): error is InvitationCodeApiError {
  return error instanceof InvitationCodeApiError;
}

// ---------------------------------------------------------------- fixture store

const LINK_BASE = "https://app.hoopsgenesis.com";
const DAY_MS = 86_400_000;
export const MAX_CODE_LIFETIME_MS = 90 * DAY_MS;
export const MAX_CODE_USES = 1000;
export const DEFAULT_CODE_LIFETIME_MS = 7 * DAY_MS;

interface StoredCode extends Omit<CodeSeed, "redemptions"> {
  redemptions: { userId: Id; name: string; redeemedAt: Timestamp }[];
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, "-");
}

function toStored(seed: CodeSeed): StoredCode {
  return {
    ...seed,
    redemptions: [...seed.redemptions]
      .reverse()
      .map((r) => ({ ...r, userId: `user-${slug(r.name)}` })),
  };
}

let codeStore: StoredCode[] = codeSeeds.map(toStored);

/** Joined academies per fixture user (seeded from the shared member fixtures). */
const joinedAcademies = new Map<Id, Set<Id>>();
function academiesOf(userId: Id): Set<Id> {
  let set = joinedAcademies.get(userId);
  if (!set) {
    set = new Set(
      members.filter((m) => m.userId === userId).map((m) => m.academyId)
    );
    joinedAcademies.set(userId, set);
  }
  return set;
}

/** The fixture person "signed in" on /join (set by getJoinSession). */
let fixtureJoinerId: Id = joinerFixtures.claire.id;
let wrongGuesses = 0;

/** "Now" for statuses and relative dates. Fixtures are drawn at FIXTURE_NOW; real: new Date(). */
export function referenceNow(): Date {
  return FIXTURE_NOW;
}

function personName(id: Id | null): PersonRef | null {
  if (!id) {
    return null;
  }
  const found = users.find((u) => u.id === id);
  return found ? { id, name: found.name } : null;
}

function teamRef(teamId: Id | null): InvitationCodeTeam | null {
  const team = teams.find((t) => t.id === teamId);
  return team
    ? { id: team.id, name: team.name, ageGroup: team.ageGroup }
    : null;
}

function academyRef(academyId: Id) {
  const academy = academies.find((a) => a.id === academyId);
  if (!academy) {
    throw new Error(`Fixture academy ${academyId} is missing`);
  }
  return { id: academy.id, name: academy.name, slug: academy.slug };
}

/** Same order of precedence as the server's `codeStatus`. */
function statusOf(row: StoredCode, now: Date): InvitationCodeStatus {
  if (row.revoke) {
    return "revoked";
  }
  if (row.maxUses !== null && row.useCount >= row.maxUses) {
    return "used_up";
  }
  if (row.expiresAt && Date.parse(row.expiresAt) <= now.getTime()) {
    return "expired";
  }
  return "active";
}

function serialize(row: StoredCode): InvitationCode {
  const value = encodeURIComponent(row.code);
  return {
    id: row.id,
    code: row.code,
    link: `${LINK_BASE}/join/${value}`,
    deepLink: `hoops-genesis://join?code=${value}`,
    role: row.role,
    team: teamRef(row.teamId),
    maxUses: row.maxUses,
    useCount: row.useCount,
    expiresAt: row.expiresAt,
    status: statusOf(row, referenceNow()),
    createdAt: row.createdAt,
    createdById: row.createdById,
    createdBy: personName(row.createdById),
    revokedAt: row.revoke?.at ?? null,
    revokedById: row.revoke?.byId ?? null,
    revokedBy: personName(row.revoke?.byId ?? null),
    revokeReason: row.revoke?.reason ?? null,
    redemptions: row.redemptions.map((r) => ({
      userId: r.userId,
      user: { id: r.userId, name: r.name },
      redeemedAt: r.redeemedAt,
    })),
  };
}

function apiError(
  status: number,
  code: InvitationCodeErrorCode,
  message: string
): InvitationCodeApiError {
  return new InvitationCodeApiError(status, code, message);
}

function randomCode(): string {
  const bytes = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return formatCode(
    Array.from(bytes, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("")
  );
}

function hasCode(code: string): boolean {
  return codeStore.some((row) => row.code === code);
}

/** The designs' new code (R4KV-7MXE-2HQT), as if Sharika had just created it. */
function designedCode(now: Date): StoredCode {
  return {
    id: designedNewCode.id,
    academyId: designedNewCode.academyId,
    code: designedNewCode.code,
    role: designedNewCode.role,
    teamId: designedNewCode.teamId,
    maxUses: designedNewCode.maxUses,
    useCount: 0,
    expiresAt: new Date(
      now.getTime() + designedNewCode.days * DAY_MS
    ).toISOString(),
    createdById: designedNewCode.createdById,
    createdAt: now.toISOString(),
    revoke: null,
    redemptions: [],
  };
}

function findByCode(raw: string): StoredCode | undefined {
  const normalized = normalizeCode(raw);
  if (!isCompleteCode(normalized)) {
    return;
  }
  const code = formatCode(normalized);
  const found = codeStore.find((row) => row.code === code);
  if (found || code !== designedNewCode.code) {
    return found;
  }
  const made = designedCode(referenceNow());
  codeStore = [made, ...codeStore];
  return made;
}

function updateCode(
  id: Id,
  change: (row: StoredCode) => StoredCode
): StoredCode {
  let updated: StoredCode | undefined;
  codeStore = codeStore.map((row) => {
    if (row.id !== id) {
      return row;
    }
    updated = change(row);
    return updated;
  });
  if (!updated) {
    throw apiError(
      404,
      "invitation_code_not_found",
      "Invitation code not found"
    );
  }
  return updated;
}

function findManaged(academyId: Id, id: Id): StoredCode {
  const row = codeStore.find((c) => c.id === id && c.academyId === academyId);
  if (!row) {
    throw apiError(
      404,
      "invitation_code_not_found",
      "Invitation code not found"
    );
  }
  return row;
}

// ---------------------------------------------------------------- managing (academy admin)

/**
 * GET /api/v1/academies/:academyId/invitation-codes?limit=&cursor=
 * Newest first, `{ data, nextCursor }`.
 */
export async function listInvitationCodes(
  academyId: Id
): Promise<Paginated<InvitationCode>> {
  await fixtureDelay();
  const data = codeStore
    .filter((row) => row.academyId === academyId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(serialize);
  return { data, nextCursor: null };
}

/** GET /api/v1/academies/:academyId/invitation-codes/:id */
export async function getInvitationCode(input: {
  academyId: Id;
  id: Id;
}): Promise<InvitationCode> {
  await fixtureDelay();
  return serialize(findManaged(input.academyId, input.id));
}

/**
 * POST /api/v1/academies/:academyId/invitation-codes
 * Body `{ role, teamId?, maxUses?, expiresAt? }`. maxUses omitted = single use, null =
 * unlimited; expiresAt omitted = 7 days; at most 90 days away. 201 `{ data: code }`.
 */
export async function createInvitationCode(input: {
  academyId: Id;
  expiresAt?: Timestamp;
  maxUses?: number | null;
  role: InvitationCodeRole;
  teamId?: Id;
  /** Fixture only: the real server takes the creator from the session. */
  createdById: Id;
}): Promise<InvitationCode> {
  await fixtureDelay();
  const now = referenceNow();
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(now.getTime() + DEFAULT_CODE_LIFETIME_MS);
  if (expiresAt.getTime() <= now.getTime()) {
    throw apiError(
      400,
      "expires_at_in_past",
      "expiresAt must be in the future"
    );
  }
  if (expiresAt.getTime() - now.getTime() > MAX_CODE_LIFETIME_MS) {
    throw apiError(
      400,
      "lifetime_too_long",
      "expiresAt can be at most 2160 hours away"
    );
  }
  const code = hasCode(designedNewCode.code)
    ? randomCode()
    : designedNewCode.code;
  const row: StoredCode = {
    id:
      code === designedNewCode.code
        ? designedNewCode.id
        : `code-${code.toLowerCase()}`,
    academyId: input.academyId,
    code,
    role: input.role,
    teamId: input.teamId ?? null,
    maxUses: input.maxUses === undefined ? 1 : input.maxUses,
    useCount: 0,
    expiresAt: expiresAt.toISOString(),
    createdById: input.createdById,
    createdAt: now.toISOString(),
    revoke: null,
    redemptions: [],
  };
  codeStore = [row, ...codeStore];
  return serialize(row);
}

/**
 * POST /api/v1/academies/:academyId/invitation-codes/:id/revoke
 * Body `{ reason? }`. Final; a second revoke is 409 `already_revoked`.
 */
export async function revokeInvitationCode(input: {
  academyId: Id;
  id: Id;
  reason?: string;
  /** Fixture only: the real server takes this from the session. */
  revokedById: Id;
}): Promise<InvitationCode> {
  await fixtureDelay();
  const row = findManaged(input.academyId, input.id);
  if (row.revoke) {
    throw apiError(409, "already_revoked", "Already revoked");
  }
  return serialize(
    updateCode(row.id, (current) => ({
      ...current,
      revoke: {
        at: referenceNow().toISOString(),
        byId: input.revokedById,
        reason: input.reason?.trim() || null,
      },
    }))
  );
}

/**
 * NO ENDPOINT YET. "Extend" in the design (6G1-0) and the spec ("Extend or revoke").
 * Proposed: PATCH /api/v1/academies/:academyId/invitation-codes/:id `{ expiresAt }`,
 * same 90-day limit as create (counted from now). Fixture only until it exists.
 */
export async function extendInvitationCode(input: {
  academyId: Id;
  expiresAt: Timestamp;
  id: Id;
}): Promise<InvitationCode> {
  await fixtureDelay();
  const now = referenceNow();
  if (Date.parse(input.expiresAt) - now.getTime() > MAX_CODE_LIFETIME_MS) {
    throw apiError(
      400,
      "lifetime_too_long",
      "expiresAt can be at most 2160 hours away"
    );
  }
  findManaged(input.academyId, input.id);
  return serialize(
    updateCode(input.id, (current) => ({
      ...current,
      expiresAt: input.expiresAt,
    }))
  );
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
 * Who is signed in on /join, or null. Real: Better Auth `getSession()` (the `getUser`
 * server function). In UI preview mode: Claire (new), Aline (`?as=student`, already a
 * member) or nobody (`?as=signed-out`).
 */
export async function getJoinSession(input: {
  preview: boolean;
  previewAs?: JoinPreviewAs;
}): Promise<JoinSession | null> {
  if (!input.preview) {
    const session = await getUser();
    return session
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
        }
      : null;
  }
  await fixtureDelay();
  if (input.previewAs === "signed-out") {
    return null;
  }
  const joiner =
    input.previewAs === "student"
      ? joinerFixtures.student
      : joinerFixtures.claire;
  fixtureJoinerId = joiner.id;
  return { ...joiner };
}

/** Checks shared by preview and redeem, in the server's order. 404, then 410s. */
function findActiveCode(raw: string): StoredCode {
  const row = findByCode(raw);
  if (!row) {
    wrongGuesses += 1;
    if (wrongGuesses > WRONG_GUESS_LIMIT) {
      throw apiError(429, "rate_limited", "Too many tries");
    }
    throw apiError(404, "invalid_code", "This code is not valid");
  }
  wrongGuesses = 0;
  const status = statusOf(row, referenceNow());
  if (status === "revoked") {
    throw apiError(
      410,
      "code_revoked",
      "This code was withdrawn; ask for a new one"
    );
  }
  if (status === "used_up") {
    throw apiError(
      410,
      "code_used_up",
      "This code has been used up; ask for a new one"
    );
  }
  if (status === "expired") {
    throw apiError(
      410,
      "code_expired",
      "This code has expired; ask for a new one"
    );
  }
  return row;
}

/**
 * POST /api/v1/invitation-codes/preview  `{ code }` (any case, dashes optional).
 * 404 `invalid_code`; 410 `code_revoked` | `code_used_up` | `code_expired`.
 */
export async function previewInvitationCode(input: {
  code: string;
}): Promise<InvitationCodePreview> {
  await fixtureDelay();
  const row = findActiveCode(input.code);
  return {
    academy: academyRef(row.academyId),
    role: row.role,
    team: teamRef(row.teamId),
    expiresAt: row.expiresAt,
    alreadyMember: academiesOf(fixtureJoinerId).has(row.academyId),
  };
}

/**
 * POST /api/v1/invitation-codes/redeem  `{ code }` -> 201.
 * Errors as preview, plus 409 `already_member` | `already_redeemed`,
 * 422 `one_team_per_student`, 403 `platform_admin_cannot_be_member`.
 */
export async function redeemInvitationCode(input: {
  code: string;
}): Promise<InvitationCodeRedeemResult> {
  await fixtureDelay();
  const row = findActiveCode(input.code);
  const userId = fixtureJoinerId;
  if (academiesOf(userId).has(row.academyId)) {
    throw apiError(
      409,
      "already_member",
      "You are already a member of this academy"
    );
  }
  if (row.redemptions.some((r) => r.userId === userId)) {
    throw apiError(409, "already_redeemed", "You have already used this code");
  }
  const joiner = Object.values(joinerFixtures).find((j) => j.id === userId);
  updateCode(row.id, (current) => ({
    ...current,
    useCount: current.useCount + 1,
    redemptions: [
      ...current.redemptions,
      {
        userId,
        name: joiner?.name ?? "New member",
        redeemedAt: referenceNow().toISOString(),
      },
    ],
  }));
  academiesOf(userId).add(row.academyId);
  return {
    academy: academyRef(row.academyId),
    member: {
      id: `member-${row.academyId}-${userId}`,
      userId,
      roles: [row.role],
    },
    team: teamRef(row.teamId),
  };
}

/**
 * NO ENDPOINT YET. The confirm screen (6WR-0 / 6WT-0) shows the academy's place
 * ("Kigali, Rwanda") and the team's coaches ("Patrick H., Sharika D."); the preview
 * response has neither. Proposed: add `academy.timezone`/`location` and `team.coaches`
 * to the preview `data`. Until then the screen hides these rows when this returns null.
 */
export async function getJoinPreviewExtras(input: {
  academyId: Id;
  teamId: Id | null;
}): Promise<{ city: string; coachNames: string[]; country: Country } | null> {
  await fixtureDelay();
  const academy = academies.find((a) => a.id === input.academyId);
  if (!academy) {
    return null;
  }
  const coachNames = input.teamId
    ? members
        .filter(
          (m) =>
            m.academyId === input.academyId &&
            m.roles.includes("coach") &&
            m.teamIds.includes(input.teamId ?? "")
        )
        .map((m) => shortName(m.user.name))
        .sort((a, b) => a.localeCompare(b))
    : [];
  return {
    city: academy.shortName,
    country: academyCountry(academy),
    coachNames,
  };
}

const WHITESPACE = /\s+/;

/** "Patrick Habimana" -> "Patrick H."; "Sharika D." stays. */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(WHITESPACE);
  const last = rest.at(-1);
  if (!last || last.endsWith(".")) {
    return name;
  }
  return `${first} ${last.charAt(0)}.`;
}
