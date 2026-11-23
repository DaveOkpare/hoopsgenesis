/**
 * Open invitation codes: not tied to an email. An academy admin (coach and
 * student codes) or the platform owner (any role, `admin` included) creates a
 * code; anyone signed in who holds it can join the academy with its role,
 * and its team if it has one, while it is active.
 *
 * Managing codes (academy admin: `invitation:create` to create and read,
 * `invitation:cancel` to revoke, which only academy admins hold; coaches and
 * students get 403, non-members 404):
 *
 * POST /api/v1/academies/:academyId/invitation-codes             create
 * GET  /api/v1/academies/:academyId/invitation-codes             list, newest first, paginated
 * GET  /api/v1/academies/:academyId/invitation-codes/:id         one code
 * POST /api/v1/academies/:academyId/invitation-codes/:id/revoke  revoke (final)
 *
 * The platform owner has the same four under /api/v1/admin/academies/:academyId/
 * and alone may create `admin` codes. Admin codes never reach an academy
 * admin: they are left out of the academy admin's list, and GET or revoke by
 * id answers 404, so neither the code nor its link is ever sent to them.
 *
 * Redeeming (any signed-in user):
 *
 * POST /api/v1/invitation-codes/preview  { code }  what the code joins
 * POST /api/v1/invitation-codes/redeem   { code }  join
 *
 * An unknown or malformed code is 404 `invalid_code`. A code that exists but
 * cannot be used is 410 `code_revoked`, `code_used_up` or `code_expired` (in
 * that order of precedence), so the join screen can explain it; those carry
 * nothing about the academy. Redeeming checks the same rules as Better Auth's
 * invitation hooks, through the shared functions in
 * `@hoops-genesis/auth/membership-rules`.
 *
 * Limits: a coach or student code defaults to single use and 7 days; `maxUses`
 * is 1 to 1000 or null (unlimited); `expiresAt` must be in the future and at
 * most 90 days away, so every code expires. Admin codes are always single use
 * and expire within 72 hours (default 48).
 *
 * Audit: `invitation_code.create` and `invitation_code.revoke` (entity
 * `invitation_code`, the row id), `member.join_by_code` (entity `member`) and
 * `team.member_add` when the code has a team. Rows carry
 * `codeFingerprint`, never the code.
 */
import {
  isOnAnotherTeam,
  isPlatformAdminUser,
  isValidAcademyRoleList,
  ONE_TEAM_PER_STUDENT_MESSAGE,
  PLATFORM_ADMIN_NOT_MEMBER_MESSAGE,
  STUDENT_ROLE,
  teamMembershipKey,
} from "@hoops-genesis/auth/membership-rules";
import { Prisma, type TransactionClient } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import {
  type ApiSession,
  authenticate,
  requireAcademyAccess,
  requirePlatformAdmin,
} from "../access";
import { secretFingerprint, writeAuditLog } from "../audit";
import {
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
  RuleViolationError,
  ValidationError,
} from "../errors";
import {
  type ApiContext,
  type ApiHandler,
  apiHandler,
  created,
  json,
} from "../handler";
import {
  encodeTimeIdCursor,
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "../pagination";
import { loadPeople, personRef } from "../people";
import { toTimestamp } from "../serialize";
import {
  idSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
  timestampSchema,
} from "../validation";
import { newId } from "./admin-academies";
import {
  formatInvitationCode,
  generateInvitationCode,
  invitationCodeLinks,
  normalizeInvitationCode,
} from "./invitation-code-format";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const DEFAULT_CODE_LIFETIME_MS = 7 * DAY_MS;
export const MAX_CODE_LIFETIME_MS = 90 * DAY_MS;
export const DEFAULT_ADMIN_CODE_LIFETIME_MS = 48 * HOUR_MS;
export const MAX_ADMIN_CODE_LIFETIME_MS = 72 * HOUR_MS;
export const MAX_CODE_USES = 1000;
const MAX_REASON_LENGTH = 500;
const MAX_CODE_INPUT_LENGTH = 64;
const CREATE_ATTEMPTS = 3;
const ADMIN_ROLE = "admin";

/**
 * Admin-role codes are the platform owner's business only. Their audit rows
 * are written without an academy id, like academy.create rows, so the
 * academy's own audit log (read by academy admins) never shows that such a
 * code exists. The owner's view finds them through the snapshot's academyId.
 */
const auditAcademyIdFor = (role: string, academyId: string): string | null =>
  role === ADMIN_ROLE ? null : academyId;

const CREATE_PERMISSIONS = { invitation: ["create"] } as const;
const REVOKE_PERMISSIONS = { invitation: ["cancel"] } as const;

// ---------------------------------------------------------------- schemas

const createSchema = z.object({
  role: z.enum(["admin", "coach", "student"]),
  teamId: idSchema.optional(),
  maxUses: z.number().int().min(1).max(MAX_CODE_USES).nullable().optional(),
  expiresAt: timestampSchema.optional(),
});

const listQuerySchema = z.object({ ...paginationQueryShape });
const codeParamsSchema = z.object({ academyId: idSchema, id: idSchema });
const revokeSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH).optional(),
});
const codeBodySchema = z.object({
  code: z.string().max(MAX_CODE_INPUT_LENGTH),
});

