import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createTeam,
  listCoachCandidates,
  listMyTeams,
  listStudentsWithoutTeam,
  listTeams,
  TEAM_SPORT_STORED,
} from "@/features/teams/api";
import type { DateOnly, Id } from "@/features/types";

export type {
  CoachCandidate,
  MyTeam,
  TeamCoachInvite,
  TeamListItem,
  TeamNextSession,
} from "@/features/teams/api";

/** Whether the Create team form shows the Sport field (no sport column in real mode). */
export const teamSportStored: boolean = TEAM_SPORT_STORED;

export const teamListKeys = {
  list: (academyId: Id) => ["academies", academyId, "teams", "list"] as const,
  mine: (academyId: Id) => ["academies", academyId, "teams", "mine"] as const,
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

/** The coach's My teams cards (CO-10). */
export function myTeamsQueryOptions(academyId: Id, today: DateOnly) {
  return queryOptions({
    queryKey: [...teamListKeys.mine(academyId), today] as const,
    queryFn: () => listMyTeams(academyId, { today }),
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
      // Teams feed rosters, members, the dashboard and setup too: refresh the academy.
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "academies" &&
          query.queryKey[1] === team.academyId,
      });
    },
  });
}
