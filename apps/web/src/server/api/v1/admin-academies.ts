/**
 * The platform owner's academy management (`user.role = 'admin'`). The owner
 * is never an academy member: these routes write Better Auth's organization,
 * member and invitation rows directly, in one transaction with their
 * audit_log row.
 *
 * GET    /api/v1/admin/academies                                   list, newest first, paginated
 * POST   /api/v1/admin/academies                                   create, for a named first admin
 * DELETE /api/v1/admin/academies/:academyId                        delete; 409 once it has history
 * POST   /api/v1/admin/academies/:academyId/admins                 appoint an academy admin
 * DELETE /api/v1/admin/academies/:academyId/admins/:userId         remove an academy admin
 * DELETE /api/v1/admin/academies/:academyId/admin-invitations/:id  cancel a pending admin invitation
 *
 * People are named as `{ userId }` or `{ email }`. Someone with an account
 * becomes a member straight away (or, if already a coach or student, gains
 * `admin`); an email with no account gets a pending invitation with role
 * `admin`, which they accept after signing up with Better Auth's
 * `organization.listUserInvitations` + `organization.acceptInvitation`.
 * (`organization.getInvitation` refuses these, because it requires the
 * inviter to be a member.)
 *
 * Why not Better Auth's endpoints: `organization.create` always makes the
 * caller (or `body.userId`) a member with `creatorRole`, and
 * `organization.inviteMember` / `removeMember` / `updateMemberRole` all
 * require the caller to be a member. Better Auth's own create and delete are
 * switched off (packages/auth/src/index.ts); the academy rules they ran
 * (qrNonce, location) are shared from `@hoops-genesis/auth/academy-fields`.
 *
 * Audit: academy.create and academy.delete rows have `academy_id` null and
 * `entity_type = 'academy'`, `entity_id = <academy id>`: audit_log's foreign
 * key refuses to delete an academy that any audit row points at, so a row
 * pointing at it would make every academy undeletable from birth. The admin
 * audit log's `?academyId=` filter includes these rows. Admin appointments,
 * removals and invitations carry `academy_id`.
 */
import {
  createQrNonce,
  DEFAULT_ATTENDANCE_RADIUS_M,
  MAX_LATITUDE,
  MAX_LONGITUDE,
} from "@hoops-genesis/auth/academy-fields";
import { Prisma, type TransactionClient } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { auth, db } from "../../../services";
import { type ApiSession, requirePlatformAdmin } from "../access";
import { secretFingerprint, writeAuditLog } from "../audit";
import { ConflictError, NotFoundError, RuleViolationError } from "../errors";
import {
  type ApiContext,
  apiHandler,
  created,
  json,
  noContent,
} from "../handler";
import {
  encodeTimeIdCursor,
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "../pagination";
import { parseRoles } from "../roles";
import { toTimestamp } from "../serialize";
import { isValidTimeZone } from "../time";
import {
  currencySchema,
  idSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
} from "../validation";

const ACADEMY_ADMIN_ROLE = "admin";
const PLATFORM_ADMIN_ROLE = "admin";
const PENDING = "pending";
/** Better Auth's default invitationExpiresIn (48 hours). */
const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 120;
const MAX_SLUG_LENGTH = 64;
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCATION_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------- schemas

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH)
  .pipe(z.email());

/** A person, by account id or by email: exactly one of the two. */
const personSchema = z
  .strictObject({
    userId: idSchema.optional(),
    email: emailSchema.optional(),
  })
  .refine(
    (person) => (person.userId === undefined) !== (person.email === undefined),
    {
      message: "Send exactly one of userId or email",
    }
  );
type Person = z.output<typeof personSchema>;

const createAcademySchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  slug: z
    .string()
    .trim()
    .max(MAX_SLUG_LENGTH)
    .regex(SLUG_PATTERN, "Lowercase letters, digits and single hyphens"),
  timezone: z
    .string()
    .refine(isValidTimeZone, "Expected an IANA time zone such as Africa/Lagos"),
  defaultCurrency: currencySchema,
  latitude: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
  longitude: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
  attendanceRadiusM: z.number().int().positive().optional(),
  location: z.string().trim().min(1).max(MAX_LOCATION_LENGTH).optional(),
  logo: z.url().max(MAX_URL_LENGTH).optional(),
  firstAdmin: personSchema,
});

const listQuerySchema = z.object({ ...paginationQueryShape });
const academyParamsSchema = z.object({ academyId: idSchema });
const adminParamsSchema = z.object({ academyId: idSchema, userId: idSchema });
const invitationParamsSchema = z.object({ academyId: idSchema, id: idSchema });

// ---------------------------------------------------------------- shared