// ---------------------------------------------------------------- shared

/** Who manages codes here: an academy admin, or the platform owner. */
interface Manager {
  academyId: string;
  isOwner: boolean;
  session: ApiSession;
}

type ManagerResolver = (
  ctx: ApiContext,
  permissions: typeof CREATE_PERMISSIONS | typeof REVOKE_PERMISSIONS
) => Promise<Manager>;

const academyAdmin: ManagerResolver = async (ctx, permissions) => {
  const { session, academy } = await requireAcademyAccess(ctx, permissions);
  return { session, academyId: academy.id, isOwner: false };
};

const platformOwner: ManagerResolver = async (ctx) => {
  const session = await requirePlatformAdmin(ctx.request);
  const { academyId } = parseParams(
    z.object({ academyId: idSchema }),
    ctx.params
  );
  const academy = await db.organization.findUnique({
    where: { id: academyId },
    select: { id: true },
  });
  if (!academy) {
    throw new NotFoundError("Academy not found");
  }
  return { session, academyId: academy.id, isOwner: true };
};

/** Rows a manager may see: academy admins never see admin codes. */
const visibleTo = (manager: Manager): Prisma.InvitationCodeWhereInput =>
  manager.isOwner ? {} : { role: { not: ADMIN_ROLE } };

const codeInclude = {
  team: { select: { id: true, name: true, ageGroup: true } },
  redemptions: {
    orderBy: [{ redeemedAt: "asc" }, { id: "asc" }],
    select: { userId: true, redeemedAt: true },
  },
} as const satisfies Prisma.InvitationCodeInclude;

type CodeRow = Prisma.InvitationCodeGetPayload<{
  include: typeof codeInclude;
}>;

export type CodeStatus = "active" | "expired" | "used_up" | "revoked";

export const codeStatus = (
  row: {
    revokedAt: Date | null;
    maxUses: number | null;
    useCount: number;
    expiresAt: Date | null;
  },
  now: Date = new Date()
): CodeStatus => {
  if (row.revokedAt) {
    return "revoked";
  }
  if (row.maxUses !== null && row.useCount >= row.maxUses) {
    return "used_up";
  }
  if (row.expiresAt && row.expiresAt <= now) {
    return "expired";
  }
  return "active";
};

const peopleOn = (rows: readonly CodeRow[]) =>
  loadPeople(
    db,
    rows.flatMap((row) => [
      row.createdById,
      row.revokedById,
      ...row.redemptions.map((redemption) => redemption.userId),
    ])
  );

