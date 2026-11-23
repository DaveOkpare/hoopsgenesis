/**
 * Audit log, read-only.
 *
 * GET /api/v1/academies/:academyId/audit-log         academy admin (audit:read)
 * GET /api/v1/admin/audit-log                        platform admin, all academies
 * GET /api/v1/admin/academies/:academyId/audit-log   platform admin, one academy
 *     (./admin-academy-views.ts; the same rows as the admin route's ?academyId=)
 *
 * Each row names its people: `actor: { id, name }` next to `actorId`, and
 * `impersonatedById` + `impersonatedBy: { id, name }` when the action was
 * taken while the platform owner was impersonating the actor (null otherwise).
 *
 * Filters: entityType, entityId, actorId, action, from, to (YYYY-MM-DD,
 * inclusive, in the academy's time zone; UTC on the admin route unless
 * academyId is given). Newest first, cursor-paginated.
 *
 * On the admin route `academyId` also matches the platform owner's
 * academy.create / academy.delete rows, which have `academy_id` null (see
 * ./admin-academies.ts) and `entity_type = 'academy'`, `entity_id = academyId`.
 */
import type { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import {
  type AcademyAccessResolver,
  academyAccessWith,
  requirePlatformAdmin,
} from "../access";
import { ValidationError } from "../errors";
import { type ApiHandler, apiHandler, json } from "../handler";
import {
  encodeTimeIdCursor,
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "../pagination";
import { loadPeople, type People, personRef } from "../people";
import { toTimestamp } from "../serialize";
import { localDateRangeToUtc } from "../time";
import { idSchema, isoDateSchema, parseQuery } from "../validation";

const MAX_NAME_LENGTH = 64;
const UTC = "UTC";

const filterShape = {
  ...paginationQueryShape,
  entityType: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  entityId: idSchema.optional(),
  actorId: idSchema.optional(),
  action: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
};

const academyQuerySchema = z.object(filterShape);
const adminQuerySchema = z.object({
  ...filterShape,
  academyId: idSchema.optional(),
});

type Filters = z.output<typeof academyQuerySchema>;

type AuditRow = Prisma.AuditLogModel;

const serializeAuditLog = (row: AuditRow, people: People) => ({
  id: row.id,
  academyId: row.academyId,
  actorId: row.actorId,
  actor: personRef(people, row.actorId),
  impersonatedById: row.impersonatedById,
  impersonatedBy: personRef(people, row.impersonatedById),
  action: row.action,
  entityType: row.entityType,
  entityId: row.entityId,
  before: row.before,
  after: row.after,
  reason: row.reason,
  ip: row.ip,
  userAgent: row.userAgent,
  createdAt: toTimestamp(row.createdAt),
});

const buildWhere = (
  filters: Filters,
  timeZone: string
): Prisma.AuditLogWhereInput => {
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new ValidationError("from must be on or before to", {
      code: "invalid_range",
    });
  }
  const createdAt = localDateRangeToUtc(filters, timeZone);
  return {
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.from || filters.to ? { createdAt } : {}),
  };
};

const listPage = async (
  where: Prisma.AuditLogWhereInput,
  { limit, cursor }: Pick<Filters, "limit" | "cursor">
): Promise<Response> => {
  const rows = await db.auditLog.findMany({
    where: { AND: [where, timeIdKeysetWhere("createdAt", cursor, "desc")] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const people = await loadPeople(
    db,
    rows.flatMap((row) => [row.actorId, row.impersonatedById])
  );
  return json(
    toPage(
      rows,
      limit,
      (row) => encodeTimeIdCursor(row.createdAt, row.id),
      (row) => serializeAuditLog(row, people)
    )
  );
};

/**
 * Platform-level rows of one academy (academy_id is null, so academy admins
 * never see them): academy.create / academy.delete, and the create / revoke
 * rows of admin-role invitation codes, which only the platform owner may know
 * about.
 */
const platformRowsOf = (academyId: string): Prisma.AuditLogWhereInput => ({
  academyId: null,
  OR: [
    { entityType: "academy", entityId: academyId },
    {
      entityType: "invitation_code",
      after: { path: ["academyId"], equals: academyId },
    },
  ],
});

/**
 * One academy's log for `resolve`'s caller. `includePlatformRows` (the
 * platform owner's view) adds that academy's academy.create / academy.delete
 * rows, as the admin route's `?academyId=` does.
 */
export const listAcademyAuditLogFor = (
  resolve: AcademyAccessResolver,
  options: { includePlatformRows: boolean }
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { academy } = await resolve(ctx);
    const query = parseQuery(academyQuerySchema, ctx.request);
    // Scope: the whole academy, and only this academy.
    const academyFilter: Prisma.AuditLogWhereInput = options.includePlatformRows
      ? { OR: [{ academyId: academy.id }, platformRowsOf(academy.id)] }
      : { academyId: academy.id };
    return listPage(
      { AND: [buildWhere(query, academy.timezone), academyFilter] },
      query
    );
  });

export const listAcademyAuditLog = listAcademyAuditLogFor(
  academyAccessWith({ audit: ["read"] }),
  { includePlatformRows: false }
);

export const listAdminAuditLog = apiHandler(async ({ request }) => {
  await requirePlatformAdmin(request);
  const query = parseQuery(adminQuerySchema, request);
  let timeZone = UTC;
  if (query.academyId) {
    const academy = await db.organization.findUnique({
      where: { id: query.academyId },
      select: { timezone: true },
    });
    timeZone = academy?.timezone ?? UTC;
  }
  const academyFilter: Prisma.AuditLogWhereInput = query.academyId
    ? { OR: [{ academyId: query.academyId }, platformRowsOf(query.academyId)] }
    : {};
  return listPage({ AND: [buildWhere(query, timeZone), academyFilter] }, query);
});
