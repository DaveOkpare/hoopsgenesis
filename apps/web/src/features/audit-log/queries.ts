/*
 * Query layer for the activity log. Components import from here, never from api.ts.
 */
import { queryOptions } from "@tanstack/react-query";

import {
  type AuditLogParams,
  listAuditActors,
  listAuditLog,
} from "@/features/audit-log/api";
import type { Id } from "@/features/types";
import { appNow } from "@/lib/preview";

export type {
  AuditDateFilter,
  AuditLogItem,
  AuditLogPage,
  AuditLogParams,
  AuditTypeFilter,
} from "@/features/audit-log/api";

export const auditLogKeys = {
  all: (academyId: Id) => ["academies", academyId, "audit-log"] as const,
  list: (academyId: Id, params: AuditLogParams) =>
    [...auditLogKeys.all(academyId), "list", params] as const,
  actors: (academyId: Id) =>
    [...auditLogKeys.all(academyId), "actors"] as const,
};

export function auditLogQueryOptions(academyId: Id, params: AuditLogParams) {
  return queryOptions({
    queryKey: auditLogKeys.list(academyId, params),
    queryFn: () => listAuditLog(academyId, params),
  });
}

export function auditActorsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: auditLogKeys.actors(academyId),
    queryFn: () => listAuditActors(academyId),
  });
}

/** The current time for relative labels ("Today, 09:14"); fixture time in preview. */
export function currentTime(): Date {
  return appNow();
}