const serializeCode = (
  row: CodeRow,
  people: Awaited<ReturnType<typeof peopleOn>>,
  now: Date
) => ({
  id: row.id,
  code: formatInvitationCode(row.code),
  ...invitationCodeLinks(row.code),
  role: row.role,
  team: row.team,
  maxUses: row.maxUses,
  useCount: row.useCount,
  expiresAt: row.expiresAt ? toTimestamp(row.expiresAt) : null,
  status: codeStatus(row, now),
  createdAt: toTimestamp(row.createdAt),
  createdById: row.createdById,
  createdBy: personRef(people, row.createdById),
  revokedAt: row.revokedAt ? toTimestamp(row.revokedAt) : null,
  revokedById: row.revokedById,
  revokedBy: personRef(people, row.revokedById),
  revokeReason: row.revokeReason,
  redemptions: row.redemptions.map((redemption) => ({
    userId: redemption.userId,
    user: personRef(people, redemption.userId),
    redeemedAt: toTimestamp(redemption.redeemedAt),
  })),
});

/** A code row as audit_log stores it: a fingerprint, never the code. */
const toAuditCode = (row: {
  id: string;
  academyId: string;
  code: string;
  role: string;
  teamId: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  createdById: string;
  revokedAt: Date | null;
  revokedById: string | null;
  revokeReason: string | null;
}) => ({
  id: row.id,
  academyId: row.academyId,
  codeFingerprint: secretFingerprint(row.code),
  role: row.role,
  teamId: row.teamId,
  maxUses: row.maxUses,
  useCount: row.useCount,
  expiresAt: row.expiresAt,
  createdById: row.createdById,
  revokedAt: row.revokedAt,
  revokedById: row.revokedById,
  revokeReason: row.revokeReason,
});

const findManagedCode = async (
  client: TransactionClient | typeof db,
  manager: Manager,
  id: string
): Promise<CodeRow> => {
  const row = await client.invitationCode.findFirst({
    where: { AND: [{ id, academyId: manager.academyId }, visibleTo(manager)] },
    include: codeInclude,
  });
  if (!row) {
    throw new NotFoundError("Invitation code not found", {
      code: "invitation_code_not_found",
    });
  }
  return row;
};

// ---------------------------------------------------------------- create

interface Limits {
  expiresAt: Date;
  maxUses: number | null;
}