/** Better Auth's id generator, so these rows look like the ones it writes. */
export const newId = async (
  model: "organization" | "member" | "invitation" | "teamMember"
): Promise<string> => {
  const context = await auth.$context;
  const id = context.generateId({ model });
  return typeof id === "string" ? id : crypto.randomUUID();
};

const academySelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  location: true,
  timezone: true,
  defaultCurrency: true,
  latitude: true,
  longitude: true,
  attendanceRadiusM: true,
  createdAt: true,
} as const satisfies Prisma.OrganizationSelect;

type AcademyRow = Prisma.OrganizationGetPayload<{
  select: typeof academySelect;
}>;

const serializeAcademy = (row: AcademyRow) => ({
  ...row,
  attendanceRadiusM: row.attendanceRadiusM ?? DEFAULT_ATTENDANCE_RADIUS_M,
  createdAt: toTimestamp(row.createdAt),
});

const serializeInvitation = (row: {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
}) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  expiresAt: toTimestamp(row.expiresAt),
});

/**
 * An invitation as audit_log stores it. The id is the secret in an
 * invitation link, so rows hold a fingerprint of it, never the id; the
 * row's entity_id is `fp:<fingerprint>`.
 */
const toAuditInvitation = (row: {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
}) => ({
  idFingerprint: secretFingerprint(row.id),
  email: row.email,
  role: row.role,
  status: row.status,
  expiresAt: toTimestamp(row.expiresAt),
});

const invitationEntityId = (id: string): string =>
  `fp:${secretFingerprint(id)}`;

/** An appointment as audit_log stores it: no invitation id. */
const toAuditAppointment = (appointment: Appointment) =>
  appointment.status === "member"
    ? appointment
    : {
        status: appointment.status,
        invitation: {
          idFingerprint: secretFingerprint(appointment.invitation.id),
          email: appointment.invitation.email,
          role: appointment.invitation.role,
          status: appointment.invitation.status,
          expiresAt: appointment.invitation.expiresAt,
        },
      };

const hasAdminRole = (role: string | null | undefined): boolean =>
  parseRoles(role).includes(ACADEMY_ADMIN_ROLE);

const findAcademyOr404 = async (
  client: TransactionClient | typeof db,
  academyId: string
): Promise<AcademyRow> => {
  const academy = await client.organization.findUnique({
    where: { id: academyId },
    select: academySelect,
  });
  if (!academy) {
    throw new NotFoundError("Academy not found");
  }
  return academy;
};

interface FoundUser {
  email: string;
  id: string;
  name: string;
  role: string | null;
}

/**
 * The account for `person`: null for an email nobody has signed up with; a
 * userId that does not exist is a 404. Platform admins are refused: they act
 * through these routes, never as academy members.
 */
const findPerson = async (
  tx: TransactionClient,
  person: Person
): Promise<FoundUser | null> => {
  const select = { id: true, email: true, name: true, role: true } as const;
  const user = person.userId
    ? await tx.user.findUnique({ where: { id: person.userId }, select })
    : await tx.user.findUnique({
        where: { email: person.email ?? "" },
        select,
      });
  if (!user && person.userId) {
    throw new NotFoundError("User not found", { code: "user_not_found" });
  }
  if (user && parseRoles(user.role).includes(PLATFORM_ADMIN_ROLE)) {
    throw new RuleViolationError(
      "Platform admins can't be academy members; appoint someone else",
      { code: "platform_admin_cannot_be_member" }
    );
  }
  return user;
};

type Appointment =
  | {
      status: "member";
      member: { id: string; userId: string; role: string };
    }
  | {
      status: "invited";
      invitation: ReturnType<typeof serializeInvitation>;
    };

/**
 * Makes `person` an admin of the academy: adds or promotes the member row,
 * or invites the email. Writes the audit row unless `audit` is false (the
 * create route records the appointment in its own academy.create row).
 */
