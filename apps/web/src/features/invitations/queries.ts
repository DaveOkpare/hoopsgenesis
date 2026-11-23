/*
 * Query layer for invitations. Components import from here, never from api.ts.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  acceptInvitation,
  getInvitation,
  getJoinSummary,
  type InvitationDetails,
} from "@/features/invitations/api";
import type { Id } from "@/features/types";

export type {
  InvitationDetails,
  JoinSummary,
} from "@/features/invitations/api";

export const invitationKeys = {
  detail: (invitationId: Id) => ["invitations", invitationId] as const,
  joinSummary: (invitationId: Id) =>
    ["invitations", invitationId, "join-summary"] as const,
};

export function invitationQueryOptions(invitationId: Id) {
  return queryOptions({
    queryKey: invitationKeys.detail(invitationId),
    queryFn: () => getInvitation({ invitationId }),
  });
}

export function joinSummaryQueryOptions(invitationId: Id) {
  return queryOptions({
    queryKey: invitationKeys.joinSummary(invitationId),
    queryFn: () => getJoinSummary({ invitationId }),
  });
}

/** Accept after sign-up or sign-in; marks the cached invitation as accepted. */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvitation,
    onSuccess: ({ invitation }) => {
      queryClient.setQueryData<InvitationDetails | null>(
        invitationKeys.detail(invitation.id),
        invitation
      );
    },
  });
}