const resolveLimits = (
  input: z.output<typeof createSchema>,
  now: Date
): Limits => {
  const isAdminCode = input.role === ADMIN_ROLE;
  const maxLifetime = isAdminCode
    ? MAX_ADMIN_CODE_LIFETIME_MS
    : MAX_CODE_LIFETIME_MS;
  const expiresAt =
    input.expiresAt ??
    new Date(
      now.getTime() +
        (isAdminCode
          ? DEFAULT_ADMIN_CODE_LIFETIME_MS
          : DEFAULT_CODE_LIFETIME_MS)
    );
  if (expiresAt <= now) {
    throw new ValidationError("expiresAt must be in the future", {
      code: "expires_at_in_past",
    });
  }
  if (expiresAt.getTime() - now.getTime() > maxLifetime) {
    throw new ValidationError(
      `expiresAt can be at most ${maxLifetime / HOUR_MS} hours away`,
      {
        code: "lifetime_too_long",
        details: { maxHours: maxLifetime / HOUR_MS },
      }
    );
  }
  // Omitted means single use; null means unlimited (the expiry still applies).
  const maxUses = input.maxUses === undefined ? 1 : input.maxUses;
  if (isAdminCode && maxUses !== 1) {
    throw new ValidationError("Admin codes are single use", {
      code: "admin_code_single_use",
    });
  }
  return { expiresAt, maxUses };
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/** Who may create this code, and is its team in the academy? */
const assertMayCreate = async (
  manager: Manager,
  input: z.output<typeof createSchema>
): Promise<void> => {
  if (input.role === ADMIN_ROLE && !manager.isOwner) {
    throw new ForbiddenError("Only the platform owner creates admin codes", {
      code: "admin_codes_owner_only",
    });
  }
  if (input.role === ADMIN_ROLE && input.teamId) {
    throw new ValidationError("Admin codes have no team", {
      code: "admin_code_team",
    });
  }
  if (!input.teamId) {
    return;
  }
  const team = await db.team.findFirst({
    where: { id: input.teamId, organizationId: manager.academyId },
    select: { id: true },
  });
  if (!team) {
    throw new NotFoundError("Team not found", { code: "team_not_found" });
  }
};

/**
 * Inserts the code with its audit row. A generated code that collides with
 * an existing one (1 in 5e17 per code) is drawn again, up to 3 times.
 */
const insertCode = async (
  input: {
    manager: Manager;
    request: Request;
    role: string;
    teamId: string | null;
    limits: Limits;
    now: Date;
  },
  attempt = 1
): Promise<CodeRow> => {
  const { manager } = input;
  try {
    return await db.$transaction(async (tx) => {
      const inserted = await tx.invitationCode.create({
        data: {
          academyId: manager.academyId,
          code: generateInvitationCode(),
          role: input.role,
          teamId: input.teamId,
          maxUses: input.limits.maxUses,
          expiresAt: input.limits.expiresAt,
          createdById: manager.session.user.id,
          createdAt: input.now,
        },
        include: codeInclude,
      });
      await writeAuditLog(tx, {
        request: input.request,
        session: manager.session,
        academyId: auditAcademyIdFor(inserted.role, manager.academyId),
        action: "invitation_code.create",
        entityType: "invitation_code",
        entityId: inserted.id,
        after: toAuditCode(inserted),
      });
      return inserted;
    });
  } catch (error) {
    if (!isUniqueViolation(error) || attempt >= CREATE_ATTEMPTS) {
      throw error;
    }
    return insertCode(input, attempt + 1);
  }
};

const createCodeFor = (resolve: ManagerResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const manager = await resolve(ctx, CREATE_PERMISSIONS);
    const input = parseBody(createSchema, await readJsonBody(ctx.request));
    await assertMayCreate(manager, input);
    const now = new Date();
    const limits = resolveLimits(input, now);
    const row = await insertCode({
      manager,
      request: ctx.request,
      role: input.role,
      teamId: input.teamId ?? null,
      limits,
      now,
    });
    return created({ data: serializeCode(row, await peopleOn([row]), now) });
  });

// ---------------------------------------------------------------- read

const listCodesFor = (resolve: ManagerResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const manager = await resolve(ctx, CREATE_PERMISSIONS);
    const query = parseQuery(listQuerySchema, ctx.request);
    const rows = await db.invitationCode.findMany({
      where: {
        AND: [
          { academyId: manager.academyId },
          visibleTo(manager),
          timeIdKeysetWhere("createdAt", query.cursor, "desc"),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: codeInclude,
    });
    const people = await peopleOn(rows);
    const now = new Date();
    return json(
      toPage(
        rows,
        query.limit,
        (row) => encodeTimeIdCursor(row.createdAt, row.id),
        (row) => serializeCode(row, people, now)
      )
    );
  });

const getCodeFor = (resolve: ManagerResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const manager = await resolve(ctx, CREATE_PERMISSIONS);
    const { id } = parseParams(codeParamsSchema, ctx.params);
    const row = await findManagedCode(db, manager, id);
    return json({
      data: serializeCode(row, await peopleOn([row]), new Date()),
    });
  });

// ---------------------------------------------------------------- revoke

const revokeCodeFor = (resolve: ManagerResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const manager = await resolve(ctx, REVOKE_PERMISSIONS);
    const { id } = parseParams(codeParamsSchema, ctx.params);
    const input = parseBody(revokeSchema, await readJsonBody(ctx.request));
    const row = await db.$transaction(async (tx) => {
      const before = await findManagedCode(tx, manager, id);
      if (before.revokedAt) {
        throw new ConflictError("Already revoked", { code: "already_revoked" });
      }
      // Only if still unrevoked: two revokes at once, one wins.
      const { count } = await tx.invitationCode.updateMany({
        where: { id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedById: manager.session.user.id,
          revokeReason: input.reason ?? null,
        },
      });
      if (count === 0) {
        throw new ConflictError("Already revoked", { code: "already_revoked" });
      }
      const after = await findManagedCode(tx, manager, id);
      await writeAuditLog(tx, {
        request: ctx.request,
        session: manager.session,
        academyId: auditAcademyIdFor(after.role, manager.academyId),
        action: "invitation_code.revoke",
        entityType: "invitation_code",
        entityId: id,
        before: toAuditCode(before),
        after: toAuditCode(after),
        reason: input.reason ?? null,
      });
      return after;
    });
    return json({
      data: serializeCode(row, await peopleOn([row]), new Date()),
    });
  });