const appointAdmin = async (
  tx: TransactionClient,
  input: {
    academyId: string;
    person: Person;
    session: ApiSession;
    request: Request;
    audit: boolean;
  }
): Promise<Appointment> => {
  const { academyId, session, request } = input;
  const user = await findPerson(tx, input.person);
  if (user) {
    const existing = await tx.member.findUnique({
      where: {
        organizationId_userId: { organizationId: academyId, userId: user.id },
      },
      select: { id: true, userId: true, role: true },
    });
    if (existing && hasAdminRole(existing.role)) {
      throw new ConflictError("Already an admin of this academy", {
        code: "already_admin",
      });
    }
    const member = existing
      ? await tx.member.update({
          where: { id: existing.id },
          data: {
            role: [...parseRoles(existing.role), ACADEMY_ADMIN_ROLE].join(","),
          },
          select: { id: true, userId: true, role: true },
        })
      : await tx.member.create({
          data: {
            id: await newId("member"),
            organizationId: academyId,
            userId: user.id,
            role: ACADEMY_ADMIN_ROLE,
            createdAt: new Date(),
          },
          select: { id: true, userId: true, role: true },
        });
    if (input.audit) {
      await writeAuditLog(tx, {
        request,
        session,
        academyId,
        action: "academy.admin_appoint",
        entityType: "member",
        entityId: member.id,
        before: existing,
        after: member,
      });
    }
    return { status: "member", member };
  }

  // No account yet: an invitation, accepted through Better Auth after sign-up.
  const email = input.person.email ?? "";
  const pending = await tx.invitation.findMany({
    where: { organizationId: academyId, email, status: PENDING },
    select: { id: true, role: true },
  });
  if (pending.some((row) => hasAdminRole(row.role))) {
    throw new ConflictError(
      "This email already has a pending admin invitation",
      {
        code: "already_invited",
      }
    );
  }
  // Accepting two invitations would fail on the second; the admin one wins.
  if (pending.length > 0) {
    await tx.invitation.updateMany({
      where: { id: { in: pending.map((row) => row.id) } },
      data: { status: "canceled" },
    });
  }
  const now = new Date();
  const invitation = await tx.invitation.create({
    data: {
      id: await newId("invitation"),
      organizationId: academyId,
      email,
      role: ACADEMY_ADMIN_ROLE,
      status: PENDING,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      inviterId: session.user.id,
    },
  });
  if (input.audit) {
    await writeAuditLog(tx, {
      request,
      session,
      academyId,
      action: "academy.admin_invite",
      entityType: "invitation",
      entityId: invitationEntityId(invitation.id),
      after: toAuditInvitation(invitation),
    });
  }
  return { status: "invited", invitation: serializeInvitation(invitation) };
};

// ---------------------------------------------------------------- list

export const listAcademies = apiHandler(async ({ request }) => {
  await requirePlatformAdmin(request);
  const { limit, cursor } = parseQuery(listQuerySchema, request);
  const now = new Date();
  const rows = await db.organization.findMany({
    where: timeIdKeysetWhere("createdAt", cursor, "desc"),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      ...academySelect,
      members: {
        where: { role: { contains: ACADEMY_ADMIN_ROLE } },
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      invitations: {
        where: {
          status: PENDING,
          role: { contains: ACADEMY_ADMIN_ROLE },
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
        },
      },
      _count: { select: { members: true, teams: true } },
    },
  });
  return json(
    toPage(
      rows,
      limit,
      (row) => encodeTimeIdCursor(row.createdAt, row.id),
      ({ members, invitations, _count, ...academy }) => ({
        ...serializeAcademy(academy),
        memberCount: _count.members,
        teamCount: _count.teams,
        admins: members
          .filter((member) => hasAdminRole(member.role))
          .map(({ user }) => ({
            userId: user.id,
            name: user.name,
            email: user.email,
          })),
        pendingAdminInvitations: invitations
          .filter((invitation) => hasAdminRole(invitation.role))
          .map(serializeInvitation),
      })
    )
  );
});

// ---------------------------------------------------------------- create

export const createAcademy = apiHandler(async ({ request }) => {
  const session = await requirePlatformAdmin(request);
  const { firstAdmin, ...fields } = parseBody(
    createAcademySchema,
    await readJsonBody(request)
  );
  const taken = await db.organization.findUnique({
    where: { slug: fields.slug },
    select: { id: true },
  });
  if (taken) {
    throw new ConflictError("That slug is taken", { code: "slug_taken" });
  }
  const id = await newId("organization");
  const result = await db.$transaction(async (tx) => {
    const academy = await tx.organization.create({
      data: {
        id,
        ...fields,
        attendanceRadiusM:
          fields.attendanceRadiusM ?? DEFAULT_ATTENDANCE_RADIUS_M,
        qrNonce: createQrNonce(),
        createdAt: new Date(),
      },
      select: academySelect,
    });
    const appointment = await appointAdmin(tx, {
      academyId: id,
      person: firstAdmin,
      session,
      request,
      audit: false,
    });
    await writeAuditLog(tx, {
      request,
      session,
      // Null on purpose, see the header comment.
      academyId: null,
      action: "academy.create",
      entityType: "academy",
      entityId: id,
      after: { academy, firstAdmin: toAuditAppointment(appointment) },
    });
    return { academy, appointment };
  });
  return created({
    data: {
      ...serializeAcademy(result.academy),
      firstAdmin: result.appointment,
    },
  });
});

// ---------------------------------------------------------------- delete

const isForeignKeyViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2003";

