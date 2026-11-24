/* Query layer for the member detail pages. Components import from here, never api.ts. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  changeRole,
  type DetailScope,
  getCoachRecords,
  getCoachSummary,
  getMemberProfile,
  getStudentAttendance,
  getStudentFees,
  getStudentRecords,
  moveStudent,
  removeFromTeam,
  removeMember,
  setCoachTeams,
} from "@/features/member-detail/api";
import type { DateOnly, Id } from "@/features/types";

export type {
  AttendanceMonth,
  AttendanceSession,
  CoachRecordGroup,
  CoachRecords,
  CoachSession,
  CoachSummary,
  DetailScope,
  FeePayment,
  MemberProfile,
  ProfileTeam,
  StudentFees,
  StudentRecordItem,
  StudentRecords,
} from "@/features/member-detail/api";

const base = (academyId: Id, id: Id) =>
  ["academies", academyId, "member-detail", id] as const;

export const memberDetailKeys = {
  profile: (academyId: Id, id: Id, scope: DetailScope) =>
    [...base(academyId, id), "profile", scope] as const,
  attendance: (academyId: Id, id: Id, month: string, today: DateOnly) =>
    [...base(academyId, id), "attendance", month, today] as const,
  records: (academyId: Id, id: Id) =>
    [...base(academyId, id), "records"] as const,
  fees: (academyId: Id, id: Id, scope: DetailScope, today: DateOnly) =>
    [...base(academyId, id), "fees", scope, today] as const,
  coachSummary: (academyId: Id, id: Id, month: string, teamIds: Id[]) =>
    [...base(academyId, id), "coach-summary", month, teamIds] as const,
  coachRecords: (academyId: Id, id: Id) =>
    [...base(academyId, id), "coach-records"] as const,
};

export function memberProfileQueryOptions(
  academyId: Id,
  id: Id,
  scope: DetailScope
) {
  return queryOptions({
    queryKey: memberDetailKeys.profile(academyId, id, scope),
    queryFn: () => getMemberProfile(academyId, id, scope),
  });
}

export function studentAttendanceQueryOptions(
  academyId: Id,
  studentId: Id,
  params: { month: string; today: DateOnly; viewerId: Id; timeZone: string }
) {
  return queryOptions({
    queryKey: memberDetailKeys.attendance(
      academyId,
      studentId,
      params.month,
      params.today
    ),
    queryFn: () => getStudentAttendance(academyId, studentId, params),
  });
}

export function studentRecordsQueryOptions(academyId: Id, studentId: Id) {
  return queryOptions({
    queryKey: memberDetailKeys.records(academyId, studentId),
    queryFn: () => getStudentRecords(academyId, studentId),
  });
}

export function studentFeesQueryOptions(
  academyId: Id,
  studentId: Id,
  params: { today: DateOnly; scope: DetailScope }
) {
  return queryOptions({
    queryKey: memberDetailKeys.fees(
      academyId,
      studentId,
      params.scope,
      params.today
    ),
    queryFn: () => getStudentFees(academyId, studentId, params),
  });
}

export function coachSummaryQueryOptions(
  academyId: Id,
  coachId: Id,
  params: { month: string; today: DateOnly; teamIds: Id[] }
) {
  return queryOptions({
    queryKey: memberDetailKeys.coachSummary(
      academyId,
      coachId,
      params.month,
      params.teamIds
    ),
    queryFn: () => getCoachSummary(academyId, coachId, params),
  });
}

export function coachRecordsQueryOptions(
  academyId: Id,
  coachId: Id,
  params: { today: DateOnly }
) {
  return queryOptions({
    queryKey: memberDetailKeys.coachRecords(academyId, coachId),
    queryFn: () => getCoachRecords(academyId, coachId, params),
  });
}

type QueryKeyFilter = (key: readonly unknown[]) => boolean;

const isDetailQuery: QueryKeyFilter = (key) => key[2] === "member-detail";

/**
 * Rosters, roles and membership feed every list in the academy: refresh them all.
 * `quiet` queries are only marked stale, not refetched now: a page that is about to
 * change layout or go away would otherwise ask for data the server now refuses (404).
 */
function useRefreshAcademy() {
  const queryClient = useQueryClient();
  return async (academyId: Id, quiet?: QueryKeyFilter) => {
    const inAcademy = (key: readonly unknown[]) =>
      key[0] === "academies" && key[1] === academyId;
    await Promise.all([
      queryClient.invalidateQueries({
        predicate: (query) =>
          inAcademy(query.queryKey) && !quiet?.(query.queryKey),
      }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          inAcademy(query.queryKey) && Boolean(quiet?.(query.queryKey)),
        refetchType: "none",
      }),
    ]);
  };
}

export function useMoveStudent() {
  const refresh = useRefreshAcademy();
  return useMutation({
    mutationFn: moveStudent,
    onSettled: (_data, _error, input) => refresh(input.academyId),
  });
}

export function useSetCoachTeams() {
  const refresh = useRefreshAcademy();
  return useMutation({
    mutationFn: setCoachTeams,
    onSettled: (_data, _error, input) => refresh(input.academyId),
  });
}

/** The profile refetches (the page switches between student and coach layouts). */
export function useChangeRole() {
  const refresh = useRefreshAcademy();
  return useMutation({
    mutationFn: changeRole,
    onSuccess: (_data, input) =>
      refresh(
        input.academyId,
        (key) => isDetailQuery(key) && key[4] !== "profile"
      ),
  });
}

/** The page navigates away; its own queries are left stale, not refetched. */
export function useRemoveMember() {
  const refresh = useRefreshAcademy();
  return useMutation({
    mutationFn: removeMember,
    onSuccess: (_data, input) => refresh(input.academyId, isDetailQuery),
  });
}

/** A coach takes a student off their team; the page then goes to the team. */
export function useRemoveFromTeam() {
  const refresh = useRefreshAcademy();
  return useMutation({
    mutationFn: removeFromTeam,
    onSuccess: (_data, input) => refresh(input.academyId, isDetailQuery),
  });
}