export const createInvitationCode = createCodeFor(academyAdmin);
export const listInvitationCodes = listCodesFor(academyAdmin);
export const getInvitationCode = getCodeFor(academyAdmin);
export const revokeInvitationCode = revokeCodeFor(academyAdmin);

export const adminCreateInvitationCode = createCodeFor(platformOwner);
export const adminListInvitationCodes = listCodesFor(platformOwner);
export const adminGetInvitationCode = getCodeFor(platformOwner);
export const adminRevokeInvitationCode = revokeCodeFor(platformOwner);

// ---------------------------------------------------------------- redeem

const invalidCode = (): NotFoundError =>
  new NotFoundError("This code is not valid", { code: "invalid_code" });

/** 410 for a code that exists but cannot be used now. */
const unusable = (status: Exclude<CodeStatus, "active">): GoneError => {
  switch (status) {
    case "revoked":
      return new GoneError("This code was withdrawn; ask for a new one", {
        code: "code_revoked",
      });
    case "used_up":
      return new GoneError("This code has been used up; ask for a new one", {
        code: "code_used_up",
      });
    default:
      return new GoneError("This code has expired; ask for a new one", {
        code: "code_expired",
      });
  }
};

const readCode = async (request: Request): Promise<string> => {
  const { code } = parseBody(codeBodySchema, await readJsonBody(request));
  const normalized = normalizeInvitationCode(code);
  if (!normalized) {
    throw invalidCode();
  }
  return normalized;
};

const codeWithAcademy = {
  academy: { select: { id: true, name: true, slug: true } },
  team: { select: { id: true, name: true, ageGroup: true } },
} as const satisfies Prisma.InvitationCodeInclude;

/** The code, if it exists and is active; else 404 or 410. */
const findActiveCode = async (
  client: TransactionClient | typeof db,
  code: string,
  now: Date
) => {
  const row = await client.invitationCode.findUnique({
    where: { code },
    include: codeWithAcademy,
  });
  if (!row) {
    throw invalidCode();
  }
  const status = codeStatus(row, now);
  if (status !== "active") {
    throw unusable(status);
  }
  return row;
};

export const previewInvitationCode = apiHandler(async ({ request }) => {
  const session = await authenticate(request);
  const code = await readCode(request);
  const row = await findActiveCode(db, code, new Date());
  const member = await db.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: row.academyId,
        userId: session.user.id,
      },
    },
    select: { id: true },
  });
  return json({
    data: {
      academy: row.academy,
      role: row.role,
      team: row.team,
      expiresAt: row.expiresAt ? toTimestamp(row.expiresAt) : null,
      alreadyMember: member !== null,
    },
  });
});

/**
 * Takes one use, only while the code is active. Concurrent redemptions
 * serialize on the row lock, and Postgres re-checks the WHERE clause against
 * the committed row, so use_count can never pass max_uses (a CHECK backs it).
 */
const consumeUse = async (
  tx: TransactionClient,
  codeId: string,
  now: Date
): Promise<boolean> => {
  const updated = await tx.$executeRaw`
    UPDATE invitation_code
    SET use_count = use_count + 1
    WHERE id = ${codeId}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ${now})
      AND (max_uses IS NULL OR use_count < max_uses)
  `;
  return updated === 1;
};

const alreadyMember = (): ConflictError =>
  new ConflictError("You are already a member of this academy", {
    code: "already_member",
  });

const alreadyRedeemed = (): ConflictError =>
  new ConflictError("You have already used this code", {
    code: "already_redeemed",
  });

/**
 * Two unique indexes stop a double join that slips past the checks: the
 * redemption (code, user) and the member (academy, user).
 */
