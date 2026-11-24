/* Query layer for the owner's platform audit log. Components import from here. */
import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { platformAcademiesQueryOptions } from "@/features/owner-academies/queries";
import {
  getPersonName,
  listOwnerAuditPage,
  listRecentActors,
  type OwnerAuditAcademy,
  type OwnerAuditFilters,
  type OwnerAuditPage,
} from "@/features/owner-audit/api";
import type { Id } from "@/features/types";

export type {
  OwnerAuditDate,
  OwnerAuditFilters,
  OwnerAuditItem,
  OwnerAuditPage,
  OwnerAuditType,
} from "@/features/owner-audit/api";

export const ownerAuditKeys = {
  all: ["platform", "audit-log"] as const,
  page: (filters: OwnerAuditFilters, perPage: number, page: number) =>
    [...ownerAuditKeys.all, "page", filters, perPage, page] as const,
  actors: () => [...ownerAuditKeys.all, "actors"] as const,
  person: (userId: Id) => [...ownerAuditKeys.all, "person", userId] as const,
};

async function academyIndex(
  queryClient: QueryClient
): Promise<Map<Id, OwnerAuditAcademy>> {
  const rows = await queryClient.ensureQueryData(
    platformAcademiesQueryOptions()
  );
  return new Map(
    rows.map((row) => [
      row.academy.id,
      {
        id: row.academy.id,
        shortName: row.academy.shortName,
        timezone: row.academy.timezone,
      },
    ])
  );
}

const EMPTY_PAGE: OwnerAuditPage = { items: [], nextCursor: null };

/**
 * Page `page` (from 1) of the log. The server pages by cursor, so page n starts at
 * page n−1's `nextCursor`; earlier pages come from the cache (fetched in turn if not).
 */
export function ownerAuditPageQueryOptions(
  queryClient: QueryClient,
  filters: OwnerAuditFilters,
  perPage: number,
  page: number
): ReturnType<typeof pageOptions> {
  return pageOptions(queryClient, filters, perPage, page);
}

function pageOptions(
  queryClient: QueryClient,
  filters: OwnerAuditFilters,
  perPage: number,
  page: number
) {
  return queryOptions({
    queryKey: ownerAuditKeys.page(filters, perPage, page),
    queryFn: async (): Promise<OwnerAuditPage> => {
      let cursor: string | null = null;
      if (page > 1) {
        const previous = await queryClient.fetchQuery(
          pageOptions(queryClient, filters, perPage, page - 1)
        );
        if (!previous.nextCursor) {
          return EMPTY_PAGE;
        }
        cursor = previous.nextCursor;
      }
      return listOwnerAuditPage({
        filters,
        limit: perPage,
        cursor,
        academies: await academyIndex(queryClient),
      });
    },
  });
}

/** People who acted recently, for the "Person" filter. */
export function recentActorsQueryOptions() {
  return queryOptions({
    queryKey: ownerAuditKeys.actors(),
    queryFn: listRecentActors,
    staleTime: 60_000,
  });
}

/** A person's name (the "Person" filter label for someone not in the recent list). */
export function personNameQueryOptions(userId: Id) {
  return queryOptions({
    queryKey: ownerAuditKeys.person(userId),
    queryFn: () => getPersonName(userId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
