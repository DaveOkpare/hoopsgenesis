import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  cancelInvitation,
  getMemberCounts,
  getPlatformOwner,
  inviteMembers,
  listInvitations,
  listMembers,
  resendInvitation,
} from "@/features/members/api";
import type { Id } from "@/features/types";
import { appNow } from "@/lib/preview";

export type { InvitableRole, MemberCounts } from "@/features/members/api";

/** "Now" for relative dates ("sent 2 days ago"); the designs' moment in preview. */
export function useReferenceNow(): Date {
  return appNow();
}

export const memberKeys = {
  list: (academyId: Id) => ["academies", academyId, "members", "list"] as const,
  counts: (academyId: Id) =>
    ["academies", academyId, "members", "counts"] as const,
  invitations: (academyId: Id) =>
    ["academies", academyId, "invitations", "open"] as const,
};

export function membersQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: memberKeys.list(academyId),
    queryFn: () => listMembers(academyId),
  });
}

export function memberCountsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: memberKeys.counts(academyId),
    queryFn: () => getMemberCounts(academyId),
  });
}

export function invitationsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: memberKeys.invitations(academyId),
    queryFn: () => listInvitations(academyId),
  });
}

export function platformOwnerQueryOptions() {
  return queryOptions({
    queryKey: ["platform", "owner"] as const,
    queryFn: getPlatformOwner,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

function useRefreshInvites() {
  const queryClient = useQueryClient();
  return async (academyId: Id) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: memberKeys.invitations(academyId),
      }),
      queryClient.invalidateQueries({ queryKey: memberKeys.counts(academyId) }),
    ]);
  };
}

export function useInviteMembers() {
  const refresh = useRefreshInvites();
  return useMutation({
    mutationFn: inviteMembers,
    onSuccess: (_created, input) => refresh(input.academyId),
  });
}

export function useResendInvitation() {
  const refresh = useRefreshInvites();
  return useMutation({
    mutationFn: resendInvitation,
    onSuccess: (_invite, input) => refresh(input.academyId),
  });
}

export function useCancelInvitation() {
  const refresh = useRefreshInvites();
  return useMutation({
    mutationFn: cancelInvitation,
    onSuccess: (_invite, input) => refresh(input.academyId),
  });
}
