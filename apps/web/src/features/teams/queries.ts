import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createTeam,
  listCoachCandidates,
  listStudentsWithoutTeam,
  listTeams,
} from "@/features/teams/api";
import type { Id } from "@/features/types";

export type {
  CoachCandidate,
  TeamCoachInvite,
  TeamListItem,
} from "@/features/teams/api";

export const teamListKeys = {
  list: (academyId: Id) => ["academies", academyId, "teams", "list"] as const,
  withoutTeam: (academyId: Id) =>
    ["academies", academyId, "teams", "students-without-team"] as const,
  coachCandidates: (academyId: Id) =>
    ["academies", academyId, "teams", "coach-candidates"] as const,
};

export function teamListQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: teamListKeys.list(academyId),
    queryFn: () => listTeams(academyId),
  });
}

export function studentsWithoutTeamQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: teamListKeys.withoutTeam(academyId),
    queryFn: () => listStudentsWithoutTeam(academyId),
  });
}

export function coachCandidatesQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: teamListKeys.coachCandidates(academyId),
    queryFn: () => listCoachCandidates(academyId),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTeam,
    onSuccess: async (team) => {
      // Lists, rosters and the team page all live under this prefix.
      await queryClient.invalidateQueries({
        queryKey: ["academies", team.academyId, "teams"],
      });
    },
  });
}