const asJoinConflict = (error: unknown): unknown => {
  if (!isUniqueViolation(error)) {
    return error;
  }
  const target = JSON.stringify(
    (error as Prisma.PrismaClientKnownRequestError).meta ?? {}
  );
  return target.includes("redemption") ? alreadyRedeemed() : alreadyMember();
};

export const redeemInvitationCode = apiHandler(async ({ request }) => {
  const session = await authenticate(request);
  const code = await readCode(request);
  const userId = session.user.id;
  // Same rule as Better Auth's invitation hooks: the platform owner reads
  // academies through /api/v1/admin/*, never as a member.
  if (await isPlatformAdminUser(db, { id: userId })) {
    throw new ForbiddenError(PLATFORM_ADMIN_NOT_MEMBER_MESSAGE, {
      code: "platform_admin_cannot_be_member",
    });
  }
  const result = await db
    .$transaction(async (tx) => {
      const now = new Date();
      const row = await findActiveCode(tx, code, now);
      if (!isValidAcademyRoleList(row.role)) {
        throw new RuleViolationError("This code's role is not valid", {
          code: "invalid_role",
        });
      }
      const [existingMember, existingRedemption] = await Promise.all([
        tx.member.findUnique({
          where: {
            organizationId_userId: { organizationId: row.academyId, userId },
          },
          select: { id: true },
        }),
        tx.invitationCodeRedemption.findUnique({
          where: { codeId_userId: { codeId: row.id, userId } },
          select: { id: true },
        }),
      ]);
      if (existingMember) {
        throw alreadyMember();
      }
      if (existingRedemption) {
        throw alreadyRedeemed();
      }
      if (
        row.teamId &&
        row.role.split(",").includes(STUDENT_ROLE) &&
        (await isOnAnotherTeam(tx, userId, row.academyId, row.teamId))
      ) {
        throw new RuleViolationError(ONE_TEAM_PER_STUDENT_MESSAGE, {
          code: "one_team_per_student",
        });
      }
      if (!(await consumeUse(tx, row.id, now))) {
        // Used up (or revoked or expired) by someone else meanwhile.
        const current = await tx.invitationCode.findUniqueOrThrow({
          where: { id: row.id },
        });
        const status = codeStatus(current, now);
        throw unusable(status === "active" ? "used_up" : status);
      }
      await tx.invitationCodeRedemption.create({
        data: { codeId: row.id, userId, redeemedAt: now },
      });
      const member = await tx.member.create({
        data: {
          id: await newId("member"),
          organizationId: row.academyId,
          userId,
          role: row.role,
          createdAt: now,
        },
        select: { id: true, userId: true, role: true },
      });
      await writeAuditLog(tx, {
        request,
        session,
        academyId: row.academyId,
        action: "member.join_by_code",
        entityType: "member",
        entityId: member.id,
        after: {
          member,
          codeId: row.id,
          codeFingerprint: secretFingerprint(row.code),
          teamId: row.teamId,
        },
      });
      if (row.teamId) {
        // As Better Auth's addTeamMember writes it, membershipKey included.
        const teamMember = await tx.teamMember.create({
          data: {
            id: await newId("teamMember"),
            teamId: row.teamId,
            userId,
            membershipKey: teamMembershipKey(row.teamId, userId),
            createdAt: now,
          },
          select: { id: true, teamId: true, userId: true, createdAt: true },
        });
        await tx.team.update({
          where: { id: row.teamId },
          data: { memberCount: { increment: 1 } },
        });
        await writeAuditLog(tx, {
          request,
          session,
          academyId: row.academyId,
          action: "team.member_add",
          entityType: "team",
          entityId: row.teamId,
          after: teamMember,
        });
      }
      return { row, member };
    })
    .catch((error: unknown) => {
      throw asJoinConflict(error);
    });
  return created({
    data: {
      academy: result.row.academy,
      member: {
        id: result.member.id,
        userId: result.member.userId,
        roles: result.member.role.split(","),
      },
      team: result.row.team,
    },
  });
});
