/* Query layer for the team page and the Today team table. Components import from here. */
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  addTeamMember,
  getTeamDetail,
  removeTeamMember,
  searchMembersForTeam,
} from "@/features/team-detail/api";
import type { DateOnly, Id } from "@/features/types";

export type {
  MemberCandidate,
  TeamCoach,
  TeamDetail,
  TeamFeeStatus,
  TeamStudent,
} from "@/features/team-detail/api";

export const teamDetailKeys = {
  all: (academyId: Id) => ["academies", academyId, "teams"] as const,
  detail: (academyId: Id, teamId: Id, today: DateOnly) =>
    [...teamDetailKeys.all(academyId), teamId, "detail", today] as const,
  search: (
    academyId: Id,
    teamId: Id,
    role: "student" | "coach",
    query: string
  ) =>
    [
      ...teamDetailKeys.all(academyId),
      teamId,
      "candidates",
      role,
      query,
    ] as const,
};

export function teamDetailQueryOptions(
  academyId: Id,
  teamId: Id,
  today: DateOnly
) {
  return queryOptions({
    queryKey: teamDetailKeys.detail(academyId, teamId, today),
    queryFn: () => getTeamDetail(academyId, teamId, { today }),
  });
}

export function memberSearchQueryOptions(
  academyId: Id,
  teamId: Id,
  role: "student" | "coach",
  query: string
) {
  return queryOptions({
    queryKey: teamDetailKeys.search(academyId, teamId, role, query),
    queryFn: () => searchMembersForTeam(academyId, { teamId, query, role }),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

function useInvalidateAcademy(academyId: Id) {
  const queryClient = useQueryClient();
  // Rosters feed sessions and Today too, so refresh everything for the academy.
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "academies" && query.queryKey[1] === academyId,
    });
}

export function useAddTeamMember(academyId: Id) {
  const invalidate = useInvalidateAcademy(academyId);
  return useMutation({
    mutationFn: (input: { teamId: Id; memberId: Id }) =>
      addTeamMember(academyId, input),
    onSuccess: invalidate,
  });
}

export function useRemoveTeamMember(academyId: Id) {
  const invalidate = useInvalidateAcademy(academyId);
  return useMutation({
    mutationFn: (input: { teamId: Id; memberId: Id }) =>
      removeTeamMember(academyId, input),
    onSuccess: invalidate,
  });
}