export const deleteAcademy = apiHandler(async ({ request, params }) => {
  const session = await requirePlatformAdmin(request);
  const { academyId } = parseParams(academyParamsSchema, params);
  try {
    await db.$transaction(async (tx) => {
      const academy = await findAcademyOr404(tx, academyId);
      const [fees, records, auditRows] = await Promise.all([
        tx.fee.count({ where: { academyId } }),
        tx.studentRecord.count({ where: { academyId } }),
        tx.auditLog.count({ where: { academyId } }),
      ]);
      if (fees + records + auditRows > 0) {
        throw new ConflictError(
          "This academy has fees, student records or audit history, which are kept for good and block deleting it. Remove its members instead.",
          { code: "academy_has_history", details: { fees, records, auditRows } }
        );
      }
      // Cascades to members, invitations, teams, team members, events and
      // attendance (see the onDelete rules in the Prisma schema).
      await tx.organization.delete({ where: { id: academyId } });
      await writeAuditLog(tx, {
        request,
        session,
        academyId: null,
        action: "academy.delete",
        entityType: "academy",
        entityId: academyId,
        before: academy,
      });
    });
  } catch (error) {
    // A fee, record or audit row written while this ran.
    if (isForeignKeyViolation(error)) {
      throw new ConflictError(
        "This academy gained history while it was being deleted; it was kept",
        { code: "academy_has_history", cause: error }
      );
    }
    throw error;
  }
  return noContent();
});

// ---------------------------------------------------------------- admins

export const appointAcademyAdmin = apiHandler(async (ctx: ApiContext) => {
  const session = await requirePlatformAdmin(ctx.request);
  const { academyId } = parseParams(academyParamsSchema, ctx.params);
  const person = parseBody(personSchema, await readJsonBody(ctx.request));
  const appointment = await db.$transaction(async (tx) => {
    await findAcademyOr404(tx, academyId);
    return appointAdmin(tx, {
      academyId,
      person,
      session,
      request: ctx.request,
      audit: true,
    });
  });
  return created({ data: appointment });
});

export const removeAcademyAdmin = apiHandler(async ({ request, params }) => {
  const session = await requirePlatformAdmin(request);
  const { academyId, userId } = parseParams(adminParamsSchema, params);
  await db.$transaction(async (tx) => {
    await findAcademyOr404(tx, academyId);
    const before = await tx.member.findUnique({
      where: { organizationId_userId: { organizationId: academyId, userId } },
      select: { id: true, userId: true, role: true },
    });
    if (!(before && hasAdminRole(before.role))) {
      throw new NotFoundError("Not an admin of this academy", {
        code: "admin_not_found",
      });
    }
    const remaining = parseRoles(before.role).filter(
      (role) => role !== ACADEMY_ADMIN_ROLE
    );
    let after: typeof before | null = null;
    if (remaining.length > 0) {
      // Still a coach or student: only the admin role goes.
      after = await tx.member.update({
        where: { id: before.id },
        data: { role: remaining.join(",") },
        select: { id: true, userId: true, role: true },
      });
    } else {
      // Leaves the academy, and its teams, as Better Auth's removeMember does.
      const teamRows = await tx.teamMember.findMany({
        where: { userId, team: { organizationId: academyId } },
        select: { teamId: true },
      });
      await tx.teamMember.deleteMany({
        where: { userId, teamId: { in: teamRows.map((row) => row.teamId) } },
      });
      // One row per team for this user, so each team loses one seat.
      await tx.team.updateMany({
        where: {
          id: { in: teamRows.map((row) => row.teamId) },
          memberCount: { gte: 1 },
        },
        data: { memberCount: { decrement: 1 } },
      });
      await tx.member.delete({ where: { id: before.id } });
    }
    await writeAuditLog(tx, {
      request,
      session,
      academyId,
      action: "academy.admin_remove",
      entityType: "member",
      entityId: before.id,
      before,
      after,
    });
  });
  return noContent();
});

export const cancelAdminInvitation = apiHandler(async ({ request, params }) => {
  const session = await requirePlatformAdmin(request);
  const { academyId, id } = parseParams(invitationParamsSchema, params);
  await db.$transaction(async (tx) => {
    const before = await tx.invitation.findFirst({
      where: { id, organizationId: academyId, status: PENDING },
    });
    if (!(before && hasAdminRole(before.role))) {
      throw new NotFoundError("No pending admin invitation", {
        code: "invitation_not_found",
      });
    }
    const after = await tx.invitation.update({
      where: { id },
      data: { status: "canceled" },
    });
    await writeAuditLog(tx, {
      request,
      session,
      academyId,
      action: "academy.admin_invite_cancel",
      entityType: "invitation",
      entityId: invitationEntityId(id),
      before: toAuditInvitation(before),
      after: toAuditInvitation(after),
    });
  });
  return noContent();
});
